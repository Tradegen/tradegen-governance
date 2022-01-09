require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-solhint");
require("@nomiclabs/hardhat-waffle");
require("@ubeswap/hardhat-celo");
const {
  additionalOutputSelection,
  fornoURLs,
  ICeloNetwork,
} = require("@ubeswap/hardhat-celo");
require("dotenv/config");
require("hardhat-abi-exporter");
require("hardhat-gas-reporter");
const { removeConsoleLog } = require("hardhat-preprocessor");
require("hardhat-spdx-license-identifier");

module.exports = {
  abiExporter: {
    path: "./build/abi",
    //clear: true,
    flat: true,
    // only: [],
    // except: []
  },
  defaultNetwork: "mainnet",
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    currency: "USD",
    excludeContracts: ["contracts/mocks/", "contracts/libraries/"],
  },
  networks: {
    mainnet: {
      url: fornoURLs[ICeloNetwork.MAINNET],
      accounts: [process.env.PRIVATE_KEY_DEPLOYER],
      chainId: ICeloNetwork.MAINNET,
      live: true,
      gasPrice: 2 * 10 ** 8,
      gas: 8000000,
    },
    alfajores: {
      url: fornoURLs[ICeloNetwork.ALFAJORES],
      accounts: [process.env.PRIVATE_KEY1, process.env.PRIVATE_KEY2],
      chainId: ICeloNetwork.ALFAJORES,
      live: true,
      gasPrice: 2 * 10 ** 8,
      gas: 8000000,
    },/*
    hardhat: {
      chainId: 31337,
      accounts,
    },*/
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./build/cache",
    artifacts: "./build/artifacts",
  },
  preprocess: {
    eachLine: removeConsoleLog(
      (bre) =>
        bre.network.name !== "hardhat" && bre.network.name !== "localhost"
    ),
  },
  solidity: {
    version: "0.8.3",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
      metadata: {
        useLiteralContent: true,
      },
      outputSelection: additionalOutputSelection,
    },
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  namedAccounts: {
    deployer: 0,
  },
  typechain: {
    target: "ethers-v5",
    outDir: "build/types",
  },
};
