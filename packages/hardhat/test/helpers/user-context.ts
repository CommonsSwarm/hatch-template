import { HatchAddresses } from "../../scripts/new-hatch"
import { ethers } from "hardhat";
import { Signer } from "@ethersproject/abstract-signer";
import { ERC20, IHatch, IImpactHours, Redemptions, MiniMeToken, ITollgate, DandelionVoting, MigrationTools } from "../../typechain/index";

export interface UserContext {
  hatch: IHatch,
  contributionToken: ERC20,
  signer: Signer,
  hatchToken: MiniMeToken,
  redemptions: Redemptions,
  impactHours: IImpactHours,
  impactHoursToken: MiniMeToken,
  impactHoursClonedToken: MiniMeToken,
  tollgate: ITollgate,
  dandelionVoting: DandelionVoting,
  migrationTools: MigrationTools,
}

export const userContext = async (addresses: HatchAddresses, signer: Signer): Promise<UserContext> => {
  const ERC20Path = "@aragon/os/contracts/lib/token/ERC20.sol:ERC20";
  const hatch = await ethers.getContractAt("IHatch", addresses.hatchAddress, signer) as IHatch
  const contributionToken = await ethers.getContractAt(ERC20Path, await hatch.contributionToken(), signer) as ERC20
  const hatchToken = await ethers.getContractAt('MiniMeToken', await hatch.token(), signer) as MiniMeToken
  const redemptions = await ethers.getContractAt("Redemptions", addresses.redemptionsAddress, signer) as Redemptions
  const impactHours = await ethers.getContractAt("IImpactHours", addresses.impactHoursAddress, signer) as IImpactHours
  const impactHoursClonedToken = await ethers.getContractAt("MiniMeToken", await impactHours.token(), signer) as MiniMeToken
  const impactHoursToken = await ethers.getContractAt("MiniMeToken", await impactHoursClonedToken.parentToken(), signer) as MiniMeToken
  const tollgate = await ethers.getContractAt("ITollgate", addresses.tollgateAddress, signer) as ITollgate
  const dandelionVoting = await ethers.getContractAt("DandelionVoting", addresses.dandelionVotingAddress, signer) as DandelionVoting
  const migrationTools = await ethers.getContractAt("MigrationTools", addresses.migrationToolsAddress, signer) as MigrationTools

  return {
    hatch,
    contributionToken,
    signer,
    hatchToken,
    redemptions,
    impactHours,
    impactHoursToken,
    impactHoursClonedToken,
    tollgate,
    dandelionVoting,
    migrationTools,
  }
}
