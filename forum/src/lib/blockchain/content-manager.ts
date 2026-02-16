import { ethers } from "ethers";
import { createHash } from "crypto";
import { getBlockchainConfig, type BlockchainConfig } from "./config";
import CONTENT_REGISTRY_ABI from "./content-registry-abi.json";

// ─────────────────────────── Types ───────────────────────────

export interface RecordContentResult {
  txHash: string;
  blockNumber: number;
  contentHash: string;
  contentIdHash: string;
}

export interface VerifyContentResult {
  exists: boolean;
  contentHash: string;
  userIdentityHash: string;
  timestamp: number;
  contentType: string;
  isDeleted: boolean;
}

export type ContentType = "issue" | "comment" | "vote" | "comment_vote";

// ──────────────────── BlockchainContentManager ──────────────────────

/**
 * Service for managing on-chain content records.
 *
 * Connects to a Hyperledger Besu node (private PoA chain) via JSON-RPC.
 * Uses ethers.js v6 for all blockchain interactions.
 */
export class BlockchainContentManager {
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
    
    if (!this.config.contentContractAddress) {
        throw new Error("BlockchainContentManager: contentContractAddress is not configured.");
    }

    this.contract = new ethers.Contract(
      this.config.contentContractAddress,
      CONTENT_REGISTRY_ABI,
      this.wallet,
    );
  }

  // ────────────────── Hashing Utilities ──────────────────────────

  /**
   * Helper to hash a UUID to a bytes32 string (sha256).
   * Used to generate the `contentId` for the contract.
   */
  hashUuid(uuid: string): string {
    const hash = createHash("sha256").update(uuid).digest();
    return ethers.hexlify(hash);
  }

  /**
   * Compute hash for an Issue.
   * Format: issue:{id}:{title}:{narrative}:{type}:{topic}:{user_id}:{created_at}
   */
  computeIssueHash(
    id: string,
    title: string,
    narrative: string,
    type: string,
    topic: string,
    userId: string,
    createdAt: string
  ): string {
    // Normalize nulls/undefined to empty strings if necessary, but strict typing suggests they are strings.
    // Ensure consistent separators.
    const data = `issue:${id}:${title}:${narrative}:${type}:${topic}:${userId}:${createdAt}`;
    return ethers.hexlify(createHash("sha256").update(data).digest());
  }

  /**
   * Compute hash for a Comment.
   * Format: comment:{id}:{content}:{issue_id}:{user_id}:{created_at}
   */
  computeCommentHash(
    id: string,
    content: string,
    issueId: string,
    userId: string,
    createdAt: string
  ): string {
    const data = `comment:${id}:${content}:${issueId}:${userId}:${createdAt}`;
    return ethers.hexlify(createHash("sha256").update(data).digest());
  }

  /**
   * Compute hash for an Issue Vote.
   * Format: vote:{issue_id}:{user_id}:{value}:{updated_at}
   */
  computeVoteHash(
    issueId: string,
    userId: string,
    value: number,
    updatedAt: string
  ): string {
    const data = `vote:${issueId}:${userId}:${value}:${updatedAt}`;
    return ethers.hexlify(createHash("sha256").update(data).digest());
  }

  /**
   * Compute hash for a Comment Vote.
   * Format: comment_vote:{comment_id}:{user_id}:{value}:{updated_at}
   */
  computeCommentVoteHash(
    commentId: string,
    userId: string,
    value: number,
    updatedAt: string
  ): string {
    const data = `comment_vote:${commentId}:${userId}:${value}:${updatedAt}`;
    return ethers.hexlify(createHash("sha256").update(data).digest());
  }

  // ────────────────── Record Content ─────────────────────────────

  /**
   * Record content on the blockchain.
   * 
   * @param contentIdUuid The UUID of the content (Issue ID, Comment ID, etc.)
   * @param contentHash The computed SHA-256 hash of the content data
   * @param userIdentityHash The user's on-chain identity hash
   * @param contentType The type of content ("issue", "comment", "vote")
   */
  async recordContent(
    contentIdUuid: string,
    contentHash: string,
    userIdentityHash: string,
    contentType: ContentType
  ): Promise<RecordContentResult> {
    const contentIdHash = this.hashUuid(contentIdUuid);

    // Submit transaction
    const tx = await this.contract.recordContent(
      contentIdHash,
      contentHash,
      userIdentityHash,
      contentType,
      {
        gasPrice: this.config.gasPriceWei,
      }
    );
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Record content transaction failed: ${receipt?.hash || "no receipt"}`);
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      contentHash,
      contentIdHash,
    };
  }

  // ────────────────── Verify Content ─────────────────────────────

  /**
   * Verify content on-chain.
   * 
   * @param contentIdUuid The UUID of the content to verify
   */
  async verifyContent(contentIdUuid: string): Promise<VerifyContentResult> {
    const contentIdHash = this.hashUuid(contentIdUuid);
    const [exists, contentHash, userIdentityHash, timestamp, contentType, isDeleted] =
      await this.contract.verifyContent(contentIdHash);

    return {
      exists,
      contentHash,
      userIdentityHash,
      timestamp: Number(timestamp),
      contentType,
      isDeleted,
    };
  }

  // ────────────────── Utilities ──────────────────────────────

  async healthCheck(): Promise<{
    nodeConnected: boolean;
    contractDeployed: boolean;
    recorderAddress: string;
    chainId: number;
    blockNumber: number;
  }> {
    try {
      const [blockNumber, network, code] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getNetwork(),
        this.provider.getCode(this.config.contentContractAddress),
      ]);

      return {
        nodeConnected: true,
        contractDeployed: code !== "0x",
        recorderAddress: this.wallet.address,
        chainId: Number(network.chainId),
        blockNumber,
      };
    } catch (error) {
      return {
        nodeConnected: false,
        contractDeployed: false,
        recorderAddress: this.wallet.address,
        chainId: this.config.chainId,
        blockNumber: 0,
      };
    }
  }
}

// ────────────────── Singleton Instance ──────────────────────

let _instance: BlockchainContentManager | null = null;

export function getBlockchainContentManager(): BlockchainContentManager {
  if (!_instance) {
    _instance = new BlockchainContentManager();
  }
  return _instance;
}

export function resetBlockchainContentManager(): void {
  _instance = null;
}
