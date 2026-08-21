import * as dotenv from "dotenv";
dotenv.config({ quiet: true });

import { JsonRpcProvider, Contract } from "ethers";
import Redis from "ioredis";
import { loadConfig } from "./config";
import { AttributeCache } from "./cache/attributeCache";
import { AttributeSync } from "./chain/attributeSync";
import { createApp } from "./routes/app";
import attributeRegistryAbi from "../../../abis/AttributeRegistry.json";

/**
 * Deliberately thin — almost no logic of its own. Everything that actually does something
 * (decoding, caching, syncing, routing) lives in modules that were built and unit-tested
 * without needing this file at all. This file's only job is real I/O wiring: connect to the
 * real chain, the real Redis, and start the real HTTP server. That's also exactly why this
 * file can't be meaningfully unit tested in the sandbox this project is built in — it needs a
 * live RPC endpoint and a live Redis instance, both of which are legitimately your machine's
 * job to provide, not something to fake convincingly in a test.
 */
async function main() {
  const config = loadConfig();

  const redis = new Redis(config.redisUrl);
  const cache = new AttributeCache(redis);

  const provider = new JsonRpcProvider(config.rpcUrl);
  const registry = new Contract(config.attributeRegistryAddress, attributeRegistryAbi, provider);

  const sync = new AttributeSync(cache);
  console.log(`Syncing AttributeRegistry (${config.attributeRegistryAddress}) from block ${config.syncFromBlock}...`);
  await sync.syncFromChain(registry, config.syncFromBlock);
  console.log("Sync complete. Listening for new events.");

  const app = createApp(cache);
  app.listen(config.port, () => {
    console.log(`PDP service listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error("Fatal error starting PDP service:", error);
  process.exitCode = 1;
});
