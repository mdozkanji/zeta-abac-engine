import request from "supertest";
import RedisMock from "ioredis-mock";
import { AttributeCache } from "../src/cache/attributeCache";
import { createApp } from "../src/routes/app";
import { Role, Department, ResourceType } from "../src/types";

describe("PDP Express app", () => {
  let cache: AttributeCache;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    cache = new AttributeCache(new RedisMock());
    app = createApp(cache);
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("GET /attributes/subject/:address", () => {
    it("returns 404 for an address not in the cache", async () => {
      const res = await request(app).get(
        "/attributes/subject/0x1234567890123456789012345678901234567890"
      );
      expect(res.status).toBe(404);
    });

    it("returns cached attributes for a known address", async () => {
      const address = "0x1234567890123456789012345678901234567890";
      await cache.setSubjectAttributes(address, {
        role: Role.Manager,
        clearance: 3,
        department: Department.Legal,
        deviceTrustScore: 92,
      });

      const res = await request(app).get(`/attributes/subject/${address}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        role: Role.Manager,
        clearance: 3,
        department: Department.Legal,
        deviceTrustScore: 92,
      });
    });
  });

  describe("GET /attributes/resource/:id", () => {
    it("returns 404 for a resource not in the cache", async () => {
      const res = await request(app).get("/attributes/resource/0xnonexistent");
      expect(res.status).toBe(404);
    });

    it("returns cached attributes for a known resource", async () => {
      const resourceId = "0xdoc42";
      await cache.setResourceAttributes(resourceId, {
        classification: 4,
        ownerDepartment: Department.Security,
        resourceType: ResourceType.Report,
      });

      const res = await request(app).get(`/attributes/resource/${resourceId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        classification: 4,
        ownerDepartment: Department.Security,
        resourceType: ResourceType.Report,
      });
    });
  });

  describe("POST /decide (stub)", () => {
    it("always returns an allow decision, clearly labeled as a stub", async () => {
      const res = await request(app)
        .post("/decide")
        .send({ subject: "alice", action: "read", resource: "doc-1" });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe("allow");
      expect(res.body.reason).toMatch(/STUB/);
      // Echoes the request back — useful during Week 6 development to confirm the real
      // request shape reaches the endpoint correctly before the actual policy logic exists.
      expect(res.body.request).toEqual({ subject: "alice", action: "read", resource: "doc-1" });
    });
  });
});
