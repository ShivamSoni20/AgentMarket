const { spawnSync } = require("child_process");
const path = require("path");

const localAppData = path.resolve(".hardhat-localappdata");
const appData = path.resolve(".hardhat-appdata");
const hardhatBin = path.resolve("node_modules", "hardhat", "internal", "cli", "cli.js");

const result = spawnSync(process.execPath, [hardhatBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    APPDATA: appData,
    LOCALAPPDATA: localAppData
  }
});

process.exit(result.status ?? 1);
