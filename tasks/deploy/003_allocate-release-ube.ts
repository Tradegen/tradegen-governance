import { DeployerFn, doTx } from "@ubeswap/hardhat-celo";
import { getAddress, parseEther } from "ethers/lib/utils";
import { DeployersMap } from ".";
import { ReleaseUbe__factory } from "../../build/types/";
import { OPERATOR } from "./config";

const initialHolders = [[OPERATOR, "10000000"]] as const;

const addresses = initialHolders.map((a) => getAddress(a[0]));
const amounts = initialHolders.map((a) => parseEther(a[1]));

export const allocateReleaseUBE: DeployerFn<{}> = async ({
  deployer,
  getAddresses,
}) => {
  if ((initialHolders as readonly unknown[]).length === 0) {
    throw new Error("No initial holders of ReleaseUBE specified.");
  }
  const { TimelockExecutiveCouncil, ReleaseUBE } = getAddresses<
    DeployersMap,
    "token" | "timelocks"
  >("token", "timelocks");
  const releaseUbe = ReleaseUbe__factory.connect(ReleaseUBE, deployer);

  await doTx("Allocate ReleaseUBE", releaseUbe.allocate(addresses, amounts));

  await doTx(
    "Change owner of ReleaseUBE to the ExecutiveCouncil timelock",
    releaseUbe.transferOwnership(TimelockExecutiveCouncil)
  );
  return {};
};
