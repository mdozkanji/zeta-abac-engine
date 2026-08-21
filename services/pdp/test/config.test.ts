import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  const validEnv = {
    RPC_URL: "https://example.com/rpc",
    ATTRIBUTE_REGISTRY_ADDRESS: "0x1234567890123456789012345678901234567890",
  };

  it("loads successfully with only the required variables set", () => {
    const config = loadConfig(validEnv);
    expect(config.rpcUrl).toBe(validEnv.RPC_URL);
    expect(config.attributeRegistryAddress).toBe(validEnv.ATTRIBUTE_REGISTRY_ADDRESS);
  });

  it("applies sensible defaults for optional variables", () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(4000);
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.syncFromBlock).toBe(0);
  });

  it("respects explicitly provided optional variables over defaults", () => {
    const config = loadConfig({
      ...validEnv,
      PORT: "8080",
      REDIS_URL: "redis://custom-host:6380",
      SYNC_FROM_BLOCK: "5000000",
    });
    expect(config.port).toBe(8080);
    expect(config.redisUrl).toBe("redis://custom-host:6380");
    expect(config.syncFromBlock).toBe(5000000);
  });

  it("fails loudly and specifically when RPC_URL is missing", () => {
    const { RPC_URL, ...withoutRpcUrl } = validEnv;
    expect(() => loadConfig(withoutRpcUrl)).toThrow(/RPC_URL/);
  });

  it("fails loudly and specifically when ATTRIBUTE_REGISTRY_ADDRESS is missing", () => {
    const { ATTRIBUTE_REGISTRY_ADDRESS, ...withoutAddress } = validEnv;
    expect(() => loadConfig(withoutAddress)).toThrow(/ATTRIBUTE_REGISTRY_ADDRESS/);
  });
});
