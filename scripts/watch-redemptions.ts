import { ethers } from "hardhat";
import { Redemptions } from "../typechain";

const redemptionsAppAddress = "0xaa346f07f9485b294cc3ac46c0f82bfd3656c2de"

async function main(): Promise<void> {
  const redemptions = await ethers.getContractAt("Redemptions", redemptionsAppAddress) as Redemptions
  const list = await redemptions.queryFilter(redemptions.filters.Redeem(null, null), 0)
  list.map(e => console.log(e.args.redeemer, ethers.utils.formatEther(e.args.amount)))
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
