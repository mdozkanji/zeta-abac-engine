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

---

## Week 1 — ABAC Model & Policy Rule Design (2026-08-20)

### Built
- `docs/abac-model.md`: full attribute schema (subject/resource/environment/action) for the
  document-vault demo scenario, a JSON policy rule format supporting comparisons, boolean
  and/or logic, and cross-attribute references (e.g.
  `resource.classification <= subject.clearance`).
- 9 hand-written example policies covering clearance gating, department isolation, role-based
  overrides, context-based restrictions (working hours, network), and hard admin-only gates.
- Explicit **deny-overrides** combining algorithm decision, with rationale — this becomes a
  directly testable property in Week 6.

### Learned
- Attribute schemas are expensive to change after they're encoded into contract storage —
  worth the up-front "paper" design pass NIST SP 800-162 recommends, rather than discovering
  gaps mid-contract-write.
- A combining algorithm (deny-overrides vs. permit-overrides) has to be an explicit, written
  decision — without it, allow and deny rules can silently contradict each other.
- Found (and deliberately deferred) a genuine open design question: does the full rule *set*
  need on-chain governance the same way attribute *values* do, or is that overkill? Carried
  into Week 2 rather than guessed at.

### Fixed
- Week 0's `mkdir -p .../{contracts,test,scripts,docs}` silently failed to brace-expand and
  created one bogus literal directory instead of four real ones. `contracts/`, `test/`, and
  `scripts/` didn't actually exist until this session — caught and fixed before it caused
  problems in Week 2.

### Next (Week 2)
- Write `AttributeRegistry.sol`: on-chain storage for subject/resource attributes defined in
  `docs/abac-model.md`, with events emitted on change.
- Unit tests in Hardhat for attribute get/set behavior.
- Resolve the open question above (on-chain rule storage vs. off-chain + hash) before writing
  the contract, since it affects the storage layout.

---

## Week 2 — Attribute Registry Contract (2026-08-20)

### Built
- Resolved the Week 1 open question: **off-chain policy rules + on-chain hash anchor**
  (`docs/abac-model.md` §6, `docs/architecture.md` updated with a new `PolicyRegistry`
  component, arriving Week 3 alongside governance).
- `contracts/AttributeRegistry.sol`: on-chain subject/resource attribute storage matching the
  Week 1 schema exactly. `onlyOwner`-gated writes (deliberate Week 2 placeholder — Week 3
  swaps this for `GovernanceVoting`'s k-of-n approval), custom errors for gas efficiency,
  events for off-chain PDP cache sync, and revert-on-missing (not zeroed-default) reads.
- `test/AttributeRegistry.test.ts`: 9 unit tests covering write/read round-trips, event
  emission, owner-gating, input validation (clearance/classification/trust-score bounds), and
  the revert-on-unregistered-attribute behavior.
- Installed `@openzeppelin/contracts@^4.9.0` for the audited `Ownable` implementation rather
  than hand-rolling access control.

### Learned
- The on-chain/off-chain storage split from `docs/architecture.md` isn't just a diagram —
  writing the actual contract makes concrete *why* attribute values (simple, frequent writes)
  and policy rules (complex, infrequent writes) warrant different storage strategies.
- Custom Solidity errors (`error ClearanceOutOfRange(uint8)` + `revert
  ClearanceOutOfRange(x)`) vs. `require(cond, "string")` — the modern, gas-cheaper pattern
  since Solidity 0.8.4.
- Design habit: build the *real* interface (function signatures, events, validation) now, and
  isolate the *not-yet-correct* part (owner-only access) behind a clear doc comment rather
  than waiting for governance to exist before writing anything. Each week stays independently
  testable this way.
- **Environment constraint hit:** the sandbox this project is built in has an outbound
  network allowlist that doesn't include `binaries.soliditylang.org` (where Hardhat fetches
  the Solidity compiler), so contracts are written and reasoned about here but compiled/tested
  on the developer's own machine, which has normal network access.

### Next (Week 3)
- `GovernanceVoting.sol`: propose → vote → execute pattern, k-of-n approval threshold.
- Wire `AttributeRegistry` to require governance approval instead of `onlyOwner`.
- `PolicyRegistry.sol`: hash + URI anchor for the off-chain policy rule set, same governance
  gating.
- Adversarial tests: a single governor acting alone must never succeed in forcing a change.

---

## Week 3 — Governance & Real Access Control (2026-08-20)

### Built
- `contracts/GovernanceVoting.sol`: generic k-of-n proposal executor. A proposal is
  `(target, calldata)`; once `threshold` governors approve, `execute()` performs
  `target.call(data)`. One mechanism secures attribute changes, policy updates, AND the
  governor set itself (self-amending via proposals targeting the contract's own
  `addGovernor`/`removeGovernor`) — no separate privileged admin anywhere.
- **Rewired `AttributeRegistry.sol`**: removed `Ownable`/`onlyOwner` entirely. Access is now
  gated by an immutable `governance` address set at deployment, expected to be a
  `GovernanceVoting` contract. This is Week 2's explicitly-flagged placeholder now replaced
  with the project's actual core security property.
- `contracts/PolicyRegistry.sol`: hash + URI anchor for the off-chain policy rule set,
  governance-gated the same way.
- Decided: governor set (n) is self-amending via k-of-n vote; threshold (k=3) is fixed at
  deployment, deliberately not amendable yet (flagged as a documented future extension rather
  than allowing the self-amending mechanism to silently lower its own bar).
- Full rewrite of `test/AttributeRegistry.test.ts` for the new access-control model. New
  `test/GovernanceVoting.test.ts` (happy path, adversarial single-governor tests,
  self-amending governor add/remove, threshold-floor protection). New
  `test/Integration.test.ts` wiring the real `GovernanceVoting` + `AttributeRegistry` together
  end-to-end. New `test/PolicyRegistry.test.ts`.

### Learned
- **The core multisig pattern**: `propose(target, data) → approve × k → execute()` calling
  `target.call(data)` is the same conceptual design used by production tools like Gnosis
  Safe — recognizing this pattern is broadly transferable, not specific to this project.
- **Effects-before-interaction ordering**: `execute()` marks a proposal `executed = true`
  *before* making the external `target.call(data)` — standard reentrancy-safety practice, even
  though this project's threat model treats proposal targets as known/trusted contracts.
- **A real bug caught before shipping**: an early draft of the "cannot drop governors below
  threshold" test only collected 2 of 3 required approvals, so `execute()` would have failed
  with `ThresholdNotMet` — the wrong reason — instead of exercising the actual
  `CannotDropBelowThreshold` code path. Traced through the approval count by hand and fixed it
  before running anything. This is a generally useful habit for any access-control test: always
  verify you're testing the failure you think you're testing, not an earlier, unrelated one.
- **A genuine open design question surfaced by testing, not by design review**: nothing stops
  a governor from voting on a proposal to remove themselves. Documented in
  `docs/threat-model.md` as an explicit open question rather than silently resolved either way.
- Testing an access-control contract benefits from two layers: unit-test each contract in
  isolation (using a plain EOA as a stand-in for "governance" or "target") to isolate its own
  logic, *then* a smaller integration suite wiring the real contracts together to prove the
  end-to-end claim. Caught nothing extra here, but it's the right structure going forward.

### Next (Week 4)
- Static analysis (Slither) across all three contracts.
- Gas optimization pass.
- Deploy to Sepolia testnet; write `DEPLOYMENT.md`.
- Decide (and document) the self-removal-voting question flagged in the threat model before
  or during hardening — worth resolving with intent rather than carrying it further unaddressed.
