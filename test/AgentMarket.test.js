const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentMarket Smart Contracts Suite", function () {
  let registry, jobQueue, escrow, disputeResolver;
  let owner, worker, poster, auditor;
  const MIN_STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, worker, poster, auditor] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    const EscrowPayment = await ethers.getContractFactory("EscrowPayment");
    escrow = await EscrowPayment.deploy();

    const JobQueue = await ethers.getContractFactory("JobQueue");
    jobQueue = await JobQueue.deploy();

    const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
    disputeResolver = await DisputeResolver.deploy(
      await registry.getAddress(),
      await jobQueue.getAddress(),
      await escrow.getAddress(),
      await auditor.getAddress()
    );

    await escrow.setAuthorized(await jobQueue.getAddress(), true);
    await escrow.setAuthorized(await disputeResolver.getAddress(), true);
    await jobQueue.setEscrow(await escrow.getAddress());
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

  it("Should post, escrow, assign, execute, complete, and release payment", async function () {
    await registry.connect(worker).register(["translate"], ethers.parseEther("1"), { value: MIN_STAKE });

    const jobBudget = ethers.parseEther("5");
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await jobQueue.connect(poster).postJob("translate", "IPFS_CID", deadline, { value: jobBudget });

    const escrowInfo = await escrow.escrows(0);
    expect(escrowInfo.payer).to.equal(await poster.getAddress());
    expect(escrowInfo.amount).to.equal(jobBudget);

    await jobQueue.assignJob(0, await worker.getAddress());
    const assignedEscrow = await escrow.escrows(0);
    expect(assignedEscrow.payee).to.equal(await worker.getAddress());

    const result = "PROCESSED_RESULT: [TRANSLATE] for IPFS_CID";
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes(result));
    await jobQueue.connect(worker).submitResult(0, resultHash, result);

    const workerBalanceBefore = await ethers.provider.getBalance(await worker.getAddress());
    await jobQueue.completeJob(0);
    const workerBalanceAfter = await ethers.provider.getBalance(await worker.getAddress());
    const jobInfo = await jobQueue.jobs(0);

    expect(jobInfo.status).to.equal(2);
    expect(jobInfo.resultData).to.equal(result);
    expect(workerBalanceAfter - workerBalanceBefore).to.equal(jobBudget);
  });

  it("Should restrict registry admin functions to owner", async function () {
    await registry.connect(worker).register(["translate"], ethers.parseEther("1"), { value: MIN_STAKE });

    await expect(registry.connect(worker).slash(await worker.getAddress())).to.be.revertedWith("not authorized");
    await expect(registry.connect(worker).incrementJobs(await worker.getAddress())).to.be.revertedWith("not authorized");
  });

  it("Should let DisputeResolver slash a worker after authorization handoff", async function () {
    await registry.connect(worker).register(["translate"], ethers.parseEther("1"), { value: MIN_STAKE });

    const jobBudget = ethers.parseEther("5");
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await jobQueue.connect(poster).postJob("translate", "IPFS_CID", deadline, { value: jobBudget });
    await jobQueue.assignJob(0, await worker.getAddress());

    await registry.transferOwnership(await disputeResolver.getAddress());
    await jobQueue.setOrchestrator(await disputeResolver.getAddress());

    await disputeResolver.connect(auditor).raiseDispute(0, ethers.ZeroHash);
    await disputeResolver.resolve(0, true);

    const workerInfo = await registry.workers(await worker.getAddress());
    const jobInfo = await jobQueue.jobs(0);
    expect(workerInfo.active).to.equal(false);
    expect(jobInfo.status).to.equal(4);
  });
});
