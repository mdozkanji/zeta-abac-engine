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
 *
 * queryFilter here records every (filter, fromBlock, toBlock) call it receives — this is what
 * lets the chunking test assert on the actual ranges requested, which is the behavior that
 * matters after the real-world "exceed maximum block range: 50000" bug this was built to fix.
 */
function createFakeRegistry(options: {
  subjectEventsByCall?: unknown[][]; // events returned on each successive queryFilter call, per event type
  resourceEventsByCall?: unknown[][];
}) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const queryFilterCalls: { filter: string; fromBlock: number; toBlock: number }[] = [];
  let subjectCallIndex = 0;
  let resourceCallIndex = 0;

  return {
    filters: {
      SubjectAttributesSet: () => "SubjectAttributesSet-filter",
      ResourceAttributesSet: () => "ResourceAttributesSet-filter",
    },
    queryFilter: jest.fn(async (filter: string, fromBlock: number, toBlock: number) => {
      queryFilterCalls.push({ filter, fromBlock, toBlock });
      if (filter === "SubjectAttributesSet-filter") {
        const events = options.subjectEventsByCall?.[subjectCallIndex] ?? [];
        subjectCallIndex++;
        return events;
      }
      if (filter === "ResourceAttributesSet-filter") {
        const events = options.resourceEventsByCall?.[resourceCallIndex] ?? [];
        resourceCallIndex++;
        return events;
      }
      return [];
    }),
    on: jest.fn((eventName: string, handler: (...args: unknown[]) => void) => {
      listeners[eventName] = listeners[eventName] || [];
      listeners[eventName].push(handler);
    }),
    // Test helpers, not part of the real Contract interface.
    __emit(eventName: string, ...args: unknown[]) {
      (listeners[eventName] || []).forEach((handler) => handler(...args));
    },
    __queryFilterCalls: queryFilterCalls,
  };
}

function createFakeProvider(latestBlock: number) {
  return { getBlockNumber: jest.fn(async () => latestBlock) };
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
      subjectEventsByCall: [[{ args: [address, Role.Manager, 3, Department.Legal, 88] }]],
    });
    const fakeProvider = createFakeProvider(100);

    await sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000);

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
      resourceEventsByCall: [[{ args: [resourceId, 2, Department.Engineering, ResourceType.Contract] }]],
    });
    const fakeProvider = createFakeProvider(100);

    await sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000);

    const cached = await cache.getResourceAttributes(resourceId);
    expect(cached).toEqual({
      classification: 2,
      ownerDepartment: Department.Engineering,
      resourceType: ResourceType.Contract,
    });
  });

  it("skips malformed events missing decodable args rather than throwing", async () => {
    const fakeRegistry = createFakeRegistry({
      subjectEventsByCall: [[{ someOtherShape: true }]], // no `args` property
    });
    const fakeProvider = createFakeProvider(100);

    // Should not throw — a malformed/unexpected log entry shouldn't crash the whole sync.
    await expect(
      sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000)
    ).resolves.not.toThrow();
  });

  it("subscribes to live events after backfilling, and processes them when emitted", async () => {
    const fakeRegistry = createFakeRegistry({});
    const fakeProvider = createFakeProvider(100);
    await sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000);

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

  describe("chunking (regression test for the real 'exceed maximum block range: 50000' bug)", () => {
    it("splits a wide block range into multiple queryFilter calls, each within chunkSize", async () => {
      // latestBlock=100000, chunkSize=40000 -> expected chunks: [0,39999], [40000,79999],
      // [80000,100000] — 3 chunks, each well under the 50,000-block limit that broke the
      // original unchunked implementation against the public Sepolia RPC.
      const fakeRegistry = createFakeRegistry({});
      const fakeProvider = createFakeProvider(100000);

      await sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000);

      const subjectCalls = fakeRegistry.__queryFilterCalls.filter(
        (c) => c.filter === "SubjectAttributesSet-filter"
      );
      expect(subjectCalls).toEqual([
        { filter: "SubjectAttributesSet-filter", fromBlock: 0, toBlock: 39999 },
        { filter: "SubjectAttributesSet-filter", fromBlock: 40000, toBlock: 79999 },
        { filter: "SubjectAttributesSet-filter", fromBlock: 80000, toBlock: 100000 },
      ]);

      // Every chunk's range must never exceed chunkSize — the actual property that matters,
      // checked generically rather than only against this one hand-computed example.
      for (const call of fakeRegistry.__queryFilterCalls) {
        expect(call.toBlock - call.fromBlock).toBeLessThan(40000);
      }
    });

    it("issues a single chunk when the full range already fits within chunkSize", async () => {
      const fakeRegistry = createFakeRegistry({});
      const fakeProvider = createFakeProvider(1000);

      await sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000);

      const subjectCalls = fakeRegistry.__queryFilterCalls.filter(
        (c) => c.filter === "SubjectAttributesSet-filter"
      );
      expect(subjectCalls).toEqual([
        { filter: "SubjectAttributesSet-filter", fromBlock: 0, toBlock: 1000 },
      ]);
    });

    it("aggregates events found across multiple chunks into the cache correctly", async () => {
      const addressInChunk1 = "0x1111111111111111111111111111111111111111".slice(0, 42);
      const addressInChunk3 = "0x2222222222222222222222222222222222222222".slice(0, 42);

      const fakeRegistry = createFakeRegistry({
        subjectEventsByCall: [
          [{ args: [addressInChunk1, Role.Analyst, 1, Department.Engineering, 50] }], // chunk 1
          [], // chunk 2: nothing
          [{ args: [addressInChunk3, Role.Admin, 4, Department.Security, 100] }], // chunk 3
        ],
      });
      const fakeProvider = createFakeProvider(100000);

      await sync.syncFromChain(fakeRegistry as any, fakeProvider, 0, 40000);

      expect((await cache.getSubjectAttributes(addressInChunk1))?.role).toBe(Role.Analyst);
      expect((await cache.getSubjectAttributes(addressInChunk3))?.role).toBe(Role.Admin);
    });
  });
});
