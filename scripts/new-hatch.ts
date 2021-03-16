import hre, { ethers } from "hardhat";
import { Contract } from "@ethersproject/contracts";
import { Signer } from "@ethersproject/abstract-signer";
import { ERC20, HatchTemplate, IHatch, IImpactHours, Kernel, MiniMeToken } from "../typechain";
import { impersonateAddress } from "../helpers/rpc";

const { deployments } = hre;
const { BigNumber } = ethers;

export interface HatchContext {
  hatchUser?: Signer;
  dao?: Kernel;
  hatch?: IHatch;
  contributionToken?: ERC20;
  hatchToken: ERC20;
  impactHours: IImpactHours;
  impactHoursClonedToken: MiniMeToken;
  impactHoursToken: MiniMeToken;
}

const DAO_ID = "testtec" + Math.random(); // Note this must be unique for each deployment, change it for subsequent deployments
const NETWORK_ARG = "--network";
const DAO_ID_ARG = "--daoid";

const argValue = (arg, defaultValue) =>
  process.argv.includes(arg) ? process.argv[process.argv.indexOf(arg) + 1] : defaultValue;

const network = () => argValue(NETWORK_ARG, "local");
const daoId = () => argValue(DAO_ID_ARG, DAO_ID);

// Helpers, no need to change
const HOURS = 60 * 60;
const DAYS = 24 * HOURS;
const ONE_HUNDRED_PERCENT = 1e18;
const ONE_TOKEN = BigNumber.from((1e18).toString());
const FUNDRAISING_ONE_HUNDRED_PERCENT = 1e6;
const FUNDRAISING_ONE_TOKEN = BigNumber.from((1e18).toString());
const PPM = 1000000;

const BLOCKTIME = network() === "rinkeby" ? 15 : network() === "mainnet" ? 13 : 5; // 15 rinkeby, 13 mainnet, 5 xdai
console.log(`Every ${BLOCKTIME}s a new block is mined in ${network()}.`);

// CONFIGURATION

// Collateral Token is used to pay contributors and held in the bonding curve reserve
const COLLATERAL_TOKEN = "0xfb8f60246d56905866e12443ec0836ebfb3e1f2e"; // tDAI

// Org Token represents membership in the community and influence in proposals
const ORG_TOKEN_NAME = "Token Engineering Commons TEST Hatch Token";
const ORG_TOKEN_SYMBOL = "TESTTECH";

// # Hatch Oracle Settings

// Score membership token is used to check how much members can contribute to the hatch
const SCORE_TOKEN = "0xc4fbe68522ba81a28879763c3ee33e08b13c499e"; // CSTK Token on xDai
const SCORE_ONE_TOKEN = BigNumber.from(1);
// Ratio contribution tokens allowed per score membership token
const HATCH_ORACLE_RATIO = BigNumber.from(0.8 * PPM)
  .mul(FUNDRAISING_ONE_TOKEN)
  .div(SCORE_ONE_TOKEN);

// # Dandelion Voting Settings

// Used for administrative or binary choice decisions with ragequit-like functionality
const SUPPORT_REQUIRED = String(0.6 * ONE_HUNDRED_PERCENT);
const MIN_ACCEPTANCE_QUORUM = String(0.02 * ONE_HUNDRED_PERCENT);
const VOTE_DURATION_BLOCKS = (3 * DAYS) / BLOCKTIME;
const VOTE_BUFFER_BLOCKS = (8 * HOURS) / BLOCKTIME;
const VOTE_EXECUTION_DELAY_BLOCKS = (24 * HOURS) / BLOCKTIME;
// Set the fee paid to the org to create an administrative vote
const TOLLGATE_FEE = BigNumber.from(3).mul(ONE_TOKEN);

// # Hatch settings

// How many COLLATERAL_TOKEN's are required to Hatch
const HATCH_MIN_GOAL = BigNumber.from(5).mul(ONE_TOKEN);
// What is the Max number of COLLATERAL_TOKEN's the Hatch can recieve
const HATCH_MAX_GOAL = BigNumber.from(1000).mul(ONE_TOKEN);
// How long should the hatch period last
const HATCH_PERIOD = 15 * DAYS;
// How many organization tokens should be minted per collateral token
const HATCH_EXCHANGE_RATE = BigNumber.from(10000 * PPM)
  .mul(ONE_TOKEN)
  .div(FUNDRAISING_ONE_TOKEN);
// When does the cliff for vesting restrictions end
const VESTING_CLIFF_PERIOD = HATCH_PERIOD + 1; // 1 second after hatch
// When will the Hatchers be fully vested and able to use the redemptions app
const VESTING_COMPLETE_PERIOD = VESTING_CLIFF_PERIOD + 1; // 2 seconds after hatch
// What percentage of Hatch contributions should go to the Funding Pool and therefore be non refundable
const HATCH_TRIBUTE = 0.05 * FUNDRAISING_ONE_HUNDRED_PERCENT;
// when should the Hatch open, setting 0 will allow anyone to open the Hatch anytime after deployment
const OPEN_DATE = 0;

// # Impact hours settings

// Impact Hours token address
const IH_TOKEN = "0xdf2c3c8764a92eb43d2eea0a4c2d77c2306b0835";
// Max theoretical collateral token rate per impact hour
const MAX_IH_RATE = BigNumber.from(100).mul(ONE_TOKEN);

