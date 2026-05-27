const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentMarket Smart Contracts Suite", function () {
  let registry, jobQueue, escrow, disputeResolver;
  let owner, worker, poster, auditor;
  const MIN_STAKE = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, worker, poster, auditor] = await ethers.getSigners();

    // 1. Deploy AgentRegistry
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    // 2. Deploy JobQueue
    const JobQueue = await ethers.getContractFactory("JobQueue");
    jobQueue = await JobQueue.deploy();

    // 3. Deploy EscrowPayment
    const EscrowPayment = await ethers.getContractFactory("EscrowPayment");
    escrow = await EscrowPayment.deploy();

    // 4. Deploy DisputeResolver
    const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
    disputeResolver = await DisputeResolver.deploy(
      await registry.getAddress(),
      await jobQueue.getAddress(),
      await escrow.getAddress(),
      await auditor.getAddress()
    );

    // Set orchestrator authorizations (for simplicity, using owner as orchestrator in tests)
    await jobQueue.setOrchestrator(await owner.getAddress());
    await escrow.setOrchestrator(await owner.getAddress());
  });

  it("Should support registering a worker with stake", async function () {
    const caps = ["translate", "summarise"];
    const bid = ethers.parseEther("1");

    await registry.connect(worker).register(caps, bid, { value: MIN_STAKE });
    const workerInfo = await registry.workers(await worker.getAddress());

    expect(workerInfo.owner).to.equal(await worker.getAddress());
    expect(workerInfo.bidPerJob).to.equal(bid);
    expect(workerInfo.stake).to.equal(MIN_STAKE);
    expect(workerInfo.active).to.be.true;
  });

  it("Should post, assign, execute, and release payment on completion", async function () {
    const caps = ["translate"];
    const bid = ethers.parseEther("1");
    await registry.connect(worker).register(caps, bid, { value: MIN_STAKE });

    // Poster posts a job
    const jobBudget = ethers.parseEther("5");
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    await jobQueue.connect(poster).postJob("translate", "IPFS_CID", deadline, { value: jobBudget });
    const jobInfo = await jobQueue.jobs(0);
    expect(jobInfo.poster).to.equal(await poster.getAddress());
    expect(jobInfo.budget).to.equal(jobBudget);

    // Assign job
    await jobQueue.assignJob(0, await worker.getAddress());
    
    // Lock funds in escrow
    await escrow.lockFunds(0, await worker.getAddress(), { value: jobBudget });

    // Worker submits result
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes("translation_result"));
    await jobQueue.connect(worker).submitResult(0, resultHash);

    // Complete job
    await jobQueue.completeJob(0);

    // Release escrow
    const workerBalanceBefore = await ethers.provider.getBalance(await worker.getAddress());
    await escrow.release(0);
    const workerBalanceAfter = await ethers.provider.getBalance(await worker.getAddress());

    expect(workerBalanceAfter - workerBalanceBefore).to.equal(jobBudget);
  });
});
