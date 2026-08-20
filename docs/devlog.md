# Devlog

Running log of what was built, what was learned, and what's next — updated every session.

---

## Week 0 — Environment Setup & Foundations (2026-08-20)

### Built
- Project scaffold: `contracts/`, `test/`, `scripts/`, `docs/`
- `package.json`, `hardhat.config.ts`, `tsconfig.json`
- `.gitignore` (explicitly excludes `.env` — no secrets ever committed)
- `LICENSE` (MIT)
- `README.md`, `docs/architecture.md`, `docs/threat-model.md`

### Learned
- **Hardhat 3 vs. Hardhat 2:** `npm install hardhat` pulled the newest major version
  (Hardhat 3), which is ESM-only with a different config format. Deliberately downgraded to
  Hardhat 2.x, which is what the surrounding tutorial/plugin ecosystem is actually built
  around. Lesson: "latest" is not always the right choice for a learning project that depends
  on external documentation being applicable.
- **ts-node / TypeScript version coupling:** installing TypeScript unpinned pulled in a very
  new major version (7.x, part of the native-compiler rewrite) that `ts-node` 10.9.2 doesn't
  yet support, causing an opaque internal error (`Cannot read properties of undefined`).
  Pinned TypeScript to `^5.6` to match what ts-node/Hardhat 2 actually expect. Lesson: cryptic
  errors from dev tooling are very often version-mismatch issues between the tool and its
  runtime dependency, not bugs in your own code — check `node_modules/<pkg>/package.json`
  versions before assuming otherwise.
- **Dev-time vs. runtime vulnerability risk:** `npm audit` reported ~40 vulnerabilities after
  installing Hardhat 2's dependency tree — all in old transitive dev-tooling dependencies
  (`glob`, `uuid`), not in code that ever runs in production. Distinguishing "this runs at
  build time on my machine" from "this runs in the deployed service" is an important
  practical triage skill, not something to reflexively `npm audit fix --force` away (which can
  itself introduce breaking changes).
- Confirmed the standard ABAC architecture split: PDP (decision) vs. PEP (enforcement) is a
  long-standing pattern (XACML terminology) — ZeTA's contribution is specifically in how the
  PDP's underlying attribute/policy store is governed, not in reinventing this split.

### Next (Week 1)
- Formally define the attribute schema (subject/resource/environment categories).
- Design the JSON policy rule format.
- Write 5–10 example policies by hand before writing any contract code.
