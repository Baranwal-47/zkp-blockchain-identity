require("@nomicfoundation/hardhat-toolbox");
require("hardhat-circom");
require("@solarity/hardhat-zkit");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;
if (!SEPOLIA_RPC_URL || !PRIVATE_KEY) {
  console.warn(
    "SEPOLIA_RPC_URL or PRIVATE_KEY not set in the environment — the sepolia network will be unusable until both are configured"
  );
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  circom: {
    inputBasePath: "./circuits",
    ptau: "../build/powersOfTau28_hez_final_14.ptau",
    circuits: [
      { name: "identity" }
    ]
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : []
    }
  }
};
