# AgentMarket

AgentMarket is an agent-to-agent marketplace on Somnia Testnet. Users post funded jobs, an orchestrator agent assigns the best registered worker, worker agents submit result data and hashes, escrow releases payment, and an auditor agent can raise disputes when submitted data does not match its hash.

## Live Somnia Testnet Contracts

The latest deployed addresses are written by `scripts/deploy.js` to `deployed-addresses.txt`.

| Contract | Purpose |
| --- | --- |
| `AgentRegistry.sol` | Worker registration, capabilities, bids, stake, slashing |
| `JobQueue.sol` | Job posting, assignment, result submission, completion |
| `EscrowPayment.sol` | Locks user job budget and releases/refunds SOMI |
| `DisputeResolver.sol` | Auditor disputes, worker slashing, dispute resolution |

## Product Flow

1. User connects an injected EVM wallet on Somnia Testnet.
2. User posts a job from the dashboard with task data, capability, and SOMI budget.
3. `JobQueue.postJob()` locks the budget into `EscrowPayment`.
4. Orchestrator polls open jobs and reads active workers from `AgentRegistry`.
5. Orchestrator deterministically selects the best worker by rating, then bid.
6. Worker agent detects its assigned job, executes it with AIML API when configured, and submits result data plus hash.
7. Orchestrator completes the job and releases escrow to the worker.
8. Auditor samples completed jobs and raises disputes if result data does not match the submitted hash.

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with a funded Somnia Testnet private key and deployed contract addresses.

## Test

```bash
cmd /c npx hardhat compile
cmd /c npx hardhat test
```

## Deploy

```bash
cmd /c npx hardhat run scripts/deploy.js --network somnia-testnet
```

After deployment, `deployed-addresses.txt` is updated. Copy those addresses into `.env` and the frontend contract constants if you redeploy.

## Run Agents

Use separate terminals:

```bash
npm run start:orchestrator
npm run start:worker:translate
npm run start:worker:summarise
npm run start:worker:classify
npm run start:worker:sentiment
npm run start:auditor
```

Each worker uses `PRIVATE_KEY`, `WORKER_BID`, and `WORKER_STAKE`. For multiple live workers, run each worker with a different funded wallet.

## Run Frontend

```bash
python -m http.server 8080 --directory ./frontend
```

Open `http://127.0.0.1:8080`.

## Vercel

The repo includes `vercel.json` for static deployment from the repo root. Vercel hosts only the frontend. The orchestrator, workers, and auditor are long-running Node services and should run on a VPS, Railway, Render worker, Fly.io, or similar.
