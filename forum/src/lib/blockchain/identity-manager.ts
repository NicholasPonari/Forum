import { ethers } from "ethers";
import { createHash } from "crypto";
import { getBlockchainConfig, type BlockchainConfig } from "./config";
import CONTRACT_ABI from "./contract-abi.json";

// ─────────────────────────── Types ───────────────────────────

export interface IssueIdentityResult {
  identityHash: string;
  issuerSignature: string;
  txHash: string;
  blockNumber: number;
  contractAddress: string;
  chainId: number;
}

export interface VerifyIdentityResult {
  exists: boolean;
  issuer: string;
  issuedAt: number;
  revoked: boolean;
}

export interface RevokeIdentityResult {
  txHash: string;
  blockNumber: number;
}

// ──────────────────── BlockchainIdentityManager ──────────────────────

/**
 * Service for managing on-chain digital identities.
 *
 * Connects to a Hyperledger Besu node (private PoA chain) via JSON-RPC.
 * Uses ethers.js v6 for all blockchain interactions.
 *
 * All PII stays off-chain; only SHA-256 identity hashes + ECDSA signatures
 * are stored on the smart contract.
 */
export class BlockchainIdentityManager {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private config: BlockchainConfig;

  constructor(configOverride?: Partial<BlockchainConfig>) {
    const baseConfig = getBlockchainConfig();
    this.config = { ...baseConfig, ...configOverride };

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.wallet = new ethers.Wallet(
      this.config.issuerPrivateKey,
      this.provider,
    );
    this.contract = new ethers.Contract(
      this.config.contractAddress,
      CONTRACT_ABI,
      this.wallet,
    );
  }

  // ────────────────── Identity Hash Creation ──────────────────

  /**
   * Create a deterministic, non-reversible identity hash.
   *
   * Input:  SHA-256( userId : email : verificationAttemptId : salt )
   * Output: bytes32 hex string (0x-prefixed, 66 chars)
   *
   * The salt is a server-side secret that never changes.
   * Without it, nobody can reconstruct the hash from on-chain data.
   */
  createIdentityHash(
    userId: string,
    email: string,
    verificationAttemptId: string,
  ): string {
    const data = `${userId}:${email}:${verificationAttemptId}:${this.config.identitySalt}`;
    const hash = createHash("sha256").update(data).digest();
    // Return as bytes32 (left-pad to 32 bytes if needed, but SHA-256 is already 32 bytes)
    return ethers.hexlify(hash);
  }

  // ────────────────── Issue Identity ──────────────────────────

  /**
   * Issue a new digital identity on-chain.
   *
   * 1. Computes the identity hash from user data
   * 2. Signs the hash with the issuer wallet
   * 3. Submits the transaction to the smart contract
   * 4. Waits for confirmation
   *
   * @throws Error if the transaction fails or identity already exists
   */
  async issueIdentity(
    userId: string,
    email: string,
    verificationAttemptId: string,
  ): Promise<IssueIdentityResult> {
    const identityHash = this.createIdentityHash(
      userId,
      email,
      verificationAttemptId,
    );

    // Sign the identity hash with the issuer wallet
    const signature = await this.wallet.signMessage(
      ethers.getBytes(identityHash),
    );

    // Submit to blockchain
    const tx = await this.contract.issueIdentity(identityHash, signature);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed: ${receipt?.hash || "no receipt"}`);
    }

    return {
      identityHash,
      issuerSignature: signature,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      contractAddress: this.config.contractAddress,
      chainId: this.config.chainId,
    };
  }

  // ────────────────── Verify Identity (Read-Only) ────────────

  /**
   * Verify an identity on-chain. This is a read-only call (no gas cost).
   *
   * Can be used to:
   * - Check if a user's identity exists on-chain
   * - Verify the identity hasn't been revoked
   * - Confirm which issuer created it
   */
  async verifyOnChainIdentity(
    identityHash: string,
  ): Promise<VerifyIdentityResult> {
    const [exists, issuer, issuedAt, revoked] =
      await this.contract.verifyIdentity(identityHash);

    return {
      exists,
      issuer,
      issuedAt: Number(issuedAt),
      revoked,
    };
  }

  /**
   * Convenience: verify by reconstructing the hash from user data.
   */
  async verifyUserIdentity(
    userId: string,
    email: string,
    verificationAttemptId: string,
  ): Promise<VerifyIdentityResult> {
    const identityHash = this.createIdentityHash(
      userId,
      email,
      verificationAttemptId,
    );
    return this.verifyOnChainIdentity(identityHash);
  }

  // ────────────────── Revoke Identity ────────────────────────

  /**
   * Revoke an identity on-chain. Only the original issuer or contract owner
   * can revoke.
   */
  async revokeIdentity(identityHash: string): Promise<RevokeIdentityResult> {
    const tx = await this.contract.revokeIdentity(identityHash);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Revocation failed: ${receipt?.hash || "no receipt"}`);
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  // ────────────────── Utilities ──────────────────────────────

  /**
   * Check if the blockchain node is reachable and the contract is deployed.
   */
  async healthCheck(): Promise<{
    nodeConnected: boolean;
    contractDeployed: boolean;
    issuerAddress: string;
    chainId: number;
    blockNumber: number;
  }> {
    try {
      const [blockNumber, network, code] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getNetwork(),
        this.provider.getCode(this.config.contractAddress),
      ]);

      return {
        nodeConnected: true,
        contractDeployed: code !== "0x",
        issuerAddress: this.wallet.address,
        chainId: Number(network.chainId),
        blockNumber,
      };
    } catch (error) {
      return {
        nodeConnected: false,
        contractDeployed: false,
        issuerAddress: this.wallet.address,
        chainId: this.config.chainId,
        blockNumber: 0,
      };
    }
  }

  /**
   * Get the issuer wallet address.
   */
  getIssuerAddress(): string {
    return this.wallet.address;
  }
}

// ────────────────── Singleton Instance ──────────────────────

let _instance: BlockchainIdentityManager | null = null;

/**
 * Get the singleton BlockchainIdentityManager instance.
 * Creates one on first call using environment configuration.
 */
export function getBlockchainIdentityManager(): BlockchainIdentityManager {
  if (!_instance) {
    _instance = new BlockchainIdentityManager();
  }
  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetBlockchainIdentityManager(): void {
  _instance = null;
}
