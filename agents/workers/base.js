const { ethers } = require("ethers");

class WorkerAgent {
  constructor(capability, bidPrice, privateKey, rpcUrl) {
    this.capability = capability;
    this.bidPrice = bidPrice;
    this.provider = new ethers.JsonRpcProvider(rpcUrl || "http://localhost:8545");
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  async initialize() {
    console.log(`[Worker Start] Worker with capability "${this.capability}" online at address: ${this.wallet.address}`);
  }

  async executeTask(taskData) {
    console.log(`[Task Received] Executing "${this.capability}" for input data: "${taskData}"`);
    // Concrete implementations override this to execute custom AIML API calls or deterministic solvers
    return `PROCESSED_RESULT: [${this.capability.toUpperCase()}] for ${taskData}`;
  }
}

module.exports = WorkerAgent;
