const hre = require("hardhat");

async function main() {
  console.log("Starting deployment of AgentMarket smart contracts...");

  // 1. Deploy AgentRegistry
  const AgentRegistry = await hre.ethers.getContractFactory("AgentRegistry");
  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`AgentRegistry deployed to: ${registryAddress}`);

  // 2. Deploy JobQueue
  const JobQueue = await hre.ethers.getContractFactory("JobQueue");
  const jobQueue = await JobQueue.deploy();
  await jobQueue.waitForDeployment();
  const jobQueueAddress = await jobQueue.getAddress();
  console.log(`JobQueue deployed to: ${jobQueueAddress}`);

  // 3. Deploy EscrowPayment
  const EscrowPayment = await hre.ethers.getContractFactory("EscrowPayment");
  const escrow = await EscrowPayment.deploy();
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`EscrowPayment deployed to: ${escrowAddress}`);

  // 4. Deploy DisputeResolver (auditor address set as owner for mock/test convenience)
  const [deployer] = await hre.ethers.getSigners();
  const DisputeResolver = await hre.ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy(
    registryAddress,
    jobQueueAddress,
    escrowAddress,
    deployer.address // Set deployer as default auditor for simplicity in local setups
  );
  await disputeResolver.waitForDeployment();
  const disputeResolverAddress = await disputeResolver.getAddress();
  console.log(`DisputeResolver deployed to: ${disputeResolverAddress}`);

  // Configure permissions
  console.log("Configuring contracts authorization...");
  await jobQueue.setOrchestrator(deployer.address);
  await escrow.setOrchestrator(deployer.address);
  console.log("Configuration complete.");

  console.log("\nDeployment summary:");
  console.log({
    AgentRegistry: registryAddress,
    JobQueue: jobQueueAddress,
    EscrowPayment: escrowAddress,
    DisputeResolver: disputeResolverAddress
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
