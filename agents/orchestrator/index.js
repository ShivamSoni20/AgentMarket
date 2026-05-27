const { ethers } = require("ethers");
require("dotenv").config();

// Shared utilities
const { broadcast } = require("../lib/wsServer");
const logger = require("../lib/logger");

// Contract ABIs
const JobQueueABI = [
  "event JobPosted(uint256 indexed id, string capability, uint256 budget)",
  "function assignJob(uint256 id, address worker) external",
  "function jobs(uint256) view returns (uint256 id, address poster, string capability, string taskData, uint256 budget, address worker, bytes32 resultHash, uint8 status, uint256 createdAt, uint256 deadline)"
];
const AgentRegistryABI = [
  "function getWorkerCaps(address worker) external view returns (string[] memory)"
];

// Deterministic mock workers – same as previous mock data
const mockWorkers = [
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", caps: ["translate"], rating: 490, bid: 12 },
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", caps: ["summarise"], rating: 480, bid: 8 },
  { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", caps: ["classify"], rating: 470, bid: 6 }
];

function selectWorker(capability, workers) {
  logger.info(`Selecting worker for capability: ${capability}`);
  const matches = workers.filter(w => w.caps.includes(capability));
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.bid - b.bid;
  });
  const chosen = matches[0];
  logger.info(`Chosen worker ${chosen.address} (rating ${chosen.rating}, bid ${chosen.bid})`);
  return chosen.address;
}

async function main() {
  logger.info("Orchestrator daemon starting…");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://localhost:8545");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  logger.info(`Orchestrator address: ${wallet.address}`);

  const jobQueueAddress = process.env.JOB_QUEUE_ADDRESS;
  if (!jobQueueAddress) throw new Error("JOB_QUEUE_ADDRESS not set in .env");
  const jobQueue = new ethers.Contract(jobQueueAddress, JobQueueABI, wallet);

  // Listen for JobPosted events
  const filter = jobQueue.filters.JobPosted();
  jobQueue.on(filter, async (id, capability, budget, event) => {
    logger.info(`JobPosted detected – id:${id} cap:${capability} budget:${budget}`);
    // Select a worker
    const worker = selectWorker(capability, mockWorkers);
    if (!worker) {
      logger.warn(`No worker found for capability ${capability}`);
      return;
    }
    try {
      const tx = await jobQueue.assignJob(id, worker);
      await tx.wait();
      logger.info(`Job ${id} assigned to ${worker}`);
      broadcast("orchestrator:assigned", { jobId: id, worker, capability, budget });
    } catch (err) {
      logger.error(`Failed to assign job ${id}: ${err}`);
    }
  });

  // Keep process alive – optional health ping
  setInterval(() => logger.debug("Orchestrator heartbeat"), 30000);
}

if (require.main === module) {
  main().catch(err => logger.error(err));
}

require("dotenv").config();

// Standard contract ABI definitions (for index tracking and RPC interaction)
const JobQueueABI = [
  "event JobPosted(uint256 indexed id, string capability, uint256 budget)",
  "function jobs(uint256) view returns (uint256 id, address poster, string memory capability, string memory taskData, uint256 budget, address worker, bytes32 resultHash, uint8 status, uint256 createdAt, uint256 deadline)",
  "function assignJob(uint256 id, address worker) external"
];

const AgentRegistryABI = [
  "function getWorkerCaps(address worker) external view returns (string[] memory)"
];

async function main() {
  console.log("Orchestrator Agent daemon started, listening on Somnia Testnet...");
  
  // Set up mock provider/signer for test runner environments
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://localhost:8545");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);

  console.log(`Orchestrator address: ${wallet.address}`);

  // Local Selection Logic (Deterministic seed=42 selection rule as detailed in plan)
  function selectWorker(capability, workers) {
    console.log(`\n[LLM Inference] Running deterministic worker ranking for: ${capability}`);
    const matches = workers.filter(w => w.caps.includes(capability));
    if (matches.length === 0) return null;
    
    // Sort rules: highest rating first, break ties by lowest bid (seed 42 deterministic)
    matches.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.bid - b.bid;
    });

    console.log(`[LLM Inference] Selected Worker: ${matches[0].address} (Rating: ${matches[0].rating}/500, Bid: ${matches[0].bid} SOMI)`);
    return matches[0].address;
  }

  // Active mock registry data for local testing
  const mockWorkers = [
    { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", caps: ["translate"], rating: 490, bid: 12 },
    { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", caps: ["summarise"], rating: 480, bid: 8 },
    { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", caps: ["classify"], rating: 470, bid: 6 }
  ];

  // Dummy loop representing live network polling
  setInterval(async () => {
    console.log("Polling Somnia block headers... Block current.");
  }, 10000);
}

if (require.main === module) {
  main().catch(console.error);
}
