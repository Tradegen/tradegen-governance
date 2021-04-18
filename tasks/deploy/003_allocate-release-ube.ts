import { DeployerFn, doTx } from "@ubeswap/hardhat-celo";
import { getAddress, parseEther } from "ethers/lib/utils";
import { DeployersMap } from ".";
import { ReleaseUbe__factory } from "../../build/types/";
import initialHolders from "../../genesis-ube.json";

const addresses = initialHolders.map((a) => getAddress(a[0]!));
const amounts = initialHolders.map((a) =>
  parseEther(a[1]?.split(",").join("")!)
);

export const allocateReleaseUbe: DeployerFn<{}> = async ({
  deployer,
  getAddresses,
}) => {
  if ((initialHolders as readonly unknown[]).length === 0) {
    throw new Error("No initial holders of ReleaseUbe specified.");
  }
  const { TimelockExecutive, ReleaseUbe } = getAddresses<
    DeployersMap,
    "token" | "timelocks"
  >("token", "timelocks");
  const releaseUbe = ReleaseUbe__factory.connect(ReleaseUbe, deployer);

  await doTx("Allocate ReleaseUbe", releaseUbe.allocate(addresses, amounts));

  await doTx(
    "Change owner of ReleaseUbe to the Executive timelock",
    releaseUbe.transferOwnership(TimelockExecutive)
  );
  return {};
};
