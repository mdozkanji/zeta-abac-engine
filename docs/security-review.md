# Security Review — Week 4

Static analysis pass using [Slither](https://github.com/crytic/slither), a Python-based
Solidity static analyzer maintained by Trail of Bits (a well-regarded smart contract security
firm — this isn't a random linter, it's close to industry standard for a first-pass automated
review).

## Setup (run on your machine — Slither needs the Solidity compiler, which this project's
build sandbox can't reach; see `docs/devlog.md` Week 0/2 entries for that constraint)

```bash
pip install slither-analyzer --break-system-packages
# or, cleaner: use a virtual environment
python3 -m venv .venv && source .venv/bin/activate && pip install slither-analyzer
```

Confirm it installed:
```bash
slither --version
```

## Running it

From the project root:
```bash
slither .
```

Slither auto-detects the Hardhat project structure and compiles via `solc` itself (using the
same `0.8.24` version pinned in `hardhat.config.ts`).

## Interpreting output (general reference, useful for future re-runs too)

Slither reports findings in four severity tiers. A rough guide to how seriously to take each:

| Severity | What it usually means | Action |
|---|---|---|
| **High** | Likely a real, exploitable bug (reentrancy, unchecked calls, access control gaps) | Must understand and fix, or document explicitly why it's a false positive |
| **Medium** | Often a real issue, sometimes a false positive in a specific context | Read carefully — don't dismiss without understanding *why* Slither flagged it |
| **Low** | Style/best-practice suggestions (missing zero-address checks, unused variables) | Worth fixing when cheap, otherwise note and move on |
| **Informational** | Things like "consider using `external` instead of `public`" | Optional polish |

## Actual results (Week 4, first real run)

Slither ran cleanly and found exactly 3 results across all three contracts:

| Finding | Severity | Resolution |
|---|---|---|
| `reentrancy-events` in `GovernanceVoting.execute()` — event emitted after the external `.call()` | Low/informational | **Fixed.** Moved the `emit ProposalExecuted(...)` before the call. Safe because a failed call reverts the whole transaction anyway, unwinding the emit along with everything else — there was no reason not to fix this one. |
| `costly-loop` in `GovernanceVoting.removeGovernor()` — `.pop()` inside a loop | Informational | **Accepted, documented in code.** Governor sets in this design are expected to stay small (single digits to low tens of addresses); the O(n) scan cost is negligible at that scale. |
| `low-level-calls` in `GovernanceVoting.execute()` — the arbitrary `target.call(data)` | Medium (Slither's default severity for this detector) | **Accepted by design.** This is the intentional core mechanism the whole architecture is built around (see `docs/architecture.md`) — the target is only ever reachable via an already-approved k-of-n proposal, never attacker-controlled input directly. Predicted correctly before running Slither at all (see the now-superseded prediction this section replaces), which is a good sign the design's security reasoning holds up against automated review, not just our own read of it. |

**One environment issue found along the way, unrelated to the contracts themselves:**
Slither's first run showed `Problem deserializing hardhat configuration, using defaults` —
traced to `dotenv` v17's default console logging (a "tip" message) polluting the JSON output
Hardhat/crytic-compile expects to parse cleanly. Fixed with `dotenv.config({ quiet: true })`
in `hardhat.config.ts`. Worth knowing about generically: any tool that shells out to another
tool and parses its stdout as structured data is vulnerable to this exact class of bug if
either tool starts printing unexpected banner/tip text — a good instinct to have when a
parser error shows up with no obvious cause in your own code.

**Takeaway:** of 3 findings, 1 was worth fixing (and safely fixable), 2 were worth
understanding and consciously accepting rather than either blindly fixing or blindly
ignoring. That 1-fix-2-accept ratio is a realistic outcome for a first Slither pass on a
reasonably careful codebase — not every finding demands a code change, but every finding
deserves an explicit decision.

## Gas report

Alongside static analysis, run the gas reporter (configured in `hardhat.config.ts` this week):

```bash
REPORT_GAS=true npx hardhat test
```

This prints a table of gas cost per function call across the test suite — useful both for
spotting unexpectedly expensive operations and, later, for the "benchmarks" section of the
Week 8 writeup.
