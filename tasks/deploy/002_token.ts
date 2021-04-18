import { DeployerFn, doTx, log } from "@ubeswap/hardhat-celo";
import { formatEther } from "ethers/lib/utils";
import { DeployersMap } from ".";
import { ReleaseUbe__factory, UbeToken__factory } from "../../build/types/";
import {
  allocLiquidityTreasury,
  allocReleased,
  LOCKUP_BEGIN_TS,
  LOCKUP_END_TS,
  OPERATOR,
} from "./config";

interface IResult {
  ReleaseUbe: string;
  UbeToken: string;
}

export const deployToken: DeployerFn<IResult> = async ({
  deployer,
  deployCreate2,
  getAddresses,
}) => {
  const { TimelockExecutive } = getAddresses<DeployersMap, "timelocks">(
    "timelocks"
  );

  // Deploy token
  const saltExtra = process.env.UBE_SALT;
  if (!saltExtra) {
    console.warn("UBE_SALT env var not specified");
  }
  const ubeToken = await deployCreate2("UbeToken", {
    factory: UbeToken__factory,
    signer: deployer,
    args: [await deployer.getAddress()],
    saltExtra,
  });

  const deployerAddress = await deployer.getAddress();
  log("Deployer address: " + deployerAddress);

  const releaseUbe = await deployCreate2("ReleaseUbe", {
    factory: ReleaseUbe__factory,
    signer: deployer,
    args: [
      deployerAddress,
      ubeToken.address,

      allocReleased,
      LOCKUP_BEGIN_TS,
      0,
      LOCKUP_END_TS,
    ],
  });

  await doTx(
    "Transfer tokens to ReleaseUbe",
    ubeToken.contract.transfer(releaseUbe.address, allocReleased)
  );

  await doTx(
    `Send ${formatEther(allocLiquidityTreasury)} liquidity tokens to treasury`,
    ubeToken.contract.transfer(TimelockExecutive, allocLiquidityTreasury)
  );

  await doTx(
    "Transfer remaining tokens to operator",
    ubeToken.contract.transfer(
      OPERATOR,
      await ubeToken.contract.balanceOf(await deployer.getAddress())
    )
  );

  return {
    ReleaseUbe: releaseUbe.address,
    UbeToken: ubeToken.address,
  };
};
