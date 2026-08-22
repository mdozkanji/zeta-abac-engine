import { Contract } from "ethers";
import { AttributeCache } from "../cache/attributeCache";
import { decodeSubjectAttributes, decodeResourceAttributes } from "./decodeAttributes";

/**
 * Wires AttributeRegistry's on-chain events to cache updates. Split from the raw ethers
 * Contract listener setup so the actual handler logic (decode -> cache.set) is unit-testable
 * by calling handleSubjectAttributesSet/handleResourceAttributesSet directly with plain
 * arguments, without needing a real Contract instance or a live chain connection.
 */
export class AttributeSync {
  constructor(private readonly cache: AttributeCache) {}

  async handleSubjectAttributesSet(
    subject: string,
    role: number,
    clearance: number,
    department: number,
    deviceTrustScore: number
  ): Promise<void> {
    const attrs = decodeSubjectAttributes(role, clearance, department, deviceTrustScore);
    await this.cache.setSubjectAttributes(subject, attrs);
  }

  async handleResourceAttributesSet(
    resourceId: string,
    classification: number,
    ownerDepartment: number,
    resourceType: number
  ): Promise<void> {
    const attrs = decodeResourceAttributes(classification, ownerDepartment, resourceType);
    await this.cache.setResourceAttributes(resourceId, attrs);
  }

  /**
   * Backfills the cache from all historical events, then subscribes to future ones. Run once
   * at service startup — without this, a freshly started PDP would have an empty cache until
   * the next attribute change happened to occur, incorrectly treating every existing subject/
   * resource as unregistered in the meantime.
   *
   * Queries are chunked into ranges of at most `chunkSize` blocks. This isn't optional
   * polish: most RPC providers (including the public Sepolia endpoint this project defaults
   * to) reject `eth_getLogs` requests spanning more than some maximum block range — a single
   * unchunked "block 0 to latest" query fails outright once the chain has grown past that
   * limit, which happens well within a testnet's normal lifetime. 40,000 is a conservative
   * default safely under the 50,000-block limit this project's default RPC actually enforces
   * (different providers set different limits, hence this being configurable).
   */
  async syncFromChain(
    registry: Contract,
    provider: { getBlockNumber(): Promise<number> },
    fromBlock: number = 0,
    chunkSize: number = 40000
  ): Promise<void> {
    const latestBlock = await provider.getBlockNumber();

    for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, latestBlock);

      const subjectEvents = await registry.queryFilter(
        registry.filters.SubjectAttributesSet(),
        start,
        end
      );
      for (const event of subjectEvents) {
        if (!("args" in event) || !event.args) continue;
        const [subject, role, clearance, department, deviceTrustScore] = event.args;
        await this.handleSubjectAttributesSet(
          subject,
          Number(role),
          Number(clearance),
          Number(department),
          Number(deviceTrustScore)
        );
      }

      const resourceEvents = await registry.queryFilter(
        registry.filters.ResourceAttributesSet(),
        start,
        end
      );
      for (const event of resourceEvents) {
        if (!("args" in event) || !event.args) continue;
        const [resourceId, classification, ownerDepartment, resourceType] = event.args;
        await this.handleResourceAttributesSet(
          resourceId,
          Number(classification),
          Number(ownerDepartment),
          Number(resourceType)
        );
      }
    }

    // Subscribe to future events after backfilling past ones — ordering matters here: if we
    // subscribed first, an event arriving between "start listening" and "finish backfilling"
    // could theoretically be double-processed by both the backfill query and the live
    // listener. Backfilling first, then subscribing, avoids that race in practice for this
    // project's scale (a live listener processing a slightly-already-cached update is
    // harmless anyway, since cache writes are idempotent — but worth being deliberate about
    // the ordering rather than accidental).
    registry.on("SubjectAttributesSet", (subject, role, clearance, department, deviceTrustScore) => {
      void this.handleSubjectAttributesSet(
        subject,
        Number(role),
        Number(clearance),
        Number(department),
        Number(deviceTrustScore)
      );
    });

    registry.on("ResourceAttributesSet", (resourceId, classification, ownerDepartment, resourceType) => {
      void this.handleResourceAttributesSet(
        resourceId,
        Number(classification),
        Number(ownerDepartment),
        Number(resourceType)
      );
    });
  }
}
