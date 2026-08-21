import * as fs from "fs";
import * as path from "path";

/**
 * Regenerates abis/*.json from Hardhat's actual compiled artifacts — the single source of
 * truth. Run this after every `npx hardhat compile`, especially after any contract change.
 *
 * Why this exists: services/pdp/ (and any future off-chain consumer) needs the contracts'
 * ABI to interact with them, but should depend on a clean, minimal ABI file rather than
 * reaching directly into Hardhat's artifacts/ directory (which also contains bytecode,
 * source maps, and build metadata the consumer doesn't need, and whose internal path
 * structure is Hardhat-version-dependent).
 *
 * IMPORTANT: the ABI files this script overwrites were initially hand-written (see git
 * history / docs/devlog.md Week 5 entry) in an environment that couldn't run the Solidity
 * compiler. Run this script and commit the result as the first thing you do after cloning —
 * it replaces the hand-written version with the real compiler output, which is what should
 * actually be trusted going forward.
 */

const CONTRACTS = ["AttributeRegistry", "GovernanceVoting", "PolicyRegistry"];

function main() {
  const projectRoot = path.join(__dirname, "..");
  const abisDir = path.join(projectRoot, "abis");
  if (!fs.existsSync(abisDir)) fs.mkdirSync(abisDir);

  for (const contractName of CONTRACTS) {
    const artifactPath = path.join(
      projectRoot,
      "artifacts",
      "contracts",
      `${contractName}.sol`,
      `${contractName}.json`
    );

    if (!fs.existsSync(artifactPath)) {
      console.warn(
        `Skipping ${contractName}: artifact not found at ${artifactPath}. ` +
          `Run "npx hardhat compile" first.`
      );
      continue;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const outPath = path.join(abisDir, `${contractName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2) + "\n");
    console.log(`Exported ${contractName} ABI -> abis/${contractName}.json`);
  }
}

main();
