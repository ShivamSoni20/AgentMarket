const { ethers } = require("ethers");
require("dotenv").config();

const logger = require("../lib/logger");
const config = require("../lib/config");

const AgentRegistryABI = [
  "function register(string[] calldata caps, uint256 bidPerJob) external payable",
  "function workers(address) external view returns (address owner, uint256 bidPerJob, uint256 stake, uint256 rating, uint256 jobsCompleted, bool active)"
];

const JobQueueABI = [
  "event JobAssigned(uint256 indexed id, address indexed worker)",
  "function nextJobId() external view returns (uint256)",
  "function jobs(uint256) view returns (uint256 id, address poster, string capability, string taskData, uint256 budget, address worker, bytes32 resultHash, string resultData, uint8 status, uint256 createdAt, uint256 deadline)",
  "function submitResult(uint256 id, bytes32 resultHash, string resultData) external"
];

class WorkerAgent {
  constructor(capability, bidPrice, privateKey, rpcUrl) {
    this.capability = capability;
    this.bidPrice = bidPrice;
    this.provider = new ethers.JsonRpcProvider(rpcUrl || "http://localhost:8545");
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  async initialize() {
    logger.info(`[Worker Start] Worker with capability "${this.capability}" online at address: ${this.wallet.address}`);
  }

  async executeTask(taskData) {
    logger.info(`[Task Received] Executing "${this.capability}" for input data: "${taskData}"`);
    if (process.env.AIML_API_KEY && process.env.AIML_API_KEY !== "your_aiml_api_key_here") {
      const response = await fetch("https://api.aimlapi.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AIML_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.AIML_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: `You are an AgentMarket ${this.capability} worker. Return only the completed task result.` },
            { role: "user", content: taskData }
          ]
        })
      });
      if (!response.ok) throw new Error(`AIML API failed: ${response.status}`);
      const json = await response.json();
      return json.choices?.[0]?.message?.content || "";
    }

    return `PROCESSED_RESULT: [${this.capability.toUpperCase()}] for ${taskData}`;
  }
}

async function main() {
  if (!config.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  if (!config.AGENT_REGISTRY_ADDRESS) throw new Error("AGENT_REGISTRY_ADDRESS not set in .env");
  if (!config.JOB_QUEUE_ADDRESS) throw new Error("JOB_QUEUE_ADDRESS not set in .env");

  const capability = process.env.WORKER_CAPABILITY || "translate";
  const bidPrice = BigInt(process.env.WORKER_BID || "5");
  const stake = ethers.parseEther(process.env.WORKER_STAKE || "0.01");
  const agent = new WorkerAgent(capability, bidPrice, config.PRIVATE_KEY, config.RPC_URL);

  await agent.initialize();

  const registry = new ethers.Contract(config.AGENT_REGISTRY_ADDRESS, AgentRegistryABI, agent.wallet);
  const jobQueue = new ethers.Contract(config.JOB_QUEUE_ADDRESS, JobQueueABI, agent.wallet);
  const workerInfo = await registry.workers(agent.wallet.address);

  if (!workerInfo.active) {
    logger.info(`Registering worker ${agent.wallet.address} for ${capability}`);
    const tx = await registry.register([capability], bidPrice, { value: stake });
    await tx.wait();
    logger.info(`Worker registered with stake ${ethers.formatEther(stake)} SOMI`);
  } else {
    logger.info(`Worker already registered with capability "${capability}"`);
  }

  const submittedJobs = new Set();

  async function pollAssignments() {
    const nextJobId = Number(await jobQueue.nextJobId());
    for (let jobId = 0; jobId < nextJobId; jobId++) {
      if (submittedJobs.has(jobId)) continue;
      const job = await jobQueue.jobs(jobId);
      const isMine = job.worker.toLowerCase() === agent.wallet.address.toLowerCase();
      const isReady = Number(job.status) === 1 && job.resultHash === ethers.ZeroHash;
      if (!isMine || !isReady) continue;

      try {
        logger.info(`Assigned job detected: ${jobId} (${job.capability})`);
        const result = await agent.executeTask(job.taskData);
        const resultHash = ethers.keccak256(ethers.toUtf8Bytes(result));
        const tx = await jobQueue.submitResult(jobId, resultHash, result);
        await tx.wait();
        submittedJobs.add(jobId);
        logger.info(`Submitted result for job ${jobId}: ${resultHash}`);
      } catch (err) {
        logger.error(`Worker failed job ${jobId}: ${err.message}`);
      }
    }
  }

  process.on('SIGINT', () => {
    logger.info('Received SIGINT - shutting down gracefully');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM - shutting down gracefully');
    process.exit(0);
  });
  setInterval(() => pollAssignments().catch(err => logger.error(`Worker poll failed: ${err.message}`)), 3000);
  setInterval(() => logger.debug("Worker heartbeat"), 30000);
  logger.info("Worker polling for assigned jobs...");
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { WorkerAgent, main };
