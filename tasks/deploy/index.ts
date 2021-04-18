import { makeDeployTask, ResultsMap } from "@ubeswap/hardhat-celo";
import { deployTimelocks } from "./001_timelocks";
import { deployToken } from "./002_token";
import { allocateReleaseUbe } from "./003_allocate-release-ube";
import * as path from "path";

const deployers = {
  timelocks: deployTimelocks,
  token: deployToken,
  "allocate-release-ube": allocateReleaseUbe,
};

export type DeployersMap = ResultsMap<typeof deployers>;

export const { deploy } = makeDeployTask({
  deployers,
  rootDir: path.resolve(__dirname + "/../.."),
});
