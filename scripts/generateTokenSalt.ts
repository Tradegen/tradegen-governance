import { getCreate2Address } from "@ubeswap/solidity-create2-deployer";
import UbeToken from "../build/artifacts/contracts/UbeToken.sol/UbeToken.json";

const SALT = process.env.SALT;

// This script finds the salt to deploy the UbeToken prefixed with 0x00be
for (let i = 0; ; i++) {
  if (i % 1000 === 0) {
    console.log(i);
  }
  const rand = `${Math.random()}`;
  const addr = getCreate2Address({
    salt: `${SALT}-UbeToken${rand}`,
    contractBytecode: UbeToken.bytecode,
    constructorTypes: ["address"],
    constructorArgs: ["0xe725C326B19828dBeDF5B8188Ba32E7D0CE68179"],
  });
  if (addr.startsWith("0x00be")) {
    console.log("UbeToken", addr, rand);
    break;
  }
}
