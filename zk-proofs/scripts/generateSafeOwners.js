// Generates 3 brand-new throwaway keypairs for the Sepolia Safe 2-of-3 owners
// (AcadAdmin, Asst. Registrar, Dean) — D-02. These are NOT the operator's
// personal MetaMask accounts and NOT the deployer EOA (D-03: the deployer
// stays a separate signer that only deploys the Safe + calls transferAdmin,
// then is never an owner and never signs issue/revoke again).
//
// Usage: node scripts/generateSafeOwners.js
//
// Output is printed to stdout only — addresses are copy-pasteable into the
// backend .env (SAFE_OWNER_ACADADMIN/REGISTRAR/DEAN) and frontend .env
// (VITE_SAFE_OWNER_ACADADMIN/REGISTRAR/DEAN); private keys are for one-time
// import into MetaMask (MetaMask -> Import Account), once per owner.
//
// SECURITY WARNING: these are throwaway Sepolia-testnet-only keys.
//   - Do NOT commit the printed private keys anywhere (not to .env, not to
//     .env.example, not to any file in this repo).
//   - Do NOT reuse them for anything beyond this Sepolia governance demo.
//   - This script writes NOTHING to disk — keys exist only in this terminal's
//     stdout and in whatever MetaMask profile you import them into.

const { ethers } = require("ethers");

function main() {
  const roles = [
    { label: "AcadAdmin", envKey: "SAFE_OWNER_ACADADMIN" },
    { label: "Asst. Registrar", envKey: "SAFE_OWNER_REGISTRAR" },
    { label: "Dean", envKey: "SAFE_OWNER_DEAN" },
  ];

  console.log("=".repeat(72));
  console.log("PrivdID — Sepolia Safe 2-of-3 throwaway owner keypairs (D-02)");
  console.log("=".repeat(72));
  console.log(
    "\n⚠️  WARNING: these are FRESH, THROWAWAY Sepolia-testnet-only keys."
  );
  console.log(
    "   They are NOT your personal MetaMask accounts and NOT the deployer EOA."
  );
  console.log(
    "   NEVER commit the private keys below to git, .env, or any file."
  );
  console.log(
    "   They are printed here ONCE for manual MetaMask import only.\n"
  );

  const wallets = roles.map((role) => {
    const wallet = ethers.Wallet.createRandom();
    return { ...role, wallet };
  });

  wallets.forEach(({ label, wallet }) => {
    console.log("-".repeat(72));
    console.log(`Role:        ${label}`);
    console.log(`Address:     ${wallet.address}`);
    console.log(`Private key: ${wallet.privateKey}`);
  });

  console.log("\n" + "=".repeat(72));
  console.log("Copy-paste into privdId_admin/backend/.env:");
  console.log("=".repeat(72));
  wallets.forEach(({ envKey, wallet }) => {
    console.log(`${envKey}=${wallet.address}`);
  });

  console.log("\n" + "=".repeat(72));
  console.log("Copy-paste into privdId_admin/frontend/.env:");
  console.log("=".repeat(72));
  wallets.forEach(({ envKey, wallet }) => {
    console.log(`VITE_${envKey}=${wallet.address}`);
  });

  console.log("\n" + "=".repeat(72));
  console.log("Next steps:");
  console.log("=".repeat(72));
  console.log("1. Import each private key above into MetaMask as a separate");
  console.log("   account (MetaMask -> Import Account), one per role.");
  console.log("2. Fund each owner address + the DEPLOYER EOA with Sepolia");
  console.log("   test ETH from a faucet.");
  console.log("3. Confirm the deployer EOA is NOT one of these 3 addresses (D-03).");
  console.log(
    "4. Run zk-proofs/scripts/deploySafe.js --network sepolia with these"
  );
  console.log("   3 addresses as owners, threshold 2.\n");
}

main();
