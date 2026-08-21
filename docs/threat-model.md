# Threat Model

A first-pass threat model, structured around: who the adversaries are, what they want, and
which ZeTA component is supposed to stop them. This gets refined as the system is built —
threat modeling is not a one-time Week 0 exercise, it's revisited every time we add a
component.

## Adversaries considered

### 1. Malicious/compromised single administrator
**Goal:** grant themselves or a colluding party unauthorized access by directly editing
attributes or policy.
**Mitigation:** GovernanceVoting's k-of-n requirement — no single governor's key is sufficient
to execute a change. **Residual risk:** if k or more governors are compromised (e.g., via a
shared key-management failure), this protection collapses. Worth stating explicitly rather
than glossing over.

### 2. Compromised PDP
**Goal:** return incorrect (over-permissive) access decisions, or falsify the audit log.
**Mitigation:** periodic on-chain hash-anchoring of the audit log makes *retroactive* log
tampering detectable. **Residual risk:** a compromised PDP can still make bad *real-time*
decisions and log them "honestly" — hash-anchoring proves the log wasn't altered after the
fact, it does not prove the decisions were correct. This is a limitation of the design, not
solved by this architecture, and should be paired with independent PDP integrity monitoring
in any real deployment.

### 3. Compromised or malicious PEP
**Goal:** ignore a "deny" decision and forward the request anyway.
**Mitigation:** out of scope for this project's core contribution — PEP integrity is a
standard enforcement-point security problem (code signing, attestation, etc.) that exists
independently of ZeTA's contribution (governance + audit-evidence). Noted here so it's not
silently assumed away.

### 4. Network attacker (man-in-the-middle between PEP and PDP)
**Goal:** intercept or forge a decision response.
**Mitigation:** TLS between PEP and PDP (standard practice, will be enforced in Week 7's
integration); decisions can optionally be signed by the PDP so a PEP can verify authenticity
independent of transport security.

### 5. Malicious governor (within the k-of-n set) acting alone
**Goal:** push through an unauthorized attribute/policy change.
**Mitigation:** by construction, a single governor cannot execute a proposal — this is the
core property `GovernanceVoting` is designed to guarantee. Directly tested with adversarial
unit tests in Week 3 (`test/GovernanceVoting.test.ts`, `test/Integration.test.ts`): a
single-signer attempting to force execution always fails with `ThresholdNotMet`, and a
governor calling `AttributeRegistry` directly (bypassing governance entirely) always fails
with `NotGovernance`.

**Open design question found during Week 3 testing:** the current implementation does not
prevent a governor from voting on a proposal to remove *themselves* from the governor set.
Real-world multisig systems vary on this — some disallow self-removal votes, others allow it
since the remaining threshold check still provides a safety floor. Left as-is for now (the
`CannotDropBelowThreshold` check still prevents the governor set from shrinking past `k`
regardless of who votes), but flagged here rather than silently assumed correct.

### 6. Smart contract-specific attacks (reentrancy, integer issues, access-control bugs)
**Goal:** exploit implementation bugs in the contracts themselves, independent of the
access-control model they implement.
**Mitigation:** Solidity 0.8.x built-in overflow protection; OpenZeppelin's audited
`AccessControl`/`ReentrancyGuard` patterns where relevant; static analysis (Slither) before
testnet deployment in Week 4.

## Explicitly out of scope (for this project's current scope)

- Formal verification of the smart contracts (would be a valuable future extension, not
  attempted in the initial 8-week build).
- Physical/hardware security of governor key storage.
- Denial-of-service resilience of the PDP service at scale (noted as a benchmarking topic in
  Week 8, not a security-hardening one).

## Why documenting this matters beyond security hygiene

A written threat model is exactly the kind of artifact that turns "I built a blockchain
access control thing" into "I built a system with an explicit, defensible security
argument" — which is the difference that matters for research credibility, PhD interviews,
and any serious technical review of this repo.
