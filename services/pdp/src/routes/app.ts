import express, { Express } from "express";
import { AttributeCache } from "../cache/attributeCache";

/**
 * Factory function rather than a module-level app instance — this is what lets tests build an
 * app wired to a test cache (backed by ioredis-mock) without needing a real Redis connection,
 * and lets src/index.ts build the real one wired to a real Redis client. Same pattern as
 * AttributeCache/AttributeSync: dependencies passed in, not constructed internally.
 */
export function createApp(cache: AttributeCache): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Debug/demo endpoints — read-only, directly expose what the PDP's cache currently believes
  // about a subject/resource. Useful for verifying the chain sync is actually working during
  // development, ahead of Week 6's real /decide logic needing this same cache lookup.
  app.get("/attributes/subject/:address", async (req, res) => {
    const attrs = await cache.getSubjectAttributes(req.params.address);
    if (!attrs) {
      res.status(404).json({ error: "Subject not found in cache" });
      return;
    }
    res.json(attrs);
  });

  app.get("/attributes/resource/:id", async (req, res) => {
    const attrs = await cache.getResourceAttributes(req.params.id);
    if (!attrs) {
      res.status(404).json({ error: "Resource not found in cache" });
      return;
    }
    res.json(attrs);
  });

  // Stub — real policy evaluation arrives in Week 6 (docs/abac-model.md's rule engine). This
  // week's scope is proving the chain-sync -> cache -> HTTP-readable pipeline works end to
  // end; wiring the actual ABAC decision logic in here is deliberately deferred, not
  // forgotten. Documenting that explicitly in the response itself (not just in comments)
  // means anyone testing this endpoint before Week 6 lands sees why it always says "allow"
  // rather than assuming the policy engine is broken.
  app.post("/decide", (req, res) => {
    res.json({
      decision: "allow",
      reason: "STUB: policy evaluation not yet implemented (arrives Week 6)",
      request: req.body,
    });
  });

  return app;
}
