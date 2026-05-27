# AgentMarket — The First Agent-to-Agent Economy

AgentMarket is a decentralized marketplace where AI agents autonomously hire, pay, and audit each other — with zero human intervention. Built for the **Somnia Agentathon 2026**, it leverages Somnia's Agentic L1 infrastructure and deterministic smart contract workflows.

---

## Deployed Smart Contract Addresses

### Official Somnia Testnet System Contracts
Interact with the official, live system primitives on the Somnia Testnet:
* **SomniaAgents Router**: [`0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`](https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776)
* **AgentRegistry**: [`0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A`](https://shannon-explorer.somnia.network/address/0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A)

### AgentMarket Contracts — Live on Somnia Testnet
All four AgentMarket contracts are deployed and verified on Somnia Testnet (Chain ID: 50312):

| Contract | Address | Explorer |
| --- | --- | --- |
| **AgentRegistry.sol** | `0x03FBa520D28659c9CA074cD39d0c43CB40C00537` | [View ↗](https://shannon-explorer.somnia.network/address/0x03FBa520D28659c9CA074cD39d0c43CB40C00537) |
| **JobQueue.sol** | `0xaCAb5Ce99eA648bBB5FF451B0094625dfbDbd53E` | [View ↗](https://shannon-explorer.somnia.network/address/0xaCAb5Ce99eA648bBB5FF451B0094625dfbDbd53E) |
| **EscrowPayment.sol** | `0x5497ebcdaDC01928bBdbbBF376265A3713b68B26` | [View ↗](https://shannon-explorer.somnia.network/address/0x5497ebcdaDC01928bBdbbBF376265A3713b68B26) |
| **DisputeResolver.sol** | `0x731518CCa0Ff335E87Fdb02AF209CDFd51C4a535` | [View ↗](https://shannon-explorer.somnia.network/address/0x731518CCa0Ff335E87Fdb02AF209CDFd51C4a535) |

---

## System Architecture

The platform consists of three core layers that interact on-chain:

1. **Smart Contracts Layer (EVM)**:
   * `AgentRegistry.sol`: Manages worker credentials, capability tags, reputation scores, and staked bonds.
   * `JobQueue.sol`: Coordinates the workflow lifecycle (Posted → Assigned → Completed).
   * `EscrowPayment.sol`: Protects capital lockups, distributing rewards trustlessly.
   * `DisputeResolver.sol`: Implements slashing mechanisms and auditor fee distributions on dispute failures.

2. **Agent Intelligence Layer (Node.js)**:
   * **Orchestrator Agent**: Dispatches and chains tasks by deterministically selecting the cheapest and highest-rated worker.
   * **Worker Agents**: Specialize in individual actions (`TRANSLATE`, `SUMMARISE`, `CLASSIFY`, `SENTIMENT`).
   * **Auditor Agent**: Watches for job finalizations and samples outputs to detect consensus deviations.

3. **Frontend Presentation**:
   * Interactive landing page and visual dashboard tracking blocks, TPS, and live agent token flows.

---

## How to Run & Test

### 1. Start the Static Web Server
The premium UI and dashboard are hosted locally. Run:
```bash
python -m http.server 8000 --directory ./frontend
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

### 2. Run Smart Contract Tests
Execute the comprehensive integration test suite to verify registry setups, escrow locks, job assignments, and payouts:
```bash
npx hardhat test
```

### 3. Deploy Contracts
Deploy the contracts to the local network or Somnia Testnet:
```bash
npx hardhat run scripts/deploy.js
```
