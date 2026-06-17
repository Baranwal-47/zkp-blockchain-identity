require("@nomicfoundation/hardhat-toolbox");
require("hardhat-circom");
require("@solarity/hardhat-zkit");
require("dotenv").config();

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
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    }
  }
};
