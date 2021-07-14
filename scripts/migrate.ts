import { ethers } from "hardhat";
import { encodeActCall, encodeCallScript } from '../test/helpers/aragon-os'
import { MigrationTools, IHatch, ERC20, ITollgate, DandelionVoting } from "../typechain";

const addresses = {
  hatchAddress: 'TBD',
  tollgateAddress: 'TBD',
  dandelionVotingAddress: 'TBD',
  migrationToolsAddress: 'TBD',
  newMigrationToolsAddress: 'TBD',
}

async function main() {
  const ERC20Path = "@aragon/os/contracts/lib/token/ERC20.sol:ERC20";
  const hatch = await ethers.getContractAt("IHatch", addresses.hatchAddress) as IHatch
  const contributionToken = await ethers.getContractAt(ERC20Path, await hatch.contributionToken()) as ERC20
  const tollgate = await ethers.getContractAt("ITollgate", addresses.tollgateAddress) as ITollgate
  const dandelionVoting = await ethers.getContractAt("DandelionVoting", addresses.dandelionVotingAddress) as DandelionVoting
  const migrationTools = await ethers.getContractAt("MigrationTools", addresses.migrationToolsAddress) as MigrationTools
  const newMigrationTools = await ethers.getContractAt("MigrationTools", addresses.newMigrationToolsAddress) as MigrationTools
  const newVault1Address = await newMigrationTools.vault1()
  const newVault2Address = await newMigrationTools.vault2()

  const migrateSignature = 'migrate(address,address,address,address,uint256,uint64,uint64,uint64)'
  const calldata = encodeActCall(migrateSignature, [addresses.newMigrationToolsAddress, newVault1Address, newVault2Address, contributionToken.address, String(0.1 * 10 ** 18), Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, 0, (365 - 90) * 24 * 60 * 60])
  const script = encodeCallScript([{
    to: migrationTools.address,
    calldata,
  }])
  const voteScript = encodeCallScript([{
    to: dandelionVoting.address,
    calldata: encodeActCall('forward(bytes)', [script]),
  }])
  const [, tollgateFee] = await tollgate.forwardFee()
  const signer = (await ethers.getSigners())[0].address
  const balance = await contributionToken.balanceOf(signer)
  if (balance.gte(tollgateFee)) {
    const allowance = await contributionToken.allowance(signer, tollgate.address)
    if (allowance.gt(0) && allowance.lt(tollgateFee)) {
      await(await contributionToken.approve(tollgate.address, 0)).wait(2)
    }
    await(await contributionToken.approve(tollgate.address, tollgateFee)).wait(2)
    await tollgate.forward(voteScript, {gasPrice: 9500000000})
  } else {
    console.error("Not enough funds to pay for tollgate")
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
