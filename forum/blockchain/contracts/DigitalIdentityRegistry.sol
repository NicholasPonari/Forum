// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DigitalIdentityRegistry
 * @notice On-chain registry for Vox.Vote verified digital identities.
 *         Stores only identity hashes and issuer signatures — no PII on-chain.
 * @dev    Designed for a private Clique PoA Besu network (zero gas cost).
 *         Migration to public Polygon is possible without code changes.
 */
contract DigitalIdentityRegistry is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ───────────────────────────── Types ─────────────────────────────

    struct Identity {
        bytes32 identityHash;     // SHA-256 hash of off-chain identity data
        address issuer;           // Address of the authorized issuer
        uint256 issuedAt;         // Block timestamp of issuance
        bool revoked;             // Whether the identity has been revoked
        bytes issuerSignature;    // ECDSA signature by the issuer
    }

    // ───────────────────────────── State ─────────────────────────────

    /// @notice identityHash => Identity record
    mapping(bytes32 => Identity) private _identities;

    /// @notice address => whether authorized to issue identities
    mapping(address => bool) public authorizedIssuers;

    /// @notice Total number of identities issued (not including revoked)
    uint256 public totalIdentities;

    // ───────────────────────────── Events ────────────────────────────

    event IdentityIssued(
        bytes32 indexed identityHash,
        address indexed issuer,
        uint256 timestamp
    );

    event IdentityRevoked(
        bytes32 indexed identityHash,
        address indexed revoker,
        uint256 timestamp
    );

    event IssuerAuthorized(address indexed issuer);
    event IssuerDeauthorized(address indexed issuer);

    // ──────────────────────────── Errors ─────────────────────────────

    error NotAuthorizedIssuer();
    error IdentityAlreadyExists();
    error IdentityDoesNotExist();
    error IdentityAlreadyRevoked();
    error InvalidSignature();
    error NotAuthorizedToRevoke();

    // ──────────────────────────── Modifiers ──────────────────────────

    modifier onlyAuthorizedIssuer() {
        if (!authorizedIssuers[msg.sender]) revert NotAuthorizedIssuer();
        _;
    }

    // ─────────────────────────── Constructor ─────────────────────────

    /**
     * @param initialOwner The address that will own this contract
     *                     (also becomes the first authorized issuer)
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        authorizedIssuers[initialOwner] = true;
        emit IssuerAuthorized(initialOwner);
    }

    // ──────────────────────── Issuer Management ─────────────────────

    /**
     * @notice Authorize a new address to issue identities
     * @param issuer The address to authorize
     */
    function authorizeIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = true;
        emit IssuerAuthorized(issuer);
    }

    /**
     * @notice Remove issuer authorization
     * @param issuer The address to deauthorize
     */
    function deauthorizeIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = false;
        emit IssuerDeauthorized(issuer);
    }

    // ────────────────────── Identity Operations ─────────────────────

    /**
     * @notice Issue a new digital identity on-chain
     * @param _identityHash  The SHA-256 hash of the off-chain identity data
     * @param _issuerSignature  ECDSA signature of the identity hash by the issuer
     *
     * Requirements:
     * - Caller must be an authorized issuer
     * - Identity hash must not already exist
     * - Signature must recover to the caller's address
     */
    function issueIdentity(
        bytes32 _identityHash,
        bytes calldata _issuerSignature
    ) external onlyAuthorizedIssuer nonReentrant {
        if (_identities[_identityHash].issuedAt != 0) {
            revert IdentityAlreadyExists();
        }

        // Verify the signature was created by the calling issuer
        bytes32 ethSignedHash = _identityHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedHash.recover(_issuerSignature);
        if (recoveredSigner != msg.sender) {
            revert InvalidSignature();
        }

        _identities[_identityHash] = Identity({
            identityHash: _identityHash,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            revoked: false,
            issuerSignature: _issuerSignature
        });

        unchecked {
            totalIdentities++;
        }

        emit IdentityIssued(_identityHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Verify whether an identity exists and retrieve its metadata
     * @param _identityHash The identity hash to look up
     * @return exists    Whether the identity was ever issued
     * @return issuer    The address that issued it
     * @return issuedAt  Timestamp of issuance
     * @return revoked   Whether it has been revoked
     */
    function verifyIdentity(
        bytes32 _identityHash
    )
        external
        view
        returns (
            bool exists,
            address issuer,
            uint256 issuedAt,
            bool revoked
        )
    {
        Identity storage identity = _identities[_identityHash];
        return (
            identity.issuedAt > 0,
            identity.issuer,
            identity.issuedAt,
            identity.revoked
        );
    }

    /**
     * @notice Retrieve the full on-chain identity record
     * @param _identityHash The identity hash to look up
     * @return The full Identity struct
     */
    function getIdentity(
        bytes32 _identityHash
    ) external view returns (Identity memory) {
        if (_identities[_identityHash].issuedAt == 0) {
            revert IdentityDoesNotExist();
        }
        return _identities[_identityHash];
    }

    /**
     * @notice Revoke an issued identity
     * @param _identityHash The identity hash to revoke
     *
     * Requirements:
     * - Identity must exist
     * - Identity must not already be revoked
     * - Caller must be the original issuer or the contract owner
     */
    function revokeIdentity(
        bytes32 _identityHash
    ) external nonReentrant {
        Identity storage identity = _identities[_identityHash];

        if (identity.issuedAt == 0) revert IdentityDoesNotExist();
        if (identity.revoked) revert IdentityAlreadyRevoked();
        if (identity.issuer != msg.sender && msg.sender != owner()) {
            revert NotAuthorizedToRevoke();
        }

        identity.revoked = true;

        unchecked {
            totalIdentities--;
        }

        emit IdentityRevoked(_identityHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Verify an issuer signature off-chain style
     * @param _identityHash The hash that was signed
     * @param _signature    The signature to verify
     * @return signer       The recovered signer address
     */
    function recoverSigner(
        bytes32 _identityHash,
        bytes calldata _signature
    ) external pure returns (address signer) {
        bytes32 ethSignedHash = _identityHash.toEthSignedMessageHash();
        return ethSignedHash.recover(_signature);
    }
}
