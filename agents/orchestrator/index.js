const { ethers } = require("ethers");
require("dotenv").config();

const { broadcast, getWss } = require("../lib/wsServer");
const logger = require("../lib/logger");
const config = require("../lib/config");

const JobQueueABI = [
  "event JobPosted(uint256 indexed id, string capability, uint256 budget)",
  "event ResultSubmitted(uint256 indexed id, bytes32 resultHash)",
  "function assignJob(uint256 id, address worker) external",
  "function completeJob(uint256 id) external",
  "function nextJobId() external view returns (uint256)",
  "function auditWindow() external view returns (uint256)",
  "function jobs(uint256) view returns (uint256 id, address poster, string capability, string taskData, uint256 budget, address worker, bytes32 resultHash, string resultURI, uint8 status, uint256 createdAt, uint256 deadline, uint256 submittedAt)"
];

const AgentRegistryABI = [
  "function getWorkerCaps(address worker) external view returns (string[] memory)",
  "function workerList(uint256) external view returns (address)",
  "function workers(address) external view returns (address owner, uint256 bidPerJob, uint256 stake, uint256 rating, uint256 jobsCompleted, bool active)",
  "function incrementJobs(address worker) external"
];

const SCAN_WINDOW = Number(process.env.ORCHESTRATOR_SCAN_WINDOW || "200");

async function getActiveWorkers(registry) {
  const workers = [];
  let i = 0;
  while (true) {
    try {
      const addr = await registry.workerList(i);
      const w = await registry.workers(addr);
      if (w.active) {
        const caps = await registry.getWorkerCaps(addr);
        workers.push({ address: addr, caps, rating: Number(w.rating), bid: Number(w.bidPerJob) });
      }
      i++;
    } catch {
      break;
    }
  }
  return workers;
}

function selectWorker(capability, workers) {
  logger.info(`[LLM Inference] Deterministic worker ranking for: ${capability}`);
  const matches = workers.filter(w => w.caps.includes(capability));
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.rating !== a.rating ? b.rating - a.rating : a.bid - b.bid);
  logger.info(`[LLM Inference] Selected ${matches[0].address} (rating ${matches[0].rating}, bid ${matches[0].bid})`);
  return matches[0].address;
}

async function assignWithRetry(jobQueue, id, worker, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const tx = await jobQueue.assignJob(id, worker);
      await tx.wait();
      return tx;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = attempt * 2000;
      logger.warn(`assignJob attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function completeWithRetry(jobQueue, id, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const tx = await jobQueue.completeJob(id);
      await tx.wait();
      return tx;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = attempt * 2000;
      logger.warn(`completeJob attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function main() {
  if (!config.ORCHESTRATOR_PRIVATE_KEY) throw new Error("ORCHESTRATOR_PRIVATE_KEY or PRIVATE_KEY not set in .env");
  if (!config.JOB_QUEUE_ADDRESS) throw new Error("JOB_QUEUE_ADDRESS not set in .env");
  if (!config.AGENT_REGISTRY_ADDRESS) throw new Error("AGENT_REGISTRY_ADDRESS not set in .env");

  logger.info("Orchestrator daemon starting…");
  getWss();
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const wallet = new ethers.Wallet(config.ORCHESTRATOR_PRIVATE_KEY, provider);
  logger.info(`Orchestrator address: ${wallet.address}`);

  const jobQueue = new ethers.Contract(config.JOB_QUEUE_ADDRESS, JobQueueABI, wallet);
  const registry = new ethers.Contract(config.AGENT_REGISTRY_ADDRESS, AgentRegistryABI, provider);
  const registryWriter = new ethers.Contract(config.AGENT_REGISTRY_ADDRESS, AgentRegistryABI, wallet);
  const assignedJobs = new Set();
  const completedJobs = new Set();

  async function pollJobs() {
    const nextJobId = Number(await jobQueue.nextJobId());
    const auditWindow = Number(await jobQueue.auditWindow());
    const now = Math.floor(Date.now() / 1000);
    for (let jobId = Math.max(0, nextJobId - SCAN_WINDOW); jobId < nextJobId; jobId++) {
      const job = await jobQueue.jobs(jobId);

      if (Number(job.status) === 0 && !assignedJobs.has(jobId)) {
        logger.info(`Open job detected – id:${jobId} cap:${job.capability} budget:${job.budget}`);
        try {
          const workers = await getActiveWorkers(registry);
          const worker = selectWorker(job.capability, workers);
          if (!worker) { logger.warn(`No worker for capability ${job.capability}`); continue; }
          await assignWithRetry(jobQueue, jobId, worker);
          assignedJobs.add(jobId);
          logger.info(`Job ${jobId} assigned to ${worker}`);
          broadcast("orchestrator:assigned", { jobId: jobId.toString(), worker, capability: job.capability, budget: job.budget.toString() });
        } catch (err) {
          logger.error(`Failed to assign job ${jobId}: ${err.message}`);
        }
      }

      if (Number(job.status) === 2 && job.resultHash !== ethers.ZeroHash && !completedJobs.has(jobId)) {
        logger.info(`Submitted result detected – id:${jobId} hash:${job.resultHash}`);
        if (now < Number(job.submittedAt) + auditWindow) {
          logger.debug(`Job ${jobId} waiting for audit window`);
          continue;
        }
        try {
          const completionTx = await completeWithRetry(jobQueue, jobId);
          completedJobs.add(jobId);
          logger.info(`Job ${jobId} completed`);
          try {
            await registryWriter.incrementJobs(job.worker);
            logger.info(`Incremented jobsCompleted for worker ${job.worker}`);
          } catch (incErr) {
            logger.warn(`incrementJobs failed for ${job.worker}: ${incErr.message}`);
          }
          broadcast("orchestrator:completed", {
            jobId: jobId.toString(),
            resultHash: job.resultHash,
            worker: job.worker,
            budget: ethers.formatEther(job.budget),
            txHash: completionTx.hash
          });
        } catch (err) {
          logger.error(`Failed to complete job ${jobId}: ${err.message}`);
        }
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
  setInterval(() => pollJobs().catch(err => logger.error(`Orchestrator poll failed: ${err.message}`)), 3000);
  setInterval(() => logger.debug("Orchestrator heartbeat"), 30000);
  logger.info("Orchestrator polling for jobs…");
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}
