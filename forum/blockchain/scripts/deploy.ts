import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying DigitalIdentityRegistry...");
  console.log("  Deployer address:", deployer.address);
  console.log(
    "  Deployer balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH",
  );

  const network = await ethers.provider.getNetwork();
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);

  // Deploy the contract with deployer as initial owner
  const DigitalIdentityRegistry = await ethers.getContractFactory(
    "DigitalIdentityRegistry",
  );
  console.log("\n  Submitting deployment transaction...");
  const registry = await DigitalIdentityRegistry.deploy(deployer.address);
  console.log("  Waiting for confirmation (node must be mining blocks)...");
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();

  console.log("\nDigitalIdentityRegistry deployed!");
  console.log("  Contract address:", contractAddress);
  console.log("  Owner / Initial issuer:", deployer.address);

  // Verify the deployer is an authorized issuer
  const isIssuer = await registry.authorizedIssuers(deployer.address);
  console.log("  Deployer is authorized issuer:", isIssuer);

  console.log("\n--- Environment Variables ---");
  console.log(`BLOCKCHAIN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`BLOCKCHAIN_CHAIN_ID=${network.chainId}`);
  console.log(
    "\nAdd these to your forum/.env.local file to connect the Next.js app.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
