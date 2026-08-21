# ZeTA — Zero-Trust ABAC Engine

A blockchain-governed Attribute-Based Access Control (ABAC) policy engine for zero-trust
architectures. ZeTA is a Policy Decision Point (PDP) that evaluates access requests against
policies while attribute governance is anchored on-chain and requires k-of-n multi-party
consensus to change — removing the single-admin trust bottleneck present in conventional
IAM/ABAC systems.

> **Status:** early development (Week 0). This project is a hands-on implementation of the
> architecture proposed in the author's master's thesis, *A Zero-Trust Architecture Built on
> a Blockchain-Based ABAC Model*.

## Why this exists

Conventional ABAC systems trust a small number of administrators to manage the attribute
store and policy set with no independent check — a real insider-threat and audit-integrity
gap. ZeTA anchors attribute governance in a smart contract requiring k-of-n consensus for any
mutation, and produces a tamper-evident audit trail for every access decision.

**This is not "blockchain because blockchain."** For a single trusted organization, a
well-run database with strong RBAC and signed logs is usually sufficient. ZeTA specifically
targets settings where **no single party should have unilateral control** — multi-party
consortia, federated systems, and contexts where provable (not just claimed) tamper-evidence
is required. See [`docs/architecture.md`](docs/architecture.md) for the full design rationale.

## Architecture (high level)

```
Client App → PEP (middleware) → PDP (this service) → Smart Contracts (attribute registry,
                                                        governance voting, audit anchor)
```

Full details: [`docs/architecture.md`](docs/architecture.md)
Threat model: [`docs/threat-model.md`](docs/threat-model.md)
ABAC model & policy format: [`docs/abac-model.md`](docs/abac-model.md)
Security review (Slither + gas reporting): [`docs/security-review.md`](docs/security-review.md)
Sepolia deployment guide: [`DEPLOYMENT.md`](DEPLOYMENT.md)

## Live deployment (Sepolia testnet)

| Contract | Address | Etherscan |
|---|---|---|
| `GovernanceVoting` | `0xf6cc22ce616CFeEc90BBbEcD0C78B3025ee98ABa` | [verify pending](https://sepolia.etherscan.io/address/0xf6cc22ce616CFeEc90BBbEcD0C78B3025ee98ABa) |
| `AttributeRegistry` | `0x4004A83f8963B5943D08FE7FC4C3E550973C6362` | [verified ✅](https://sepolia.etherscan.io/address/0x4004A83f8963B5943D08FE7FC4C3E550973C6362#code) |
| `PolicyRegistry` | `0x019BFB227c1c22A1ed44E5e7c597E46BfdFf0965` | [verified ✅](https://sepolia.etherscan.io/address/0x019BFB227c1c22A1ed44E5e7c597E46BfdFf0965#code) |

Governor set: 3 addresses, threshold k=2 (see `deployments/sepolia.json` for full details).

## Tech stack

- **Smart contracts:** Solidity 0.8.24, Hardhat 2.x (deliberately pinned — see dev notes)
- **Testnet:** Ethereum Sepolia
- **PDP service:** Node.js + TypeScript *(from Week 5)*
- **Cache:** Redis *(from Week 5)*

## Project status / roadmap

This project is being built in public, week by week. See [`docs/devlog.md`](docs/devlog.md)
for a running log of what was built, what was learned, and what's next.

| Week | Milestone |
|---|---|
| 0 | Repo scaffold, environment setup, architecture & threat model docs |
| 1 | Formal ABAC model & policy rule design |
| 2 | ✅ Attribute registry smart contract + unit tests |
| 3 | ✅ k-of-n governance voting contract |
| 4 | ✅ Security hardening + Sepolia testnet deployment |
| 5 | PDP service skeleton + on-chain attribute sync |
| 6 | Policy evaluation engine + tamper-evident audit log |
| 7 | PEP middleware + end-to-end demo app |
| 8 | Testing, benchmarks, documentation, v1.0 |

## Getting started (dev setup)

```bash
git clone [<repo-url>](https://github.com/mdozkanji/zeta-abac-engine)
cd zeta-abac-engine
npm install
npx hardhat compile
```

> **Note:** if you're on Hardhat, deliberately install `hardhat@^2.x` rather than latest —
> Hardhat 3 is ESM-only with a different config format and the wider tutorial ecosystem is
> still built around v2. See [`docs/devlog.md`](docs/devlog.md) Week 0 entry for the full
> story on why this matters.

## License

MIT — see [`LICENSE`](LICENSE)
