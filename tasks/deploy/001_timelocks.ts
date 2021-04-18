import { DeployerFn } from "@ubeswap/hardhat-celo";
import { Timelock__factory } from "../../build/types/";
import { OPERATOR, TWO_DAYS_SECONDS } from "./config";

export const deployTimelocks: DeployerFn<{
  TimelockCeloReserve: string;
  TimelockCommunity: string;
  TimelockExecutive: string;
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

  // Receives a share of mined tokens. Used to fund community projects.
  const timelockCommunity = await deployTimelock("Community");

  // Controls most functions of Ubeswap; owner of most important contracts
  const timelockExecutive = await deployTimelock("Executive");

  // Receives a share of mined tokens. Will be given to the Celo Reserve.
  const timelockCeloReserve = await deployTimelock("CeloReserve");

  return {
    TimelockCeloReserve: timelockCeloReserve,
    TimelockCommunity: timelockCommunity,
    TimelockExecutive: timelockExecutive,
  };
};
