# ZeTA PDP — Policy Decision Point

The off-chain service that evaluates access requests against on-chain attributes (and, from
Week 6, the policy rules defined in `../../docs/abac-model.md`). See `../../docs/architecture.md`
for how this fits into the overall system.

## Week 5 scope

This week builds the skeleton: chain-to-cache sync and a working HTTP API, with `/decide`
returning a clearly-labeled stub decision. Real ABAC policy evaluation arrives in Week 6.

## Architecture

```
AttributeRegistry (on-chain) --events--> AttributeSync --> AttributeCache (Redis) <-- app.ts (Express)
```

- `src/types.ts` — TypeScript mirrors of the on-chain enums/structs
- `src/chain/decodeAttributes.ts` — pure functions converting raw event args to typed objects
- `src/cache/attributeCache.ts` — Redis-backed cache, address-normalized, JSON-serialized
- `src/chain/attributeSync.ts` — backfills from historical events, then subscribes to new ones
- `src/routes/app.ts` — Express app factory (health check, cache-read debug endpoints, `/decide` stub)
- `src/config.ts` — validated environment loading
- `src/index.ts` — real entrypoint wiring everything to a live RPC + Redis connection

## A real bug this design had to handle: RPC block-range limits

The first live run against Sepolia's public RPC failed with `exceed maximum block range:
50000` — most RPC providers cap how many blocks a single `eth_getLogs` query can span, and
the initial unchunked "block 0 to latest" backfill request exceeded it. `AttributeSync.
syncFromChain` now chunks the backfill into ranges of at most `SYNC_CHUNK_SIZE` blocks
(default 40000, configurable per-provider via `.env`). Set `SYNC_FROM_BLOCK` to the actual
contract deployment block (visible on Etherscan) to additionally avoid scanning chain history
before the contract existed — not required for correctness after the chunking fix, but a real
efficiency win.

Everything except `index.ts` is designed to be unit-testable without a live chain connection
or Redis server — dependencies are passed in via constructors/factory functions rather than
constructed internally, so tests can inject `ioredis-mock` and hand-rolled fake contract
objects instead.

## Setup

```bash
npm install
cp .env.example .env
# fill in .env — RPC_URL and ATTRIBUTE_REGISTRY_ADDRESS at minimum
```

Start Redis locally (from the repo root):
```bash
docker compose up -d redis
```

Run the service:
```bash
npm run dev
```

## Testing

```bash
npm test
```

30 tests across 6 suites, no live infrastructure required — Redis is mocked via
`ioredis-mock`, and chain interaction is tested via a minimal hand-rolled fake implementing
only the surface `AttributeSync` actually touches (`filters`, `queryFilter`, `on`), including
dedicated regression tests for the chunked-backfill fix described below.

## Endpoints (Week 5)

- `GET /health` — liveness check
- `GET /attributes/subject/:address` — read a subject's cached attributes (debug/demo)
- `GET /attributes/resource/:id` — read a resource's cached attributes (debug/demo)
- `POST /decide` — **stub only this week** — always returns `{ decision: "allow", reason:
  "STUB: ..." }`, echoing the request body. Real policy evaluation arrives in Week 6.

## Keeping the ABI in sync

This service imports its contract ABI from `../../abis/AttributeRegistry.json` (shared across
the whole monorepo — see `../../scripts/export-abis.ts`). After any change to
`contracts/AttributeRegistry.sol`, run from the repo root:

```bash
npx hardhat compile
npx hardhat run scripts/export-abis.ts
```

to regenerate the ABI files from the real compiler output before relying on them here.
