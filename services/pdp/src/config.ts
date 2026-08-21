export interface Config {
  port: number;
  redisUrl: string;
  rpcUrl: string;
  attributeRegistryAddress: string;
  syncFromBlock: number;
}

/**
 * Reads and validates required environment variables, failing loudly and specifically at
 * startup rather than letting a missing value surface later as a confusing runtime error deep
 * in an unrelated module (e.g. "Cannot read property of undefined" three layers into an
 * ethers call, instead of "RPC_URL is not set" at the very first line of execution).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rpcUrl = env.RPC_URL;
  const attributeRegistryAddress = env.ATTRIBUTE_REGISTRY_ADDRESS;

  if (!rpcUrl) {
    throw new Error("Missing required environment variable: RPC_URL");
  }
  if (!attributeRegistryAddress) {
    throw new Error("Missing required environment variable: ATTRIBUTE_REGISTRY_ADDRESS");
  }

  return {
    port: env.PORT ? Number(env.PORT) : 4000,
    redisUrl: env.REDIS_URL || "redis://localhost:6379",
    rpcUrl,
    attributeRegistryAddress,
    syncFromBlock: env.SYNC_FROM_BLOCK ? Number(env.SYNC_FROM_BLOCK) : 0,
  };
}
