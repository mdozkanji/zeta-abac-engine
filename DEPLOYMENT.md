# Deployment Guide — Sepolia Testnet

This walks through deploying `GovernanceVoting`, `AttributeRegistry`, and `PolicyRegistry` to
Ethereum's Sepolia testnet, with a governor set of **3 addresses, threshold k=2** (a
deliberately lighter setup than the k=3-of-5 used in local tests — see `docs/devlog.md` Week 4
for the reasoning: real multi-party governance without needing to fund 5 separate wallets).

## 1. Get a Sepolia RPC endpoint

Sepolia needs an RPC provider to submit transactions to. Free options:
- [Alchemy](https://www.alchemy.com/) or [Infura](https://infura.io/) — sign up, create an
  app on Sepolia, copy the HTTPS RPC URL.
- Or a public RPC with no signup: `https://ethereum-sepolia-rpc.publicnode.com` (fine for
  learning purposes; a dedicated provider is better for anything beyond that, due to rate
  limits on public endpoints).

## 2. Set up your deployer wallet

This is the account that pays gas to deploy the contracts — separate from the governor
wallets (which vote on proposals *after* deployment).

You can use an existing MetaMask/testnet wallet, or generate a fresh one:
```bash
node -e "const {Wallet} = require('ethers'); const w = Wallet.createRandom(); console.log('Address:', w.address); console.log('Private key:', w.privateKey);"
```

Fund it with Sepolia ETH from a faucet (same links as below) — deployment itself needs gas
too.

## 3. Fill in `.env`

Copy the template and fill in real values:
```bash
cp .env.example .env
```

Set at minimum:
```
SEPOLIA_RPC_URL=<your RPC URL from step 1>
PRIVATE_KEY=<your deployer wallet's private key, 0x-prefixed>
```

**Never commit `.env`** — it's already in `.gitignore`, but it's worth re-confirming that
before your first `git add .` after this step, not after.

## 4. Generate the 3 governor wallets

```bash
npx hardhat run scripts/generate-governors.ts
```

This prints 3 fresh addresses + private keys. Save the private keys somewhere safe (a
password manager) — you'll need at least 2 of them later to actually approve a proposal.

## 5. Fund at least 2 of the 3 governor addresses

Via a faucet:
- https://sepoliafaucet.com
- https://www.alchemy.com/faucets/ethereum-sepolia

Each governor only needs a small amount of Sepolia ETH — enough for a handful of `approve()`
transactions, not much.

## 6. Add the governor addresses to `.env`

```
GOVERNOR_ADDRESSES=0xAddr1,0xAddr2,0xAddr3
```

(No spaces around the commas.)

## 7. Deploy

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

This deploys all three contracts in order (`GovernanceVoting` → `AttributeRegistry` →
`PolicyRegistry`, since the latter two need the former's address at construction time),
prints each address, and writes `deployments/sepolia.json` — safe to commit, since contract
addresses are public information anyway (visible on Etherscan regardless of whether we
record them ourselves).

## 8. Verify on Etherscan

The deploy script prints the exact `npx hardhat verify` commands to run, with real addresses
filled in. This publishes the contracts' source code on Etherscan so anyone (a reviewer, a
PhD committee, a curious stranger) can read and interact with them directly — worth doing for
a portfolio project, not just a "nice to have."

You'll need an `ETHERSCAN_API_KEY` in `.env` for this — get one free at
[etherscan.io/apis](https://etherscan.io/apis).

## What this deployment does *not* yet do

Deploying the contracts doesn't exercise the governance flow itself — no proposals have been
created or approved on Sepolia yet. That's intentionally deferred to Week 7's end-to-end demo,
once the PEP middleware and demo app exist to give the governance flow a real, visible outcome
to point at (rather than "trust me, I called `propose()` once").
