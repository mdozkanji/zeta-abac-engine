import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const THRESHOLD = 2; // k=2 of n=3, per Week 4's deliberate scope decision (docs/devlog.md)

async function main() {
  const governorAddresses = (process.env.GOVERNOR_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (governorAddresses.length !== 3) {
    throw new Error(
      `Expected exactly 3 governor addresses in GOVERNOR_ADDRESSES (comma-separated), got ` +
        `${governorAddresses.length}. Run "npx hardhat run scripts/generate-governors.ts" ` +
        `first if you haven't yet, then set GOVERNOR_ADDRESSES in .env.`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);
  console.log(`Governors:      ${governorAddresses.join(", ")}`);
  console.log(`Threshold:      ${THRESHOLD} of ${governorAddresses.length}\n`);

  // --- 1. GovernanceVoting ---
  const Governance = await ethers.getContractFactory("GovernanceVoting");
  const governance = await Governance.deploy(governorAddresses, THRESHOLD);
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log(`GovernanceVoting deployed: ${governanceAddress}`);

  // --- 2. AttributeRegistry ---
  const Registry = await ethers.getContractFactory("AttributeRegistry");
  const registry = await Registry.deploy(governanceAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`AttributeRegistry deployed: ${registryAddress}`);

  // --- 3. PolicyRegistry ---
  // Placeholder initial policy pointer — will be replaced with a real IPFS (or similar) URI
  // once the Week 1 policy document is actually published somewhere fetchable. For now the
  // hash is computed over the placeholder URI string itself, purely so the constructor has
  // *some* non-zero hash to anchor; this is explicitly not meant to represent a real
  // verifiable policy yet.
  const initialPolicyURI = "ipfs://placeholder-week1-policy-set";
  const initialPolicyHash = ethers.keccak256(ethers.toUtf8Bytes(initialPolicyURI));

  const Policy = await ethers.getContractFactory("PolicyRegistry");
  const policy = await Policy.deploy(governanceAddress, initialPolicyHash, initialPolicyURI);
  await policy.waitForDeployment();
  const policyAddress = await policy.getAddress();
  console.log(`PolicyRegistry deployed: ${policyAddress}`);

  // --- Record deployment info ---
  // Addresses are public information (visible on Etherscan regardless), so this file is safe
  // to commit — unlike .env, which holds the private key that authorized the deployment.
  const deployment = {
    network: "sepolia",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    governors: governorAddresses,
    threshold: THRESHOLD,
    contracts: {
      GovernanceVoting: governanceAddress,
      AttributeRegistry: registryAddress,
      PolicyRegistry: policyAddress,
    },
    initialPolicy: {
      hash: initialPolicyHash,
      uri: initialPolicyURI,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(outDir, "sepolia.json"), JSON.stringify(deployment, null, 2));

  // GovernanceVoting's constructor takes an array (initialGovernors) — passing arrays as
  // inline shell arguments to `hardhat verify` is unreliable (the CLI's argument parser
  // doesn't consistently handle array-typed constructor args, even with careful quoting).
  // The documented workaround is a small JS file exporting the exact constructor args as a
  // real array, passed via --constructor-args instead of inline. Writing it here means the
  // args are always exactly correct (generated from the same variables used to deploy),
  // rather than retyped by hand later.
  const governanceArgsPath = path.join(outDir, "sepolia-governance-args.js");
  fs.writeFileSync(
    governanceArgsPath,
    `module.exports = [\n  ${JSON.stringify(governorAddresses)},\n  ${THRESHOLD}\n];\n`
  );

  console.log("\nDeployment info written to deployments/sepolia.json");
  console.log(`Governance constructor args written to deployments/sepolia-governance-args.js`);
  console.log("\nNext: verify each contract on Etherscan with:\n");
  console.log(
    `npx hardhat verify --network sepolia --constructor-args ${path.relative(
      process.cwd(),
      governanceArgsPath
    )} ${governanceAddress}`
  );
  console.log(`npx hardhat verify --network sepolia ${registryAddress} ${governanceAddress}`);
  console.log(
    `npx hardhat verify --network sepolia ${policyAddress} ${governanceAddress} ` +
      `${initialPolicyHash} "${initialPolicyURI}"`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
