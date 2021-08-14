import { ethers } from "hardhat";
import { claimTokens } from "../test/helpers/helpers";
import { MiniMeToken, IImpactHours } from "../typechain";

const impactHoursAddress = '0x9dfaad87c722116ccD50dE582651E474d503daA8'

async function main(): Promise<void> {
  const impactHours = (await ethers.getContractAt("IImpactHours", impactHoursAddress)) as IImpactHours;
  const clonedImpactHourToken = (await ethers.getContractAt("MiniMeToken", await impactHours.token())) as MiniMeToken;
  const impactHoursToken = (await ethers.getContractAt(
    "MiniMeToken",
    await clonedImpactHourToken.parentToken()
  )) as MiniMeToken;
  try {
    await claimTokens(impactHours.claimReward, impactHoursToken, { gasPrice: 25000000000, gasLimit: 9500000 });
    await impactHours.closeHatch({ gasPrice: 200000000000, gasLimit: 950000 });
    console.log("Closed.");
  } catch (e) {
    console.error(e);
    console.error("Couldn't close.");
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
