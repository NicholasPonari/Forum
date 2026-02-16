/**
 * Blockchain configuration for the Vox.Vote identity system.
 *
 * Reads from environment variables. In development, defaults to the
 * local Besu node with the Hardhat account #0 dev key.
 */

export interface BlockchainConfig {
  /** JSON-RPC URL for the Besu node */
  rpcUrl: string;
  /** Private key of the issuer wallet (hex, with or without 0x prefix) */
  issuerPrivateKey: string;
  /** Deployed DigitalIdentityRegistry contract address */
  contractAddress: string;
  /** Deployed ContentRegistry contract address */
  contentContractAddress: string;
  /** Chain ID of the blockchain network */
  chainId: number;
  /** Secret salt used to generate identity hashes (never changes) */
  identitySalt: string;
  /** Gas price in wei for txs (some nodes e.g. Railway reject 0; use 1 gwei if needed) */
  gasPriceWei: number;
}

// Default dev values (Hardhat account #0 — NEVER use in production)
const DEV_PRIVATE_KEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let _config: BlockchainConfig | null = null;

export function getBlockchainConfig(): BlockchainConfig {
  if (_config) return _config;

  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
  const issuerPrivateKey =
    process.env.BLOCKCHAIN_ISSUER_PRIVATE_KEY || DEV_PRIVATE_KEY;
  const contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS || "";
  const contentContractAddress =
    process.env.BLOCKCHAIN_CONTENT_REGISTRY_ADDRESS || "";
  const chainId = parseInt(process.env.BLOCKCHAIN_CHAIN_ID || "1337", 10);
  const identitySalt =
    process.env.BLOCKCHAIN_IDENTITY_SALT || "voxvote-dev-salt";
  const gasPriceWei = process.env.BLOCKCHAIN_GAS_PRICE
    ? parseInt(process.env.BLOCKCHAIN_GAS_PRICE, 10)
    : 1_000_000_000; // 1 gwei (use 0 for local Besu with --min-gas-price=0)

  if (!contractAddress) {
    console.warn(
      "[BlockchainConfig] BLOCKCHAIN_CONTRACT_ADDRESS is not set. " +
        "Deploy the contract first and set the env var.",
    );
  }

  if (!contentContractAddress) {
    console.warn(
      "[BlockchainConfig] BLOCKCHAIN_CONTENT_REGISTRY_ADDRESS is not set. " +
        "Deploy the content registry first and set the env var.",
    );
  }

  _config = {
    rpcUrl,
    issuerPrivateKey,
    contractAddress,
    contentContractAddress,
    chainId,
    identitySalt,
    gasPriceWei,
  };

  return _config;
}

/**
 * Reset cached config (useful for testing).
 */
export function resetBlockchainConfig(): void {
  _config = null;
}
