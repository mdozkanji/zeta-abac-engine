import { ethers } from "hardhat";

/**
 * Generates fresh throwaway wallets to act as the 3 Sepolia governors (k=2 of 3).
 *
 * These are NOT your deployer wallet — the deployer just pays gas to deploy the contracts;
 * governors are the accounts that later propose/approve changes. Keeping them separate
 * mirrors the real design (no single account should hold both "can deploy" and "can govern"
 * authority) and is good practice generally: deployment keys and operational keys serving
 * different roles.
 */
async function main() {
  const count = 3;
  console.log(`Generating ${count} fresh wallets to act as Sepolia governors (k=2 of 3).\n`);
  console.log(
    "IMPORTANT: copy the private keys somewhere safe now (a password manager, not just this\n" +
      "terminal scrollback) — they'll be gone once this terminal session closes. These control\n" +
      "only testnet funds/governance, but treat the habit seriously regardless.\n"
  );

  const addresses: string[] = [];

  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    addresses.push(wallet.address);
    console.log(`Governor ${i + 1}`);
    console.log(`  Address:     ${wallet.address}`);
    console.log(`  Private key: ${wallet.privateKey}`);
    console.log("");
  }

  console.log("Next steps:");
  console.log("1. Fund AT LEAST 2 of these 3 addresses with Sepolia ETH via a faucet, e.g.:");
  console.log("   https://sepoliafaucet.com  or  https://www.alchemy.com/faucets/ethereum-sepolia");
  console.log("   (only 2 need funds to vote, since threshold k=2 — but funding all 3 avoids");
  console.log("   being stuck if you want to test with a different pair later.)");
  console.log("2. Add the three addresses (comma-separated, no spaces) to .env as:");
  console.log(`   GOVERNOR_ADDRESSES=${addresses.join(",")}`);
  console.log("3. Run: npx hardhat run scripts/deploy.ts --network sepolia");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
