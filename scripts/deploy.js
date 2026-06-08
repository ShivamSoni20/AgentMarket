/**
 * Deploy AgentMarket contracts.
 *
 * Local:   npx hardhat run scripts/deploy.js --network localhost
 * Testnet: npx hardhat run scripts/deploy.js --network somnia-testnet
 *
 * After deploy, copy the printed addresses into your .env file.
 */
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
  // NOTE: In production, call jobQueue.setOrchestrator(orchestratorAgentWalletAddress)
  // using the same address as PRIVATE_KEY in agents/.env
  await escrow.setAuthorized(jobQueueAddress, true);
  await jobQueue.setEscrow(escrowAddress);
  await jobQueue.setOrchestrator(deployer.address); // deployer acts as orchestrator agent for testing
  await escrow.setOrchestrator(deployer.address);
  console.log("Configuration complete.");
  await registry.setAuthorized(deployer.address, true);
  console.log("Orchestrator/deployer re-authorized on AgentRegistry for incrementJobs.");
  console.log("Transferring AgentRegistry ownership to DisputeResolver...");
  await registry.transferOwnership(disputeResolverAddress);
  console.log("DisputeResolver authorized on AgentRegistry.");
  console.log("Authorizing DisputeResolver on JobQueue...");
  await jobQueue.setAuthorized(disputeResolverAddress, true);
  console.log("DisputeResolver authorized on JobQueue.");
  console.log("Setting DisputeResolver as EscrowPayment orchestrator...");
  await escrow.setAuthorized(disputeResolverAddress, true);
  console.log("DisputeResolver authorized on EscrowPayment.");

  console.log("\nDeployment summary:");
  console.log({
    AgentRegistry: registryAddress,
    JobQueue: jobQueueAddress,
    EscrowPayment: escrowAddress,
    DisputeResolver: disputeResolverAddress
  });

  const fs = require("fs");
  const envAddresses = [
    `AGENT_REGISTRY_ADDRESS=${registryAddress}`,
    `JOB_QUEUE_ADDRESS=${jobQueueAddress}`,
    `ESCROW_PAYMENT_ADDRESS=${escrowAddress}`,
    `DISPUTE_RESOLVER_ADDRESS=${disputeResolverAddress}`
  ].join("\n");
  fs.writeFileSync("deployed-addresses.txt", envAddresses + "\n");
  console.log("\nAddresses also written to deployed-addresses.txt — copy these into your .env");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
