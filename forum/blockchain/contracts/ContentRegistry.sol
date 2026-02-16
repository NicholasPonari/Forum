// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ContentRegistry
 * @notice On-chain registry for Vox.Vote user-generated content.
 *         Stores hashes of issues, comments, and votes to ensure immutability.
 * @dev    Designed for a private Clique PoA Besu network (zero gas cost).
 */
contract ContentRegistry is Ownable, ReentrancyGuard {
    
    // ───────────────────────────── Types ─────────────────────────────

    struct ContentRecord {
        bytes32 contentHash;      // SHA-256 hash of the content data
        bytes32 userIdentityHash; // Link to the user's blockchain identity
        uint256 timestamp;        // Block timestamp
        string contentType;       // "issue", "comment", "vote", etc.
        bool isDeleted;           // Tombstone flag
    }

    // ───────────────────────────── State ─────────────────────────────

    /// @notice contentId (UUID hash) => ContentRecord
    mapping(bytes32 => ContentRecord) private _contentRecords;

    /// @notice address => whether authorized to record content (e.g. backend service)
    mapping(address => bool) public authorizedRecorders;

    /// @notice Total number of content records
    uint256 public totalContentRecords;

    // ───────────────────────────── Events ────────────────────────────

    event ContentRecorded(
        bytes32 indexed contentId,
        bytes32 indexed contentHash,
        bytes32 indexed userIdentityHash,
        string contentType,
        uint256 timestamp
    );

    event ContentDeleted(
        bytes32 indexed contentId,
        address indexed deleter,
        uint256 timestamp
    );

    event RecorderAuthorized(address indexed recorder);
    event RecorderDeauthorized(address indexed recorder);

    // ──────────────────────────── Errors ─────────────────────────────

    error NotAuthorizedRecorder();
    error ContentAlreadyExists();
    error ContentDoesNotExist();
    error ContentAlreadyDeleted();

    // ──────────────────────────── Modifiers ──────────────────────────

    modifier onlyAuthorizedRecorder() {
        if (!authorizedRecorders[msg.sender]) revert NotAuthorizedRecorder();
        _;
    }

    // ─────────────────────────── Constructor ─────────────────────────

    constructor(address initialOwner) Ownable(initialOwner) {
        authorizedRecorders[initialOwner] = true;
        emit RecorderAuthorized(initialOwner);
    }

    // ──────────────────────── Recorder Management ─────────────────────

    function authorizeRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = true;
        emit RecorderAuthorized(recorder);
    }

    function deauthorizeRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = false;
        emit RecorderDeauthorized(recorder);
    }

    // ────────────────────── Content Operations ─────────────────────

    /**
     * @notice Record a new piece of content on-chain
     * @param _contentId      Hash of the UUID of the content (to fit in bytes32)
     * @param _contentHash    SHA-256 hash of the content data
     * @param _userIdentityHash Link to the user's identity
     * @param _contentType    Type string (e.g. "issue")
     */
    function recordContent(
        bytes32 _contentId,
        bytes32 _contentHash,
        bytes32 _userIdentityHash,
        string calldata _contentType
    ) external onlyAuthorizedRecorder nonReentrant {
        if (_contentRecords[_contentId].timestamp != 0) {
            revert ContentAlreadyExists();
        }

        _contentRecords[_contentId] = ContentRecord({
            contentHash: _contentHash,
            userIdentityHash: _userIdentityHash,
            timestamp: block.timestamp,
            contentType: _contentType,
            isDeleted: false
        });

        unchecked {
            totalContentRecords++;
        }

        emit ContentRecorded(
            _contentId,
            _contentHash,
            _userIdentityHash,
            _contentType,
            block.timestamp
        );
    }

    /**
     * @notice Mark content as deleted (tombstone) without removing the record
     * @param _contentId Hash of the UUID of the content
     */
    function deleteContent(bytes32 _contentId) external onlyAuthorizedRecorder nonReentrant {
        if (_contentRecords[_contentId].timestamp == 0) revert ContentDoesNotExist();
        if (_contentRecords[_contentId].isDeleted) revert ContentAlreadyDeleted();

        _contentRecords[_contentId].isDeleted = true;

        emit ContentDeleted(_contentId, msg.sender, block.timestamp);
    }

    /**
     * @notice Verify content integrity
     * @param _contentId Hash of the UUID of the content
     */
    function verifyContent(bytes32 _contentId) external view returns (
        bool exists,
        bytes32 contentHash,
        bytes32 userIdentityHash,
        uint256 timestamp,
        string memory contentType,
        bool isDeleted
    ) {
        ContentRecord storage record = _contentRecords[_contentId];
        return (
            record.timestamp > 0,
            record.contentHash,
            record.userIdentityHash,
            record.timestamp,
            record.contentType,
            record.isDeleted
        );
    }
}
