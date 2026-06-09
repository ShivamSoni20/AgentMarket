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
  const [deployer] = await hre.ethers.getSigners();
  const orchestratorAddress = process.env.ORCHESTRATOR_ADDRESS || deployer.address;
  const auditorAddress = process.env.AUDITOR_ADDRESS || deployer.address;
  const auditWindow = Number(process.env.AUDIT_WINDOW_SECONDS || "60");

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

  // 4. Deploy DisputeResolver
  const DisputeResolver = await hre.ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy(
    registryAddress,
    jobQueueAddress,
    escrowAddress,
    auditorAddress
  );
  await disputeResolver.waitForDeployment();
  const disputeResolverAddress = await disputeResolver.getAddress();
  console.log(`DisputeResolver deployed to: ${disputeResolverAddress}`);

  // Configure permissions
  console.log("Configuring contracts authorization...");
  await escrow.setAuthorized(jobQueueAddress, true);
  await jobQueue.setEscrow(escrowAddress);
  await jobQueue.setAuditWindow(auditWindow);
  await jobQueue.setOrchestrator(orchestratorAddress);
  await escrow.setOrchestrator(orchestratorAddress);
  console.log("Configuration complete.");
  await registry.setAuthorized(orchestratorAddress, true);
  console.log("Orchestrator authorized on AgentRegistry for incrementJobs.");
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
    DisputeResolver: disputeResolverAddress,
    Orchestrator: orchestratorAddress,
    Auditor: auditorAddress,
    AuditWindowSeconds: auditWindow
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
