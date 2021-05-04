import { ethers } from "hardhat";
import { encodeActCall, encodeCallScript } from '../test/helpers/aragon-os'
import { MigrationTools, IHatch, ERC20, ITollgate, DandelionVoting } from "../typechain";

const addresses = {
  hatchAddress: '0xfe1bd38cea1b9ed2fc8464d87d200d99e8f1b30f',
  tollgateAddress: '0x791415189736aece97f9f4d91ae2e1d2dc303105',
  dandelionVotingAddress: '0x720809317f8c2d491d948d12cecc9eb3cf429ec6',
  migrationToolsAddress: '0xe1c1fb78712f241e1163ae4d5cfddcce44599582',

  newMigrationToolsAddress: '0x1cce1728fb248327c90ee0862b0ce1a48d736cfe',
  newVault1Address: '0xa3ba0ea7feda7d5b833a72d40fe7b9f8e4716ace',
  newVault2Address: '0x3f64a53eeb92803258d6638f0f10075a918157b7'
}

async function main() {
  const ERC20Path = "@aragon/os/contracts/lib/token/ERC20.sol:ERC20";
  const hatch = await ethers.getContractAt("IHatch", addresses.hatchAddress) as IHatch
  const contributionToken = await ethers.getContractAt(ERC20Path, await hatch.contributionToken()) as ERC20
  const tollgate = await ethers.getContractAt("ITollgate", addresses.tollgateAddress) as ITollgate
  const dandelionVoting = await ethers.getContractAt("DandelionVoting", addresses.dandelionVotingAddress) as DandelionVoting
  const migrationTools = await ethers.getContractAt("MigrationTools", addresses.migrationToolsAddress) as MigrationTools

  const migrateSignature = 'migrate(address,address,address,address,uint256,uint64,uint64,uint64)'
  const calldata = encodeActCall(migrateSignature, [addresses.newMigrationToolsAddress, addresses.newVault1Address, addresses.newVault2Address, contributionToken.address, String(0.1 * 10 ** 18), 0, 0, 365 * 24 * 60 * 60])
  const script = encodeCallScript([{
    to: migrationTools.address,
    calldata,
  }])
  const voteScript = encodeCallScript([{
    to: dandelionVoting.address,
    calldata: encodeActCall('newVote(bytes,string,bool)', [script, '', false]),
  }])
  const [, tollgateFee] = await tollgate.forwardFee()
  const balance = await contributionToken.balanceOf(await ethers.getSigners()[0])
  if (balance.gte(tollgateFee)) {
    await contributionToken.approve(tollgate.address, tollgateFee)
    await tollgate.forward(voteScript)
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
