// Deploys a 3-owner / threshold-2 Gnosis Safe via @safe-global/protocol-kit (v7 API:
// Safe.init({ predictedSafe }) + createSafeDeploymentTransaction() — NOT the deprecated
// EthersAdapter/Safe.create() v1/v2 API) and hands CredentialRegistry admin to it.
//
// NOTE: this script depends on @safe-global/protocol-kit being installed in
// zk-proofs/node_modules. That install happens in plan 09-02. If you run this script
// before that install completes, the dynamic import below will fail — this is expected
// and documented here, not a bug in this script.
//
// Local Hardhat path only: uses 3 of Hardhat's deterministic test-account signers as the
// Safe's 3 owners and the first signer as the deployer EOA (per RESEARCH.md Open Question #3
// — genuinely-fresh throwaway keypairs for D-02 are a Sepolia concern, handled in plan 09-05).
// This script intentionally makes NO @safe-global/api-kit calls: Safe Transaction Service has
// no public indexer for local Hardhat's chainId 31337 (RESEARCH.md Pitfall 1) — the deployment
// transaction is built via protocol-kit's predictedSafe flow and sent directly through the
// deployer's provider/signer.

const hre = require("hardhat");

async function main() {
  // @safe-global/protocol-kit v7 ships as an ESM-only package; this script is CJS
  // (matches deployRegistry.js's require("hardhat") shape), so load it via dynamic import.
  const { default: Safe } = await import("@safe-global/protocol-kit");

  const signers = await hre.ethers.getSigners();
  const [deployer, ownerA, ownerB, ownerC] = signers;

  console.log("Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const owners = [ownerA.address, ownerB.address, ownerC.address];
  const threshold = 2;
  console.log("Safe owners (local Hardhat deterministic accounts):", owners);
  console.log("Threshold:", threshold);

  const network = await hre.ethers.provider.getNetwork();
  const rpcUrl = hre.network.config.url || "http://127.0.0.1:8545";

  // Deployer's private key — local Hardhat only. Hardhat's default deterministic
  // accounts are well-known test keys, never used on a real network.
  const deployerPrivateKey = deployer.privateKey;

  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: deployerPrivateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners,
        threshold,
      },
    },
  });

  const predictedSafe = await protocolKit.getAddress();
  console.log("Predicted Safe address:", predictedSafe);

  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

  const deployerWallet = new hre.ethers.Wallet(deployerPrivateKey, hre.ethers.provider);
  const txResponse = await deployerWallet.sendTransaction({
    to: deploymentTransaction.to,
    value: deploymentTransaction.value,
    data: deploymentTransaction.data,
  });
  await txResponse.wait();

  const safeAddress = await protocolKit.getAddress();
  console.log("\n✅ Safe deployed!");
  console.log("   Safe address:", safeAddress);
  console.log("   Network chainId:", network.chainId.toString());

  // Hand registry admin to the Safe via the deployer EOA (per D-03: deployer ≠ owner,
  // and never signs issue/revoke again after this handoff).
  const registryAddress = process.env.REGISTRY_ADDRESS;
  if (!registryAddress) {
    console.log(
      "\n⚠️  REGISTRY_ADDRESS not set in env — skipping registry.transferAdmin(safeAddress)."
    );
    console.log("   Re-run with REGISTRY_ADDRESS=<address> to complete the handoff.");
  } else {
    const registry = (await hre.ethers.getContractFactory("CredentialRegistry"))
      .attach(registryAddress)
      .connect(deployer);

    const transferTx = await registry.transferAdmin(safeAddress);
    await transferTx.wait();
    console.log("\n✅ registry.transferAdmin(safeAddress) called!");
    console.log(
      "   The Safe must now call acceptAdmin() (as its own Safe transaction) to complete the handoff."
    );
  }

  console.log("\nSave this in your .env: SAFE_ADDRESS=" + safeAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
