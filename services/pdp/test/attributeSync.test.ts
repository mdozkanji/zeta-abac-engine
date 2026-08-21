import RedisMock from "ioredis-mock";
import { AttributeCache } from "../src/cache/attributeCache";
import { AttributeSync } from "../src/chain/attributeSync";
import { Role, Department, ResourceType } from "../src/types";

describe("AttributeSync handlers", () => {
  let cache: AttributeCache;
  let sync: AttributeSync;

  beforeEach(() => {
    cache = new AttributeCache(new RedisMock());
    sync = new AttributeSync(cache);
  });

  it("decodes and caches a SubjectAttributesSet event", async () => {
    const address = "0x11111111111111111111111111111111111111";
    await sync.handleSubjectAttributesSet(address, Role.Auditor, 1, Department.Legal, 60);

    const cached = await cache.getSubjectAttributes(address);
    expect(cached).toEqual({
      role: Role.Auditor,
      clearance: 1,
      department: Department.Legal,
      deviceTrustScore: 60,
    });
  });

  it("decodes and caches a ResourceAttributesSet event", async () => {
    const resourceId = "0xfeed000000000000000000000000000000000000000000000000000000000001";
    await sync.handleResourceAttributesSet(resourceId, 2, Department.Engineering, ResourceType.Contract);

    const cached = await cache.getResourceAttributes(resourceId);
    expect(cached).toEqual({
      classification: 2,
      ownerDepartment: Department.Engineering,
      resourceType: ResourceType.Contract,
    });
  });

  it("a later event for the same subject overwrites the cached value (mirrors on-chain mutability)", async () => {
    const address = "0x2222222222222222222222222222222222222222";
    await sync.handleSubjectAttributesSet(address, Role.Analyst, 1, Department.Engineering, 40);
    await sync.handleSubjectAttributesSet(address, Role.Manager, 3, Department.Legal, 95);

    const cached = await cache.getSubjectAttributes(address);
    expect(cached?.role).toBe(Role.Manager);
    expect(cached?.clearance).toBe(3);
  });
});
