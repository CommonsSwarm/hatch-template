import { ethers } from "hardhat"
import { claimTokens } from '../test/helpers/helpers'
import { MiniMeToken, MigrationTools } from "../typechain";

const migrationToolsAddress = 'TBD'

async function main(): Promise<void> {
  const migrationTools = await ethers.getContractAt("MigrationTools", migrationToolsAddress) as MigrationTools
  const hatchToken = (await ethers.getContractAt("MiniMeToken", await migrationTools.snapshotToken())) as MiniMeToken;
  console.log(`Token snapshot at block ${(await migrationTools.snapshotBlock()).toNumber()}.`)
  await claimTokens(migrationTools.claimForMany, hatchToken, { gasPrice: 20000000000, gasLimit: 9500000 })
  console.log("All tokens claimed.")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
