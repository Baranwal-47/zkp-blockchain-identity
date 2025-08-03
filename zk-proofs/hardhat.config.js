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
    hardhat: {
      // Bind to all interfaces so mobile devices can connect
      host: "0.0.0.0",
      port: 8545
    },
    localhost: {
      url: "http://0.0.0.0:8545" // Bind to all interfaces for mobile access
    }
    // ...add other networks as needed
  }
};
