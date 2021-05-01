import { ethers } from "hardhat"
import { claimTokens } from '../test/helpers/helpers'
import { MiniMeToken, MigrationTools } from "../typechain";

const migrationToolsAddress = '0x1cce1728fb248327c90ee0862b0ce1a48d736cfe'

async function main(): Promise<void> {
  const migrationTools = await ethers.getContractAt("MigrationTools", migrationToolsAddress) as MigrationTools
  const hatchToken = (await ethers.getContractAt("MiniMeToken", await migrationTools.snapshotToken())) as MiniMeToken;
  console.log(`Token snapshot at block ${(await migrationTools.snapshotBlock()).toNumber()}.`)
  await claimTokens(migrationTools, hatchToken, { gasPrice: 20000000000, gasLimit: 9500000 })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
