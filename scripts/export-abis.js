const fs = require("fs");
const path = require("path");
const solc = require("solc");

const contracts = ["AgentRegistry.sol", "JobQueue.sol", "EscrowPayment.sol", "DisputeResolver.sol"];
const sources = Object.fromEntries(
  contracts.map(file => [file, { content: fs.readFileSync(path.join("contracts", file), "utf8") }])
);

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(error => error.severity === "error");
if (errors.length) {
  console.error(errors.map(error => error.formattedMessage).join("\n"));
  process.exit(1);
}

for (const sourceName of contracts) {
  for (const [contractName, data] of Object.entries(output.contracts[sourceName])) {
    if (!["AgentRegistry", "JobQueue", "EscrowPayment", "DisputeResolver"].includes(contractName)) continue;
    fs.writeFileSync(path.join("frontend", "abis", `${contractName}.json`), `${JSON.stringify(data.abi, null, 2)}\n`);

    const artifact = {
      _format: "hh-sol-artifact-1",
      contractName,
      sourceName: `contracts/${sourceName}`,
      abi: data.abi,
      bytecode: `0x${data.evm.bytecode.object}`,
      deployedBytecode: `0x${data.evm.deployedBytecode.object}`,
      linkReferences: data.evm.bytecode.linkReferences || {},
      deployedLinkReferences: data.evm.deployedBytecode.linkReferences || {}
    };
    const artifactDir = path.join("artifacts", "contracts", sourceName);
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, `${contractName}.json`), JSON.stringify(artifact, null, 2));
  }
}

console.log(`ABIs and Hardhat artifacts exported with solc ${solc.version()}`);
