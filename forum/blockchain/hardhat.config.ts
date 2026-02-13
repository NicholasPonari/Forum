import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";

// Default dev private key (Hardhat account #0) - NEVER use in production
const DEV_PRIVATE_KEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local Hardhat node (for testing)
    hardhat: {
      chainId: 31337,
    },
    // Local Besu private network
    besuLocal: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: [DEV_PRIVATE_KEY],
      gasPrice: 0,
    },
    // Remote Besu node (e.g., on a VPS)
    besuDev: {
      url: process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY
        ? [process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY]
        : [DEV_PRIVATE_KEY],
      gasPrice: 0,
    },
    // Polygon Amoy testnet (for future public chain migration)
    polygonAmoy: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY
        ? [process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
