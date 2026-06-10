require("dotenv").config();

const logger = require("./lib/logger");
const { getWss } = require("./lib/wsServer");

const startedAt = Date.now();
const services = {
  orchestrator: false,
  worker: false,
  auditor: false,
  websocket: false
};

function enabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(String(raw).toLowerCase());
}

async function start() {
  getWss();
  services.websocket = true;
  logger.info(`Runtime booted in ${Math.floor((Date.now() - startedAt) / 1000)}s`);

  if (enabled("RUN_ORCHESTRATOR", true)) {
    services.orchestrator = true;
    require("./orchestrator").main().catch(err => {
      logger.error(`Orchestrator crashed: ${err.message}`);
      process.exit(1);
    });
  }

  if (enabled("RUN_WORKER", true)) {
    services.worker = true;
    require("./workers/base").main().catch(err => {
      logger.error(`Worker crashed: ${err.message}`);
      process.exit(1);
    });
  }

  if (enabled("RUN_AUDITOR", true)) {
    services.auditor = true;
    require("./auditor").main().catch(err => {
      logger.error(`Auditor crashed: ${err.message}`);
      process.exit(1);
    });
  }
}

start().catch(err => {
  logger.error(`Runtime failed to start: ${err.message}`);
  process.exit(1);
});
