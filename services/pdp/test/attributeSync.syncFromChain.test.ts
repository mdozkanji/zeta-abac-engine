import RedisMock from "ioredis-mock";
import { AttributeCache } from "../src/cache/attributeCache";
import { AttributeSync } from "../src/chain/attributeSync";
import { Role, Department, ResourceType } from "../src/types";

/**
 * A minimal fake standing in for an ethers Contract, implementing only the surface
 * AttributeSync.syncFromChain actually touches: filters, queryFilter, and on. This is
 * deliberately not a full mock of ethers' Contract class (which would be brittle and mostly
 * pointless to fake) — it's a hand-rolled stand-in that lets us test the backfill-then-
 * subscribe *logic* without needing a live chain connection, matching how the rest of this
 * service was designed to be testable.
 */
function createFakeRegistry(options: {
  subjectEvents?: unknown[];
  resourceEvents?: unknown[];
}) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  return {
    filters: {
      SubjectAttributesSet: () => "SubjectAttributesSet-filter",
      ResourceAttributesSet: () => "ResourceAttributesSet-filter",
    },
    queryFilter: jest.fn(async (filter: string) => {
      if (filter === "SubjectAttributesSet-filter") return options.subjectEvents ?? [];
      if (filter === "ResourceAttributesSet-filter") return options.resourceEvents ?? [];
      return [];
    }),
    on: jest.fn((eventName: string, handler: (...args: unknown[]) => void) => {
      listeners[eventName] = listeners[eventName] || [];
      listeners[eventName].push(handler);
    }),
    // Test helper, not part of the real Contract interface — lets a test simulate a live
    // event arriving after subscription, exercising the .on() callback path directly.
    __emit(eventName: string, ...args: unknown[]) {
      (listeners[eventName] || []).forEach((handler) => handler(...args));
    },
  };
}

describe("AttributeSync.syncFromChain", () => {
  let cache: AttributeCache;
  let sync: AttributeSync;

  beforeEach(() => {
    cache = new AttributeCache(new RedisMock());
    sync = new AttributeSync(cache);
  });

  it("backfills the cache from historical SubjectAttributesSet events", async () => {
    const address = "0x3333333333333333333333333333333333333333".slice(0, 42);
    const fakeRegistry = createFakeRegistry({
      subjectEvents: [
        { args: [address, Role.Manager, 3, Department.Legal, 88] },
      ],
    });

    await sync.syncFromChain(fakeRegistry as any, 0);

    const cached = await cache.getSubjectAttributes(address);
    expect(cached).toEqual({
      role: Role.Manager,
      clearance: 3,
      department: Department.Legal,
      deviceTrustScore: 88,
    });
  });

  it("backfills the cache from historical ResourceAttributesSet events", async () => {
    const resourceId = "0xdoc99";
    const fakeRegistry = createFakeRegistry({
      resourceEvents: [
        { args: [resourceId, 2, Department.Engineering, ResourceType.Contract] },
      ],
    });

    await sync.syncFromChain(fakeRegistry as any, 0);

    const cached = await cache.getResourceAttributes(resourceId);
    expect(cached).toEqual({
      classification: 2,
      ownerDepartment: Department.Engineering,
      resourceType: ResourceType.Contract,
    });
  });

  it("skips malformed events missing decodable args rather than throwing", async () => {
    const fakeRegistry = createFakeRegistry({
      subjectEvents: [{ someOtherShape: true }], // no `args` property
    });

    // Should not throw — a malformed/unexpected log entry shouldn't crash the whole sync.
    await expect(sync.syncFromChain(fakeRegistry as any, 0)).resolves.not.toThrow();
  });

  it("subscribes to live events after backfilling, and processes them when emitted", async () => {
    const fakeRegistry = createFakeRegistry({});
    await sync.syncFromChain(fakeRegistry as any, 0);

    expect(fakeRegistry.on).toHaveBeenCalledWith("SubjectAttributesSet", expect.any(Function));
    expect(fakeRegistry.on).toHaveBeenCalledWith("ResourceAttributesSet", expect.any(Function));

    const address = "0x4444444444444444444444444444444444444444";
    fakeRegistry.__emit("SubjectAttributesSet", address, Role.Auditor, 2, Department.Security, 77);

    // The live handler fires the cache write asynchronously (fire-and-forget inside the .on
    // callback, per attributeSync.ts's design) — give the microtask queue a tick to flush
    // before asserting, rather than asserting immediately in the same synchronous tick.
    await new Promise((resolve) => setImmediate(resolve));

    const cached = await cache.getSubjectAttributes(address);
    expect(cached?.role).toBe(Role.Auditor);
  });
});