// How much will we need to raise to reach 1/2 of the MAX_IH_RATE divided by total IH
const EXPECTED_RAISE_PER_IH = BigNumber.from(0.012 * 1000)
  .mul(ONE_TOKEN)
  .div(1000);

// There are multiple ERC20 paths. We need to specify one.
const ERC20Path = "@aragon/os/contracts/lib/token/ERC20.sol:ERC20";
// Address use to perform hatch operations
const HATCH_USER = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";

const hatchTemplateAddress = async () => (await deployments.get("HatchTemplate")).address;

const getHatchTemplate = async (signer: Signer): Promise<HatchTemplate> =>
  (await ethers.getContractAt("HatchTemplate", await hatchTemplateAddress(), signer)) as HatchTemplate;

const getAppAddresses = async (dao: Kernel, ensNames: string[]): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const inputAppIds = ensNames.map(ethers.utils.namehash);
    const proxies: string[] = [];

    dao.on("NewAppProxy", (proxy, isUpgradeable, appId, event) => {
      const index = inputAppIds.indexOf(appId);
      if (index >= 0) {
        proxies[index] = proxy;
      }
      if (proxies.length === ensNames.length) {
        dao.removeAllListeners("NewAppProxy");
        resolve(proxies);
      }
    });
  });
};

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

const createDaoTxOne = async (context: HatchContext, appManager: Signer, log: Function): Promise<void> => {
  const hatchTemplate = await getHatchTemplate(appManager);
  const tx = await hatchTemplate.createDaoTxOne(
    ORG_TOKEN_NAME,
    ORG_TOKEN_SYMBOL,
    [SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION_BLOCKS, VOTE_BUFFER_BLOCKS, VOTE_EXECUTION_DELAY_BLOCKS],
    COLLATERAL_TOKEN
  );

  await tx.wait();

  const daoAddress = await getAddress("DeployDao", hatchTemplate, tx.hash);
  const dao = (await ethers.getContractAt("Kernel", daoAddress)) as Kernel;

  context.dao = dao;

  log(`Tx one completed: Hatch DAO (${daoAddress}) created. Dandelion Voting and Hooked Token Manager set up.`);
};

const createDaoTxTwo = async (context: HatchContext, appManager: Signer, log: Function): Promise<void> => {
  const hatchTemplate = await getHatchTemplate(appManager);
  const hatchUser = context.hatchUser;
  const impactHoursToken = (await ethers.getContractAt("MiniMeToken", IH_TOKEN, appManager)) as MiniMeToken;

  const totalImpactHours = await impactHoursToken.totalSupply();
  const expectedRaise = EXPECTED_RAISE_PER_IH.mul(totalImpactHours).div(ONE_TOKEN);

  const tx = await hatchTemplate.createDaoTxTwo(
    HATCH_MIN_GOAL,
    HATCH_MAX_GOAL,
    HATCH_PERIOD,
    HATCH_EXCHANGE_RATE,
    VESTING_CLIFF_PERIOD,
    VESTING_COMPLETE_PERIOD,
    HATCH_TRIBUTE,
    OPEN_DATE,
    IH_TOKEN,
    MAX_IH_RATE,
    expectedRaise
  );

  const [hatchAddress, impactHoursAddress] = await getAppAddresses(context.dao, [
    "marketplace-hatch.open.aragonpm.eth",
    "impact-hours-beta.open.aragonpm.eth",
  ]);

  context.hatch = (await ethers.getContractAt("IHatch", hatchAddress, hatchUser)) as IHatch;
  context.contributionToken = (await ethers.getContractAt(
    ERC20Path,
    await context.hatch.contributionToken(),
    hatchUser
  )) as ERC20;
  context.hatchToken = (await ethers.getContractAt(ERC20Path, await context.hatch.token(), hatchUser)) as ERC20;
  context.impactHours = (await ethers.getContractAt("IImpactHours", impactHoursAddress, hatchUser)) as IImpactHours;
  context.impactHoursClonedToken = (await ethers.getContractAt(
    "MiniMeToken",
    await context.impactHours.token(),
    hatchUser
  )) as MiniMeToken;
  context.impactHoursToken = (await ethers.getContractAt(
    "MiniMeToken",
    await context.impactHoursClonedToken.parentToken(),
    hatchUser
  )) as MiniMeToken;

  log(`Tx two completed: Impact Hours app and Hatch app set up.`);

  await tx.wait();
};

const createDaoTxThree = async (context: HatchContext, appManager: Signer, log: Function): Promise<void> => {
  const hatchTemplate = await getHatchTemplate(appManager);

  const tx = await hatchTemplate.createDaoTxThree(
    DAO_ID,
    [COLLATERAL_TOKEN],
    COLLATERAL_TOKEN,
    TOLLGATE_FEE,
    SCORE_TOKEN,
    HATCH_ORACLE_RATIO
  );

  await tx.wait();

  log(`Tx three completed: Tollgate, Redemptions and Conviction Voting apps set up.`);
};

export default async function main(log = console.log) {
  const hatchTemplateContext = {} as HatchContext;
  const appManager = await ethers.getSigners()[0];

  hatchTemplateContext.hatchUser = await impersonateAddress(HATCH_USER);

  await createDaoTxOne(hatchTemplateContext, appManager, log);
  await createDaoTxTwo(hatchTemplateContext, appManager, log);
  await createDaoTxThree(hatchTemplateContext, appManager, log);

  return hatchTemplateContext;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
