const { ethers } = require("ethers");
const verifierAbi = require("../artifacts/contracts/IdentityVerifier.sol/Groth16Verifier.json").abi;

const verifierAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  try {
    // Connect to local Hardhat node
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    console.log("Connecting to blockchain...");
    await provider.getNetwork();
    console.log("✅ Connected to blockchain");

    // Get the first signer from provider (index 0)
    const signer = await provider.getSigner(0);

    console.log("Connecting to verifier contract at:", verifierAddress);

    // Connect contract with signer
    const verifierContract = new ethers.Contract(verifierAddress, verifierAbi, signer);

    console.log("Contract instance created");

    // Check if contract exists at the address
    const code = await provider.getCode(verifierAddress);
    if (code === "0x") {
      console.log("❌ No contract found at address:", verifierAddress);
      console.log("Please deploy the contract first using:");
      console.log("npx hardhat run scripts/deployVerifier.js --network localhost");
      return;
    }

    console.log("✅ Contract found at address, attempting verification...");

    // Proof parameters
    const pA = [
      "0x20675afba20ee55216f569840f69037569f034c80842f54c47d5691e35b0ac73",
      "0x1b283f824edac0426a91c212b34c5b59cbe31f288be7188cbefd29846fe51a69"
    ];

    const pB = [
      [
        "0x1832e41c45b82370ee834488a9a6214b08e8aea0227b77f3120604b85ac7e0d7",
        "0x282bd8cb3a2daa7d2b936d0b2f5bb519bad47590062695b49f5569375adb91d5"
      ],
      [
        "0x22456a7fcf2538d23dc4fb812011fda395b09b10b5598a60a45dd5b8d41f6101",
        "0x0c21d186798a7917f9895edd995355a8bccb7d43cba5a775caf9fd7b20a58e75"
      ]
    ];

    const pC = [
      "0x0e638ec8eaaa74b252dca5440155d50de24d8a6fb4b8719134114bf64bdcc50f",
      "0x27e3e71da09d3186a71ff17c8fbf6a4ab57ae9298297bca5e1e7ca30d0a44719"
    ];

    const pubSignals = [
      "0x27c807713b3e408f354772e855dd2d909497f0af0dcc191b6829c25f01f94e68"
    ];

    // Use the function directly
    const isValid = await verifierContract.verifyProof(pA, pB, pC, pubSignals);
    console.log("🎉 Proof is valid:", isValid);

  } catch (err) {
    console.error("❌ Error during proof verification:", err.message);
    if (err.message.includes("connection refused")) {
      console.log("💡 Make sure to start a local blockchain first:");
      console.log("npx hardhat node");
    }
  }
}

main();
