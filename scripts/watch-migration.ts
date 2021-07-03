import { ethers } from "hardhat";
import { MigrationTools } from "../typechain";

const migrationToolsAddr = "0x03C92caD4F008390de05b7db3130528592FBc733"

async function main(): Promise<void> {
  const migrationTools = await ethers.getContractAt("MigrationTools", migrationToolsAddr) as MigrationTools
  const list = await migrationTools.queryFilter(migrationTools.filters.ClaimTokens(null, null, null), 0)
  list.map(e => console.log(e.args.holder, ethers.utils.formatEther(e.args.amount)))
  console.log('TOTAL', ethers.utils.formatEther(list.map(e => e.args.amount).reduce((accumulator, currentValue) => accumulator.add(currentValue))))
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });