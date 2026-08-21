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

## Interpreting output

Slither reports findings in four severity tiers. A rough guide to how seriously to take each,
specifically for *this* project's contracts:

| Severity | What it usually means | Action |
|---|---|---|
| **High** | Likely a real, exploitable bug (reentrancy, unchecked calls, access control gaps) | Must understand and fix, or document explicitly why it's a false positive |
| **Medium** | Often a real issue, sometimes a false positive in a specific context | Read carefully — don't dismiss without understanding *why* Slither flagged it |
| **Low** | Style/best-practice suggestions (missing zero-address checks, unused variables) | Worth fixing when cheap, otherwise note and move on |
| **Informational** | Things like "consider using `external` instead of `public`" | Optional polish |

**Known, expected findings for this codebase** (documenting *before* running, based on the
contracts' actual design, so we can tell real findings apart from ones we already understand):
- `GovernanceVoting.execute()` uses a low-level `.call()` to an arbitrary `target` address —
  Slither will likely flag this as "arbitrary send" or "low-level call" pattern (often a
  Medium/High flag). This is intentional and central to the design (see
  `docs/architecture.md`) — the target is only ever reachable via an already-approved k-of-n
  proposal, not attacker-controlled input. Worth confirming Slither's specific finding
  matches this understanding rather than assuming it does.
- Custom errors with parameters (e.g., `ClearanceOutOfRange(uint8)`) are a newer Solidity
  feature Slither sometimes has incomplete/older detector support for — informational-only
  noise here, not a real concern.

## What to do with results

Paste the actual output back and we'll go through each finding together — this is exactly the
kind of review a real security assessment involves: not blindly fixing everything a tool
flags, but understanding *why* it's flagged and making a documented decision either way.

## Gas report

Alongside static analysis, run the gas reporter (configured in `hardhat.config.ts` this week):

```bash
REPORT_GAS=true npx hardhat test
```

This prints a table of gas cost per function call across the test suite — useful both for
spotting unexpectedly expensive operations and, later, for the "benchmarks" section of the
Week 8 writeup.
