import { DeployerFn } from "@ubeswap/hardhat-celo";
import { Timelock__factory } from "../../build/types/";
import { OPERATOR, TWO_DAYS_SECONDS } from "./config";

export const deployTimelocks: DeployerFn<{
  TimelockCeloReserve: string;
  TimelockCommunityGrowthFund: string;
  TimelockExecutiveCouncil: string;
  TimelockTreasury: string;
}> = async ({ deployer, deployCreate2 }) => {
  /**
   * Deploys a Timelock contract.
   *
   * @param name The name of the timelock
   * @param deployer The Signer of the deployer of the contract.
   * @param owner The address that controls the timelock.
   * @returns Address of the deployed Timelock.
   */
  const deployTimelock = async (name: string): Promise<string> => {
    const timelock = await deployCreate2(`Timelock${name}`, {
      factory: Timelock__factory,
      signer: deployer,
      args: [OPERATOR, TWO_DAYS_SECONDS],
    });
    return timelock.address;
  };

  // Deploy timelocks
  const timelockTreasury = await deployTimelock("Treasury");
  const timelockCommunityGrowthFund = await deployTimelock(
    "CommunityGrowthFund"
  );
  const timelockExecutiveCouncil = await deployTimelock("ExecutiveCouncil");
  // This timelock will be given to the Celo Reserve.
  const timelockCeloReserve = await deployTimelock("CeloReserve");

  return {
    TimelockCeloReserve: timelockCeloReserve,
    TimelockCommunityGrowthFund: timelockCommunityGrowthFund,
    TimelockExecutiveCouncil: timelockExecutiveCouncil,
    TimelockTreasury: timelockTreasury,
  };
};
