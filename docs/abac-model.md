# ABAC Model & Policy Rule Format

This document precisely defines the attribute schema and policy rule language for ZeTA,
scoped to the document/file access demo scenario. Written *before* any contract code, per the
NIST SP 800-162 ABAC guidance: get the model right on paper first, because attribute schemas
are expensive to change once they're encoded in a smart contract's storage layout.

## 1. Demo scenario

A classified-document vault. Subjects (employees) request to read, write, or declassify
documents. Access depends on clearance level, role, document classification, and situational
context (e.g., is the request coming from a trusted device, during working hours).

## 2. Attribute categories

NIST SP 800-162 defines three attribute categories: **subject**, **resource/object**, and
**environment**. We add a fourth practical category, **action**, since "what is being
attempted" needs its own vocabulary even though it's not strictly an "attribute" in the
formal sense.

### 2.1 Subject attributes (the requester)

| Attribute | Type | Example values | Notes |
|---|---|---|---|
| `subject.id` | address (on-chain identifier) | `0xAbC...` | Maps to a real identity off-chain |
| `subject.role` | enum | `analyst`, `manager`, `auditor`, `admin` | |
| `subject.clearance` | uint (0–4) | `0`=none … `4`=top-secret | Ordinal — supports `gte`/`lte` comparisons |
| `subject.department` | enum | `engineering`, `legal`, `security` | |
| `subject.device_trust_score` | uint (0–100) | `85` | Set by a separate device-posture system; consumed here as environment-like context on the subject |

### 2.2 Resource attributes (the document)

| Attribute | Type | Example values | Notes |
|---|---|---|---|
| `resource.id` | bytes32 (document hash/ID) | — | |
| `resource.classification` | uint (0–4) | same scale as `subject.clearance` | This shared scale is what enables the cross-attribute rule `resource.classification <= subject.clearance` |
| `resource.owner_department` | enum | same set as `subject.department` | |
| `resource.type` | enum | `report`, `contract`, `personnel_record` | |

### 2.3 Environment/context attributes (situational)

| Attribute | Type | Example values | Notes |
|---|---|---|---|
| `context.time_of_day` | uint (0–23, hour) | `14` | |
| `context.is_working_hours` | bool | `true` | Derived convenience attribute, computed at request time |
| `context.network` | enum | `corporate_vpn`, `public`, `internal` | |
| `context.request_timestamp` | uint (unix time) | — | For logging, not typically used in rule conditions directly |

### 2.4 Action vocabulary

`read`, `write`, `declassify`, `delete` — a fixed enum, not open text, so contract-side
validation is simple and unambiguous.

## 3. Policy rule format

A rule is a JSON object with five parts: `effect`, `subject`, `action`, `resource`, and an
optional `condition` block for environment/cross-attribute logic.

### 3.1 Operators supported

| Operator | Meaning | Applies to |
|---|---|---|
| `eq` | equals | any type |
| `neq` | not equals | any type |
| `gte` / `lte` / `gt` / `lt` | ordinal comparison | numeric/ordinal types only |
| `in` | value is one of a list | enums |
| `and` / `or` | boolean composition | combining conditions |
| *(bare attribute reference)* | compares one attribute to another, not to a literal | enables `resource.classification <= subject.clearance` |

### 3.2 Rule schema (informal)

```json
{
  "id": "string, unique rule identifier",
  "effect": "allow | deny",
  "action": "read | write | declassify | delete",
  "subject": { "<attribute>": <condition> , "...": "..." },
  "resource": { "<attribute>": <condition>, "...": "..." },
  "condition": { "and | or": [ <condition>, "..." ] }
}
```

A `<condition>` is either:
- a literal value (implicit `eq`): `"role": "analyst"`
- an operator object: `"clearance": { "gte": 2 }`
- a cross-attribute reference: `"classification": { "lte": "subject.clearance" }`

## 4. Example policies (hand-written, before any contract code)

**Rule 1 — Base clearance rule.** A subject may read a document only if their clearance
level is at least the document's classification level.
```json
{
  "id": "R1-clearance-gate",
  "effect": "allow",
  "action": "read",
  "resource": { "classification": { "lte": "subject.clearance" } }
}
```

