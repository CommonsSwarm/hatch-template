import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { Config } from "../helpers/configuration";

const { AragonID, DAOFactory, ENS, MiniMeFactory } = Config.Bases["xdai"];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, execute, read, log } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("HatchTemplate", {
    from: deployer,
    args: [DAOFactory, ENS, MiniMeFactory, AragonID],
    log: true,
    deterministicDeployment: true,
  });

  // await deploy("GardensTemplate", {
  //   from: deployer,
  //   args: [DAOFactory, ENS, MiniMeFactory, AragonID],
  //   log: true,
  //   deterministicDeployment: true,
  // });
};
export default func;
