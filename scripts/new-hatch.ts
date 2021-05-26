import hre, { ethers } from "hardhat";
import { Contract } from "@ethersproject/contracts";
import { Signer } from "@ethersproject/abstract-signer";
import { HatchTemplate, Kernel, MiniMeToken } from "../typechain";
import getParams from "../params";

const { deployments } = hre;

export interface HatchAddresses {
  daoAddress: string,
  dandelionVotingAddress: string,
  hatchAddress: string,
  impactHoursAddress: string,
  redemptionsAddress: string,
  tollgateAddress: string,
  migrationToolsAddress: string,
}

// Script arguments
const DAO_ID = "testtec" + Math.random(); // Note this must be unique for each deployment, change it for subsequent deployments
const NETWORK_ARG = "--network";
const DAO_ID_ARG = "--daoid";

const argValue = (arg, defaultValue) =>
  process.argv.includes(arg) ? process.argv[process.argv.indexOf(arg) + 1] : defaultValue;

const network = () => argValue(NETWORK_ARG, "local");
const daoId = () => argValue(DAO_ID_ARG, DAO_ID);

const blockTime = network() === "rinkeby" ? 15 : network() === "mainnet" ? 13 : 5; // 15 rinkeby, 13 mainnet, 5 xdai

console.log(`Every ${blockTime}s a new block is mined in ${network()}.`);

export default async function main(log = console.log): Promise<HatchAddresses> {

const {
  orgTokenName,
  orgTokenSymbol,
  supportRequired,
  minAcceptQuorum,
  voteDurationBlocks,
  voteBufferBlocks,
  voteExecutionDelayBlocks,
  collateralToken,
  ihToken,
  expectedRaise,
  ONE_TOKEN,
  hatchMinGoal,
  hatchMaxGoal,
  hatchPeriod,
  hatchExchangeRate,
  vestingCliffPeriod,
  vestingCompletePeriod,
  hatchTribute,
  openDate,
  maxIHRate,
  tollgateFee,
  scoreToken,
  hatchOracleRatio,
} = await getParams(blockTime);

const hatchTemplateAddress = async () => (await deployments.get("HatchTemplate")).address;

const getHatchTemplate = async (signer: Signer): Promise<HatchTemplate> =>
  (await ethers.getContractAt("HatchTemplate", await hatchTemplateAddress(), signer)) as HatchTemplate;

const getAddress = async (selectedFilter: string, contract: Contract, transactionHash: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filter = contract.filters[selectedFilter]();

    contract.on(filter, (contractAddress, event) => {
      if (event.transactionHash === transactionHash) {
        contract.removeAllListeners(filter);
        resolve(contractAddress);
      }
    });
  });
};

const createDaoTxOne = async (hatchTemplate: HatchTemplate, log: Function): Promise<string> => {
  const tx = await hatchTemplate.createDaoTxOne(
    orgTokenName,
    orgTokenSymbol,
    [supportRequired, minAcceptQuorum, voteDurationBlocks, voteBufferBlocks, voteExecutionDelayBlocks],
    collateralToken
  );

  await tx.wait();

  const daoAddress = await getAddress("DeployDao", hatchTemplate, tx.hash);

  log(`Tx one completed: Hatch DAO (${daoAddress}) created. Dandelion Voting and Token Manager set up.`);

  return daoAddress
};

const createDaoTxTwo = async (hatchTemplate: HatchTemplate, log: Function): Promise<void> => {
  const tx = await hatchTemplate.createDaoTxTwo(
    hatchMinGoal,
    hatchMaxGoal,
    hatchPeriod,
    hatchExchangeRate,
    vestingCliffPeriod,
    vestingCompletePeriod,
    hatchTribute,
    openDate,
    ihToken,
    maxIHRate,
    expectedRaise
  );

  log(`Tx two completed: Impact Hours app and Hatch app set up.`);

  await tx.wait();
};

const createDaoTxThree = async (hatchTemplate: HatchTemplate, log: Function): Promise<void> => {
  const tx = await hatchTemplate.createDaoTxThree(
    daoId(),
    [collateralToken],
    collateralToken,
    tollgateFee,
    scoreToken,
    hatchOracleRatio
  );

  await tx.wait();

  log(`Tx three completed: Tollgate, Hatch Oracle, Redemptions and Migration Tools apps set up.`);
};


  const appManager = await ethers.getSigners()[0];

  const hatchTemplate = await getHatchTemplate(appManager)

  const daoAddress = await createDaoTxOne(hatchTemplate, log);
  await createDaoTxTwo(hatchTemplate, log);
  await createDaoTxThree(hatchTemplate, log);

  const appIds = [
    await hatchTemplate.DANDELION_VOTING_APP_ID(),
    await hatchTemplate.HATCH_APP_ID(),
    await hatchTemplate.IMPACT_HOURS_APP_ID(),
    await hatchTemplate.REDEMPTIONS_APP_ID(),
    await hatchTemplate.TOLLGATE_APP_ID(),
    await hatchTemplate.MIGRATION_TOOLS_APP_ID(),
  ]

  const dao = (await ethers.getContractAt("Kernel", daoAddress)) as Kernel;
  const apps = await dao.queryFilter(dao.filters.NewAppProxy(null, null, null))
    .then(events => events
      .filter(({ args }) => appIds.includes(args.appId))
      .map(({ args }) => ({
        appId: args.appId,
        proxy: args.proxy
      }))
      .reduce((apps, { appId, proxy }) => ({ ...apps, [appId]: !apps[appId] ? proxy : [...apps[appId], proxy] }), {})
    )
  const appAddresses = appIds.map(appId => apps[appId])

  return {
    daoAddress,
    dandelionVotingAddress: appAddresses[0],
    hatchAddress: appAddresses[1],
    impactHoursAddress: appAddresses[2],
    redemptionsAddress: appAddresses[3],
    tollgateAddress: appAddresses[4],
    migrationToolsAddress: appAddresses[5],
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