**Rule 2 — Department isolation.** Analysts may only read documents owned by their own
department, regardless of clearance.
```json
{
  "id": "R2-dept-isolation",
  "effect": "allow",
  "action": "read",
  "subject": { "role": "analyst" },
  "resource": { "owner_department": "subject.department" }
}
```

**Rule 3 — Managers cross department boundaries.** Managers may read documents from any
department, as long as clearance still gates access (Rule 1 still applies independently —
rules are combined, not mutually exclusive; see §5).
```json
{
  "id": "R3-manager-cross-dept",
  "effect": "allow",
  "action": "read",
  "subject": { "role": "manager" }
}
```

**Rule 4 — Top-secret requires working hours + corporate network.** Regardless of clearance,
top-secret documents (classification 4) can only be read during working hours on the
corporate VPN.
```json
{
  "id": "R4-top-secret-context-gate",
  "effect": "deny",
  "action": "read",
  "resource": { "classification": 4 },
  "condition": {
    "or": [
      { "context.is_working_hours": false },
      { "context.network": { "neq": "corporate_vpn" } }
    ]
  }
}
```

**Rule 5 — Device trust gate for write actions.** Writing to any document requires a device
trust score of at least 70.
```json
{
  "id": "R5-write-device-trust",
  "effect": "deny",
  "action": "write",
  "condition": { "subject.device_trust_score": { "lt": 70 } }
}
```

**Rule 6 — Declassify is admin-only, full stop.** No clearance/department logic — a hard
role gate.
```json
{
  "id": "R6-declassify-admin-only",
  "effect": "deny",
  "action": "declassify",
  "condition": { "subject.role": { "neq": "admin" } }
}
```

**Rule 7 — Auditors get read-only visibility everywhere, at low clearance.** Demonstrates
that "allow" rules can intentionally have *lower* requirements than the general case for a
specific role — auditors trade off broad access for being restricted to `read` only (action
scoping already enforces this; the rule doesn't need to repeat it).
```json
{
  "id": "R7-auditor-broad-read",
  "effect": "allow",
  "action": "read",
  "subject": { "role": "auditor" }
}
```

**Rule 8 — Personnel records need same-department + manager role, no exceptions.**
Demonstrates combining a resource-type filter with subject constraints.
```json
{
  "id": "R8-personnel-record-restriction",
  "effect": "deny",
  "action": "read",
  "resource": { "type": "personnel_record" },
  "condition": {
    "or": [
      { "subject.role": { "neq": "manager" } },
      { "resource.owner_department": { "neq": "subject.department" } }
    ]
  }
}
```

**Rule 9 — Public network is never sufficient for write/declassify.**
```json
{
  "id": "R9-public-network-write-block",
  "effect": "deny",
  "action": { "in": ["write", "declassify"] },
  "condition": { "context.network": "public" }
}
```

## 5. Decision combination logic (important design decision)

With multiple rules potentially matching the same request, we need a combining algorithm.
ZeTA uses **deny-overrides**: if *any* matching `deny` rule fires, the final decision is
deny — regardless of how many `allow` rules also matched. This is the standard conservative
choice in ABAC/XACML systems (the alternative, permit-overrides, is rarely appropriate for
security-sensitive access control) and it's why rules above are written as a mix of
`allow`-if-condition-met and `deny`-if-condition-violated: the deny rules act as hard
guardrails that no `allow` rule can bypass.

**This is a specific, testable design decision** — Week 6's policy evaluation engine will
have unit tests asserting deny-overrides behavior explicitly (e.g., Rule 3 alone would allow
a manager to read a top-secret document outside working hours, but Rule 4's deny must still
win).

## 6. Open questions carried into Week 2

- Should the full policy set live entirely on-chain (as contract storage), or should the
  chain store only a hash/pointer to an off-chain policy document, with governance voting on
  *changes* to that hash? (Leaning toward the latter for gas-cost reasons — worth revisiting
  once we're writing `AttributeRegistry.sol`.)
- Attribute *values* (like `subject.clearance`) clearly belong on-chain per the project's
  core thesis. Whether the *rule set itself* needs the same on-chain governance treatment, or
  can be simpler, is a genuine design question, not yet settled.
