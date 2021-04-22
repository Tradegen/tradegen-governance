import { DeployerFn, doTx } from "@ubeswap/hardhat-celo";
import { getAddress, parseEther } from "ethers/lib/utils";
import { DeployersMap } from ".";
import { ReleaseUbe__factory } from "../../build/types/";
import { OPERATOR } from "./config";
import { GENESIS_UBE } from "./genesis-ube";

const addresses = GENESIS_UBE.map((a) => getAddress(a[0]!));
// const amounts = GENESIS_UBE.map((a) => parseEther(a[1]?.split(",").join("")!));
const amounts = GENESIS_UBE.map((a) => parseEther("0.1"));

export const allocateReleaseUbe: DeployerFn<{}> = async ({
  deployer,
  getAddresses,
}) => {
  if (GENESIS_UBE.length === 0) {
    throw new Error("No initial holders of ReleaseUbe specified.");
  }
  const { ReleaseUbe } = getAddresses<DeployersMap, "token">("token");
  const releaseUbe = ReleaseUbe__factory.connect(ReleaseUbe, deployer);

  console.log("Allocating to", JSON.stringify(addresses));

  await doTx(
    "Allocate ReleaseUbe",
    releaseUbe.allocate(addresses, amounts, { gasLimit: 8000000 })
  );

  await doTx(
    "Change owner of ReleaseUbe to the Operator",
    releaseUbe.transferOwnership(OPERATOR)
  );
  return {};
};
