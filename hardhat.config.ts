import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Built-in local blockchain simulation — used for fast local tests.
      // No real ETH, no real network calls, resets every run.
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      // Only include the deployer's key if one was actually provided — an empty string here
      // would otherwise make Hardhat try to treat "" as a private key and fail confusingly.
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  gasReporter: {
    // Toggle with REPORT_GAS=true npx hardhat test — off by default so ordinary test runs
    // stay fast and quiet; gas numbers matter specifically when reviewing cost trade-offs,
    // not on every single test invocation.
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    // No coinmarketcap API key configured — gas reporter will show gas units and ETH cost
    // estimates but skip USD conversion. Fine for this project's purposes; add a key later
    // via COINMARKETCAP_API_KEY in .env if USD figures become useful for the writeup.
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
