import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying ContentRegistry...");
  console.log("  Deployer address:", deployer.address);
  
  const network = await ethers.provider.getNetwork();
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);

  // Deploy the contract with deployer as initial owner
  const ContentRegistry = await ethers.getContractFactory("ContentRegistry");
  console.log("\n  Submitting deployment transaction...");
  const registry = await ContentRegistry.deploy(deployer.address);
  console.log("  Waiting for confirmation...");
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();

  console.log("\nContentRegistry deployed!");
  console.log("  Contract address:", contractAddress);
  console.log("  Owner / Authorized Recorder:", deployer.address);

  // Verify the deployer is an authorized recorder
  const isRecorder = await registry.authorizedRecorders(deployer.address);
  console.log("  Deployer is authorized recorder:", isRecorder);

  console.log("\n--- Environment Variables ---");
  console.log(`BLOCKCHAIN_CONTENT_REGISTRY_ADDRESS=${contractAddress}`);
  console.log("\nAdd this to your forum/.env.local file.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
