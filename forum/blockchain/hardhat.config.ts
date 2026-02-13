import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import path from "path";

// Load forum's .env.local when running from forum/blockchain (so deploy picks up BLOCKCHAIN_RPC_URL)
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config(); // then blockchain/.env if present

// Read private key from environment variable — never hardcode keys in source
const DEPLOYER_PRIVATE_KEY = process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY;

// Some Besu setups (e.g. Railway) reject gas price 0. Use 1 gwei for remote; override with BLOCKCHAIN_GAS_PRICE.
const BESU_GAS_PRICE = process.env.BLOCKCHAIN_GAS_PRICE
  ? parseInt(process.env.BLOCKCHAIN_GAS_PRICE, 10)
  : 1_000_000_000; // 1 gwei

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
    // Local Hardhat node (for testing — uses built-in accounts, no key needed)
    hardhat: {
      chainId: 31337,
    },
    // Local Besu (localhost or your Besu service URL — never use the forum app URL)
    besuLocal: {
      url: process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [process.env.BLOCKCHAIN_ISSUER_PRIVATE_KEY || ""].filter(Boolean),
      gasPrice: 0,
      timeout: 60_000,
    },
    // Remote Besu node (Railway, VPS, etc.) — set BLOCKCHAIN_RPC_URL to your Besu service URL
    besuDev: {
      url: process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [process.env.BLOCKCHAIN_ISSUER_PRIVATE_KEY || ""].filter(Boolean),
      gasPrice: BESU_GAS_PRICE,
      timeout: 60_000,
    },
    // Polygon Amoy testnet (for future public chain migration)
    polygonAmoy: {
      url: process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
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
