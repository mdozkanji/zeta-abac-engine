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

---

## Week 4 — Security Review Tooling & Testnet Deployment Setup (2026-08-20)

### Built
- **Resolved the self-removal-voting question** from Week 3: decided to leave it as-is — the
  `CannotDropBelowThreshold` check is the real safety mechanism, and this matches established
  practice in production multisig systems (Gnosis Safe doesn't restrict self-removal votes
  either). Documented in `docs/threat-model.md` with rationale, not left dangling.
- `docs/security-review.md`: Slither setup instructions, a severity-tier interpretation
  guide, and — written *before* running Slither — a list of findings we already expect and
  why (the `GovernanceVoting.execute()` low-level `.call()` to an arbitrary target is
  intentional and central to the design, not an oversight).
- Gas reporter wired into `hardhat.config.ts` (`REPORT_GAS=true npx hardhat test`).
- Sepolia network + Etherscan verification config in `hardhat.config.ts`, loaded via
  `dotenv`. `.env.example` documents required variables without ever containing real values.
- `scripts/generate-governors.ts`: generates 3 throwaway wallets for the testnet governor set.
- `scripts/deploy.ts`: deploys all three contracts in dependency order, writes
  `deployments/sepolia.json` (safe to commit — addresses are public regardless), prints
  ready-to-run `hardhat verify` commands.
- `DEPLOYMENT.md`: full walkthrough.
- **Deliberate scope decision**: Sepolia governor set is 3 wallets, k=2 — not the k=3-of-5
  used in local Hardhat tests. Real multi-party governance without needing to fund 5 separate
  testnet wallets; a documented, intentional simplification for the deployment demo, not the
  "real" security configuration.

### Learned / noted
- This week's split of labor is different from previous weeks: Slither, funding testnet
  wallets, and actually submitting a deployment transaction are all things that genuinely
  require the developer's own machine/accounts/funds — not just verification of something
  already run in the build sandbox. Worth naming that distinction explicitly rather than
  blurring "I wrote code" and "this was executed" together.
- Deployer key (pays gas to deploy) and governor keys (vote on proposals after deployment)
  are deliberately different roles/wallets — mirrors the actual design principle (no single
  account should hold multiple kinds of authority) even down to the tooling/testing setup.

### Next (pending Mofeed's local run)
- Run Slither, review findings together against the "expected findings" list in
  `docs/security-review.md`.
- Run the gas report, note any surprisingly expensive operations.
- Actually deploy to Sepolia and verify on Etherscan.
- Once deployment is confirmed: Week 5 — PDP service skeleton, on-chain attribute sync.

---

## Week 4 (cont.) — First Real Slither Run (2026-08-20)

### Results
Slither ran cleanly, found exactly 3 results:
1. **`reentrancy-events`** in `GovernanceVoting.execute()` — event emitted after the external
   call. **Fixed**: moved `emit ProposalExecuted(...)` before `p.target.call(p.data)`. Safe
   because a failed call reverts the whole transaction anyway.
2. **`costly-loop`** in `removeGovernor()`'s swap-and-pop. **Accepted, documented in-code**:
   governor sets are expected to stay small; O(n) is negligible at that scale.
3. **`low-level-calls`** on `execute()`'s arbitrary `target.call(data)`. **Accepted by
   design** — and correctly predicted before running Slither at all, in last session's
   `docs/security-review.md` write-up.

