import { ethers } from "hardhat"
import { claimTokens } from '../test/helpers/helpers'
import { MiniMeToken, IImpactHours } from "../typechain";

const ihTokenAddress = '0xdf2c3c8764a92eb43d2eea0a4c2d77c2306b0835'
const impactHoursAddress = '0xb403b4a3b990908bff599b824e47551ac5405c30'

async function main(): Promise<void> {
  const impactHoursToken = (await ethers.getContractAt("MiniMeToken", ihTokenAddress)) as MiniMeToken;
  const impactHours = await ethers.getContractAt("IImpactHours", impactHoursAddress) as IImpactHours
  await claimTokens(impactHours, impactHoursToken, { gasPrice: 20000000000, gasLimit: 9500000 })
  await impactHours.closeHatch({ gasPrice: 20000000000, gasLimit: 9500000 })
  console.log('Closed.')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
