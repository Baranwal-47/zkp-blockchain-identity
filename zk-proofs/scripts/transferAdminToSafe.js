const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const registry = (await hre.ethers.getContractFactory("CredentialRegistry"))
    .attach(process.env.REGISTRY_ADDRESS)
    .connect(deployer);

  console.log("admin before:", await registry.admin());
  const tx = await registry.transferAdmin(process.env.SAFE_ADDRESS);
  const receipt = await tx.wait();
  console.log("transferAdmin tx:", receipt.hash, "status:", receipt.status);
  console.log("admin (unchanged until acceptAdmin):", await registry.admin());
  console.log("pendingAdmin:", await registry.pendingAdmin());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
