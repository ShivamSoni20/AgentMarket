require('dotenv').config();

function normalizePrivateKey(privateKey) {
  if (!privateKey) return undefined;
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

module.exports = {
  RPC_URL: process.env.RPC_URL || "https://dream-rpc.somnia.network",
  PRIVATE_KEY: normalizePrivateKey(process.env.PRIVATE_KEY),
  WS_PORT: process.env.WS_PORT || 3001,
  AGENT_REGISTRY_ADDRESS: process.env.AGENT_REGISTRY_ADDRESS,
  JOB_QUEUE_ADDRESS: process.env.JOB_QUEUE_ADDRESS,
  ESCROW_PAYMENT_ADDRESS: process.env.ESCROW_PAYMENT_ADDRESS,
  DISPUTE_RESOLVER_ADDRESS: process.env.DISPUTE_RESOLVER_ADDRESS,
};
