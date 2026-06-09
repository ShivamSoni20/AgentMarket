const { ethers } = require("ethers");
require("dotenv").config();
const logger = require("../lib/logger");
const config = require("../lib/config");

const JobQueueABI = [
  "function nextJobId() external view returns (uint256)",
  "function jobs(uint256) view returns (uint256 id, address poster, string capability, string taskData, uint256 budget, address worker, bytes32 resultHash, string resultURI, uint8 status, uint256 createdAt, uint256 deadline, uint256 submittedAt)"
];

const DisputeResolverABI = [
  "function raiseDispute(uint256 jobId, bytes32 auditorResultHash) external"
];

const SAMPLE_RATE = Number(process.env.AUDIT_SAMPLE_RATE || "0.20");

function decodeResultURI(resultURI) {
  const prefix = "data:text/plain;base64,";
  if (resultURI && resultURI.startsWith(prefix)) {
    return Buffer.from(resultURI.slice(prefix.length), "base64").toString("utf8");
  }
  return "";
}

async function semanticAudit(job, resultData) {
  if (!process.env.AIML_API_KEY || process.env.AIML_API_KEY === "your_aiml_api_key_here") {
    return { passed: true, reason: "AIML API not configured; hash audit only" };
  }

  const response = await fetch("https://api.aimlapi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AIML_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.AIML_MODEL || "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "You are an AgentMarket auditor. Return strict JSON: {\"passed\":boolean,\"reason\":\"short reason\"}." },
        { role: "user", content: `Capability: ${job.capability}\nTask: ${job.taskData}\nWorker result: ${resultData}\nDoes the result satisfy the task?` }
      ]
    })
  });
  if (!response.ok) throw new Error(`AIML audit failed: ${response.status}`);
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content || "{\"passed\":true,\"reason\":\"empty audit response\"}";
  try {
    return JSON.parse(text);
  } catch {
    return { passed: !/fail|false|bad|incorrect/i.test(text), reason: text.slice(0, 160) };
  }
}

async function main() {
  if (!config.AUDITOR_PRIVATE_KEY) throw new Error("AUDITOR_PRIVATE_KEY or PRIVATE_KEY not set in .env");
  if (!config.JOB_QUEUE_ADDRESS) throw new Error("JOB_QUEUE_ADDRESS not set in .env");
  if (!config.DISPUTE_RESOLVER_ADDRESS) throw new Error("DISPUTE_RESOLVER_ADDRESS not set in .env");

  logger.info("Auditor Agent starting...");
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const wallet = new ethers.Wallet(config.AUDITOR_PRIVATE_KEY, provider);
  const jobQueue = new ethers.Contract(config.JOB_QUEUE_ADDRESS, JobQueueABI, provider);
  const disputeResolver = new ethers.Contract(config.DISPUTE_RESOLVER_ADDRESS, DisputeResolverABI, wallet);
  const auditedJobs = new Set();

  async function pollCompletedJobs() {
    const nextJobId = Number(await jobQueue.nextJobId());
    for (let jobId = 0; jobId < nextJobId; jobId++) {
      if (auditedJobs.has(jobId) || Math.random() > SAMPLE_RATE) continue;
      const job = await jobQueue.jobs(jobId);
      if (Number(job.status) !== 2) continue;

      logger.info(`[Audit] Sampling job ${jobId} completed by ${job.worker}`);
      try {
        const resultData = decodeResultURI(job.resultURI);
        if (!resultData) {
          logger.warn(`[Audit] Job ${jobId} has no readable resultURI; skipping hash audit`);
          auditedJobs.add(jobId);
          continue;
        }
        const recomputedHash = ethers.keccak256(ethers.toUtf8Bytes(resultData));
        if (recomputedHash !== job.resultHash) {
          logger.warn(`[Audit] Job ${jobId} hash mismatch; raising dispute`);
          const tx = await disputeResolver.raiseDispute(jobId, recomputedHash);
          await tx.wait();
          logger.warn(`[Audit] Dispute raised for job ${jobId}`);
        } else {
          const semantic = await semanticAudit(job, resultData);
          if (!semantic.passed) {
            logger.warn(`[Audit] Job ${jobId} semantic mismatch; raising dispute: ${semantic.reason}`);
            const tx = await disputeResolver.raiseDispute(jobId, recomputedHash);
            await tx.wait();
            logger.warn(`[Audit] Dispute raised for job ${jobId}`);
          } else {
            logger.info(`[Audit] Job ${jobId} PASSED - ${semantic.reason}`);
          }
        }
        auditedJobs.add(jobId);
      } catch (err) {
        logger.error(`[Audit] Failed to audit job ${jobId}: ${err.message}`);
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
  setInterval(() => pollCompletedJobs().catch(err => logger.error(`Auditor poll failed: ${err.message}`)), 5000);
  setInterval(() => logger.debug("Auditor heartbeat"), 30000);
  logger.info(`Auditor polling for completed jobs (sampling ${SAMPLE_RATE * 100}%)...`);
}

if (require.main === module) {
  main().catch(err => { logger.error(err); process.exit(1); });
}
