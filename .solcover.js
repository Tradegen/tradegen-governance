const process = require("process");

module.exports = {
  skipFiles: ["interfaces/", "openzeppelin-solidity/", "uniswap-governance/"],
  providerOptions: {
    default_balance_ether: "10000000000000000000000000",
  },
};