### Fixed
- Unrelated environment glitch: `dotenv` v17's default stdout "tip" logging broke Hardhat's
  JSON output that `crytic-compile` (Slither's Hardhat integration) expects to parse cleanly,
  producing `Problem deserializing hardhat configuration, using defaults`. Fixed with
  `dotenv.config({ quiet: true })`.

### Learned
- Predicting a finding correctly *before* running the tool (the `low-level-calls` case) is a
  genuinely useful signal that the design's security reasoning holds up under automated
  review, not just our own read of the code.
- A realistic ratio for a first Slither pass on a reasonably careful codebase: fix what's
  cheaply and safely fixable, consciously document-and-accept what isn't worth the added
  complexity, and never silently ignore a finding either way.
- "Deserializing configuration" errors from tools that shell out to other tools and parse
  their stdout are often caused by an unrelated third tool printing unexpected banner/log
  text into that stream — worth checking for that class of cause before assuming your own
  config is malformed.

### Next
- Gas report (`REPORT_GAS=true npx hardhat test`).
- Actual Sepolia deployment + Etherscan verification.

---

## Week 4 (cont.) — Confirmed: 40/40 passing, Slither down to 2 accepted findings (2026-08-20)

### Confirmed
- `npx hardhat test` after the fixes: **40/40 passing**, no regressions from the event-order
  change.
- `python3 -m slither .`: **2 results** (down from 3) — `reentrancy-events` resolved as
  expected; `costly-loop` and `low-level-calls` remain, both previously accepted/documented.
- The `dotenv.config({ quiet: true })` fix worked — no more "Problem deserializing hardhat
  configuration" noise in Slither's output.

### Gas report findings
- `propose()`: avg ~215k gas (up to ~324k) — by far the most expensive call.
- `approve()`: avg ~58k gas.
- `execute()`: avg ~84k gas (naturally varies with what the target call itself costs).
- `updatePolicy()`: avg ~41k gas.
- **Why `propose()` costs so much more**: it's the only function writing variable-length data
  (`bytes calldata data`, `string description`) into contract storage. Storage writes for
  variable-length data are the most expensive EVM operation type, scaling with size —
  `approve()` by contrast just flips a boolean and increments a counter, both fixed-size, cheap
  writes. General intuition worth keeping: transaction cost is dominated by how much *new
  storage* is touched, not by how much "logic" runs.
- No immediate optimization action taken — these numbers are reasonable for what each function
  does, and premature gas-golfing before the design is even deployed once would be optimizing
  the wrong thing at the wrong time. Worth flagging as an explicit "measured, understood, not
  changed" decision rather than silently skipping this trade-off entirely.

### Next
- Actual Sepolia deployment (wallet funding, `scripts/deploy.ts`, Etherscan verification) —
  the one remaining piece of Week 4.

---

## Week 4 — Complete: Live on Sepolia (2026-08-20)

### Deployed
All three contracts live on Sepolia:
- `GovernanceVoting`: `0xf6cc22ce616CFeEc90BBbEcD0C78B3025ee98ABa` (3 governors, k=2)
- `AttributeRegistry`: `0x4004A83f8963B5943D08FE7FC4C3E550973C6362`
- `PolicyRegistry`: `0x019BFB227c1c22A1ed44E5e7c597E46BfdFf0965`

`AttributeRegistry` and `PolicyRegistry` verified on Etherscan on the first attempt.
`GovernanceVoting` hit a real, well-documented tooling limitation.

### Fixed
- **`hardhat-verify` doesn't reliably parse array-typed constructor arguments passed inline
  on the shell**, even with careful quoting — failed with `Value [...] cannot be encoded for
  the parameter initialGovernors` / `expected array value`. This only affected
  `GovernanceVoting` (its constructor takes `address[] initialGovernors`); `AttributeRegistry`
  and `PolicyRegistry` have only scalar constructor args and verified cleanly first try.
  **Fix**: pass array-containing constructor args via a small `.js` file (`module.exports =
  [...]`) and `hardhat verify --constructor-args <file>` instead of inline arguments.
  `scripts/deploy.ts` now auto-generates this file at deploy time from the same variables used
  to actually deploy, so future deployments won't hit this manually.
- Recorded the real deployed addresses in `deployments/sepolia.json` and linked them in
  `README.md` — this is genuinely portfolio content now, not just internal bookkeeping: a
  live, verifiable, deployed instance of the thesis architecture.

### Learned
- Not every deployment failure is a bug in the contract or a misunderstanding of Solidity —
  some are just CLI tooling limitations with specific argument types. Worth recognizing the
  difference quickly (the error message here was actually fairly explicit about what it
  didn't like) rather than assuming a deployment problem means a design problem.
- Generating deployment-time artifacts (like the constructor-args file) automatically, from
  the same source of truth used for the actual deployment, avoids an entire class of
  transcription bugs that come from manually retyping addresses/args later.

### Week 4 — closed out. Next: Week 5
- PDP service skeleton (Node/TypeScript).
- On-chain attribute sync via ethers.js, listening to `AttributeRegistry`'s events.
- Redis-backed attribute cache.
