# Architecture

## 1. Components

### AttributeRegistry (smart contract)
Stores subject/resource attributes (role, clearance level, device trust score, etc.) as
on-chain state. Emits an event on every read-relevant change so off-chain services can react
without polling. Attributes are only ever mutated via the GovernanceVoting contract — there is
no direct "admin sets attribute" path.

### GovernanceVoting (smart contract)
Implements a **propose → vote → execute** pattern, generalized as a k-of-n proposal executor:
a proposal is `(target address, calldata bytes)`; once `threshold` governors approve, anyone
can call `execute()`, which performs `target.call(data)`. This single mechanism secures
attribute changes (targeting `AttributeRegistry`), policy updates (targeting
`PolicyRegistry`), and the governor set itself (a proposal can target `GovernanceVoting`'s own
`addGovernor`/`removeGovernor` — this is what makes the governor set self-amending without a
separate privileged admin). This is the mechanism that removes the single-admin trust
bottleneck — compromising one governor's key is not sufficient to alter access policy.

### PolicyRegistry (smart contract)
Stores a hash + URI pointer for the currently active off-chain policy rule set (see
`docs/abac-model.md` §6 for the full rationale). Updating the active policy requires the same
k-of-n governance approval as attribute mutation — the rules live off-chain for gas-cost
reasons, but *changing which rules are active* is still subject to the project's core
no-single-party-control property.

### AuditAnchor (smart contract)
The PDP logs every access decision off-chain (for cost and speed), then periodically writes a
cryptographic hash of the accumulated log to this contract. Anyone can later verify that the
off-chain log has not been retroactively altered by recomputing the hash and comparing it to
what's anchored on-chain — this is the "tamper-evident" property, achieved without putting
every single decision on-chain (which would be prohibitively slow and expensive).

### PDP — Policy Decision Point (off-chain service)
The actual "brain." Given an access request (subject, action, resource, context), it:
1. Reads the subject's/resource's current attributes (from a local cache synced to the chain
   via events — not a live chain call on every request, for latency reasons).
2. Evaluates the request against the active policy set.
3. Returns allow/deny.
4. Logs the decision for later audit anchoring.

### PEP — Policy Enforcement Point (middleware, deployed alongside protected apps)
Sits in front of a protected resource/application. Intercepts requests, calls the PDP, and
enforces its decision (lets the request through or rejects it). The PEP trusts the PDP's
answer but does not itself hold policy logic — this separation (decision vs. enforcement) is
standard in ABAC/XACML-style architectures and keeps the enforcement layer simple and
auditable.

## 2. Why this on-chain/off-chain split

Putting *everything* on-chain (attributes, policy evaluation, every decision) would be secure
in the tamper-evidence sense but operationally unusable — blockchain transactions are slow
(seconds, not milliseconds) and cost gas. Putting *everything* off-chain gives up the
tamper-evidence and multi-party governance properties that are the entire point of this
project.

The split used here:
- **On-chain:** things that change rarely and where tamper-evidence/consensus matters most —
  attribute values, policy rule changes, periodic audit-log hash anchors.
- **Off-chain:** things that happen frequently and need low latency — the actual per-request
  policy evaluation, attribute caching.

This is a deliberate design trade-off, not a limitation to apologize for — and it's worth
being able to articulate clearly, since "why isn't everything on-chain" is a natural question
from anyone reviewing this project.

## 3. Trust assumptions

- Individual governors (in the k-of-n voting scheme) are not fully trusted individually — the
  system's security rests on the assumption that fewer than k of them are simultaneously
  compromised or colluding.
- The PDP is trusted to evaluate policy correctly and log honestly *between* audit anchors —
  the on-chain anchor exists specifically to make dishonesty about *past* decisions detectable
  after the fact, not to prevent it in real time. This is an important nuance: ZeTA provides
  **tamper-evidence**, not real-time tamper-prevention, for the off-chain decision log.
- The PEP is trusted to actually enforce what the PDP returns — a compromised PEP that ignores
  "deny" responses is out of scope for this project's threat model (see `threat-model.md`),
  though it's noted as a real limitation.

## 4. Data flow (typical request)

```
1. Client → PEP: "I want to GET /vault/document-42"
2. PEP → PDP: decide(subject=alice, action=read, resource=document-42, context={...})
3. PDP: look up cached attributes for alice & document-42 (synced from AttributeRegistry)
4. PDP: evaluate active policy rules against those attributes + context
5. PDP → PEP: { decision: "allow", reason: "...", decisionId: "..." }
6. PDP: append decision to local audit log (later hash-anchored on-chain)
7. PEP: forwards request to the actual resource, or rejects it
```

*(This document will be expanded with sequence diagrams once the PDP service exists — Week 5.)*
