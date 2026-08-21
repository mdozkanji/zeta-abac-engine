import type Redis from "ioredis";
import { SubjectAttributes, ResourceAttributes } from "../types";

const SUBJECT_KEY_PREFIX = "zeta:subject:";
const RESOURCE_KEY_PREFIX = "zeta:resource:";

/**
 * Thin wrapper around a Redis client (ioredis or compatible — including ioredis-mock, which
 * is what the test suite injects instead of a real Redis connection). Accepting the client as
 * a constructor argument rather than creating one internally is what makes this class testable
 * without a real Redis server: tests pass in an in-memory mock that implements the same
 * get/set/del interface.
 *
 * Values are stored as JSON strings — Redis itself only stores strings/bytes, so this is the
 * standard pattern for storing structured data in it.
 */
export class AttributeCache {
  constructor(private readonly redis: Pick<Redis, "get" | "set" | "del">) {}

  async setSubjectAttributes(subject: string, attrs: SubjectAttributes): Promise<void> {
    await this.redis.set(this.subjectKey(subject), JSON.stringify(attrs));
  }

  async getSubjectAttributes(subject: string): Promise<SubjectAttributes | null> {
    const raw = await this.redis.get(this.subjectKey(subject));
    return raw ? (JSON.parse(raw) as SubjectAttributes) : null;
  }

  async setResourceAttributes(resourceId: string, attrs: ResourceAttributes): Promise<void> {
    await this.redis.set(this.resourceKey(resourceId), JSON.stringify(attrs));
  }

  async getResourceAttributes(resourceId: string): Promise<ResourceAttributes | null> {
    const raw = await this.redis.get(this.resourceKey(resourceId));
    return raw ? (JSON.parse(raw) as ResourceAttributes) : null;
  }

  private subjectKey(subject: string): string {
    // Normalize to lowercase — Ethereum addresses are case-insensitive at the protocol level
    // (checksummed mixed-case is just a client-side error-detection convention), so without
    // normalizing, "0xABC..." and "0xabc..." would be treated as different cache entries for
    // what's actually the same on-chain address. This is a real, easy-to-miss bug class in
    // any code that keys data by Ethereum address.
    return `${SUBJECT_KEY_PREFIX}${subject.toLowerCase()}`;
  }

  private resourceKey(resourceId: string): string {
    return `${RESOURCE_KEY_PREFIX}${resourceId.toLowerCase()}`;
  }
}
