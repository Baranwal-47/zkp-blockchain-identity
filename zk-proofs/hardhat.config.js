require("@nomicfoundation/hardhat-toolbox");
require("hardhat-circom");
require("@solarity/hardhat-zkit");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  circom: {
    inputBasePath: "./circuits", // Folder where your .circom files are
    ptau: "../build/pot12_final.ptau", // Path to your ptau file, relative to inputBasePath
    circuits: [
      { name: "identity" } // This must match your identity.circom file (without extension)
    ]
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    }
    // ...add other networks as needed
  }
};
