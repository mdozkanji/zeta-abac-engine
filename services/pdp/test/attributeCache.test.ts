import RedisMock from "ioredis-mock";
import { AttributeCache } from "../src/cache/attributeCache";
import { Role, Department, ResourceType } from "../src/types";

describe("AttributeCache", () => {
  let cache: AttributeCache;

  beforeEach(() => {
    // Fresh in-memory mock per test — no real Redis server needed, and no state leaking
    // between tests, which matters here since we're specifically testing storage behavior.
    const redis = new RedisMock();
    cache = new AttributeCache(redis);
  });

  describe("subject attributes", () => {
    it("returns null for a subject that was never cached", async () => {
      const result = await cache.getSubjectAttributes("0x1234567890123456789012345678901234567890");
      expect(result).toBeNull();
    });

    it("round-trips subject attributes through set/get", async () => {
      const address = "0x1234567890123456789012345678901234567890";
      const attrs = {
        role: Role.Analyst,
        clearance: 2,
        department: Department.Engineering,
        deviceTrustScore: 85,
      };

      await cache.setSubjectAttributes(address, attrs);
      const result = await cache.getSubjectAttributes(address);

      expect(result).toEqual(attrs);
    });

    it("treats addresses as case-insensitive (checksummed vs lowercase must hit the same entry)", async () => {
      const mixedCase = "0xAbCdEf1234567890123456789012345678901234";
      const lowercase = "0xabcdef1234567890123456789012345678901234";
      const attrs = { role: Role.Admin, clearance: 4, department: Department.Security, deviceTrustScore: 100 };

      await cache.setSubjectAttributes(mixedCase, attrs);
      const result = await cache.getSubjectAttributes(lowercase);

      // This is the test that actually matters for this feature: without lowercase
      // normalization inside AttributeCache, this would incorrectly return null, since
      // "0xAbC..." and "0xabc..." would be stored as different Redis keys despite being the
      // same Ethereum address.
      expect(result).toEqual(attrs);
    });

    it("overwrites a previous value when set again for the same subject", async () => {
      const address = "0x1234567890123456789012345678901234567890";
      await cache.setSubjectAttributes(address, {
        role: Role.Analyst,
        clearance: 1,
        department: Department.Engineering,
        deviceTrustScore: 50,
      });
      await cache.setSubjectAttributes(address, {
        role: Role.Manager,
        clearance: 3,
        department: Department.Legal,
        deviceTrustScore: 95,
      });

      const result = await cache.getSubjectAttributes(address);
      expect(result?.role).toBe(Role.Manager);
      expect(result?.clearance).toBe(3);
    });
  });

  describe("resource attributes", () => {
    it("returns null for a resource that was never cached", async () => {
      const result = await cache.getResourceAttributes("0xdeadbeef");
      expect(result).toBeNull();
    });

    it("round-trips resource attributes through set/get", async () => {
      const resourceId = "0xabc123";
      const attrs = {
        classification: 4,
        ownerDepartment: Department.Security,
        resourceType: ResourceType.Report,
      };

      await cache.setResourceAttributes(resourceId, attrs);
      const result = await cache.getResourceAttributes(resourceId);

      expect(result).toEqual(attrs);
    });
  });
});
