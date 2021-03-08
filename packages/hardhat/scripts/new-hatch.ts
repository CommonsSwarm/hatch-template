import { Contract } from "@ethersproject/contracts";
import hre, { ethers } from "hardhat";
import { HatchTemplate } from "../typechain";

const { deployments } = hre;

const DAO_ID = "testtec" + Math.random(); // Note this must be unique for each deployment, change it for subsequent deployments
const NETWORK_ARG = "--network";
const DAO_ID_ARG = "--daoid";

const argValue = (arg, defaultValue) =>
  process.argv.includes(arg) ? process.argv[process.argv.indexOf(arg) + 1] : defaultValue;

const network = () => argValue(NETWORK_ARG, "local");
const daoId = () => argValue(DAO_ID_ARG, DAO_ID);

const hatchTemplateAddress = async () => (await deployments.get("HatchTemplate")).address;

// Helpers, no need to change
const HOURS = 60 * 60;
const DAYS = 24 * HOURS;
const ONE_HUNDRED_PERCENT = 1e18;
const ONE_TOKEN = 1e18;
const FUNDRAISING_ONE_HUNDRED_PERCENT = 1e6;
const FUNDRAISING_ONE_TOKEN = 1e18;
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
const SCORE_ONE_TOKEN = 1;
// Ratio contribution tokens allowed per score membership token
const HATCH_ORACLE_RATIO = (0.005 * PPM * FUNDRAISING_ONE_TOKEN) / SCORE_ONE_TOKEN;

// # Dandelion Voting Settings

// Used for administrative or binary choice decisions with ragequit-like functionality
const SUPPORT_REQUIRED = 0.6 * ONE_HUNDRED_PERCENT;
const MIN_ACCEPTANCE_QUORUM = 0.02 * ONE_HUNDRED_PERCENT;
const VOTE_DURATION_BLOCKS = (3 * DAYS) / BLOCKTIME;
const VOTE_BUFFER_BLOCKS = (8 * HOURS) / BLOCKTIME;
const VOTE_EXECUTION_DELAY_BLOCKS = (24 * HOURS) / BLOCKTIME;
// Set the fee paid to the org to create an administrative vote
const TOLLGATE_FEE = 3 * ONE_TOKEN;

// # Hatch settings

// How many COLLATERAL_TOKEN's are required to Hatch
const HATCH_MIN_GOAL = 5 * ONE_TOKEN;
// What is the Max number of COLLATERAL_TOKEN's the Hatch can recieve
const HATCH_MAX_GOAL = 1000 * ONE_TOKEN;
// How long should the hatch period last
const HATCH_PERIOD = 15 * DAYS;
// How many organization tokens should be minted per collateral token
const HATCH_EXCHANGE_RATE = (10000 * PPM * ONE_TOKEN) / FUNDRAISING_ONE_TOKEN;
// When does the cliff for vesting restrictions end
const VESTING_CLIFF_PERIOD = HATCH_PERIOD + 1; // 1 second after hatch
// When will the Hatchers be fully vested and able to use the redemptions app
const VESTING_COMPLETE_PERIOD = VESTING_CLIFF_PERIOD + 1; // 2 seconds after hatch
// What percentage of Hatch contributions should go to the Funding Pool and therefore be non refundable
const HATCH_PERCENT_FUNDING_FOR_BENEFICIARY = 0.05 * FUNDRAISING_ONE_HUNDRED_PERCENT;
// when should the Hatch open, setting 0 will allow anyone to open the Hatch anytime after deployment
const OPEN_DATE = 0;

// # Impact hours settings

// Impact Hours token address
const IH_TOKEN = "0xdf2c3c8764a92eb43d2eea0a4c2d77c2306b0835";
// Max theoretical rate per impact hour in Collateral_token per IH
const MAX_IH_RATE = 1;
// How much will we need to raise to reach 1/2 of the MAX_IH_RATE divided by total IH
const EXPECTED_RAISE_PER_IH = 0.012 * ONE_TOKEN;

async function getAddress(selectedFilter: string, contract: Contract, transactionHash: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const filter = contract.filters[selectedFilter]();

    contract.on(filter, (contractAddress, event) => {
      if (event.transactionHash === transactionHash) {
        contract.removeAllListeners();
        resolve(contractAddress);
      }
    });
  });
}

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const signers = await ethers.getSigners();

  const hatchTemplate = (await ethers.getContractAt(
    "HatchTemplate",
    await hatchTemplateAddress(),
    signers[0]
  )) as HatchTemplate;

  const transactionOne = await hatchTemplate.createDaoTxOne(
    ORG_TOKEN_NAME,
    ORG_TOKEN_SYMBOL,
    [
      SUPPORT_REQUIRED.toString(),
      MIN_ACCEPTANCE_QUORUM.toString(),
      VOTE_DURATION_BLOCKS.toString(),
      VOTE_BUFFER_BLOCKS.toString(),
      VOTE_EXECUTION_DELAY_BLOCKS.toString(),
    ],
    COLLATERAL_TOKEN
  );
  const createDaoTxOneReceipt = await transactionOne.wait();

  // Filter and get the org address from the events.
  const orgAddress = await getAddress("DeployDao", hatchTemplate, transactionOne.hash);

  console.log(`Tx One Complete. DAO address: ${orgAddress} Gas used: ${createDaoTxOneReceipt.gasUsed} `);

  const transactionTwo = await hatchTemplate.createDaoTxTwo(
    HATCH_MIN_GOAL.toString(),
    HATCH_MAX_GOAL.toString(),
    HATCH_PERIOD.toString(),
    HATCH_EXCHANGE_RATE.toString(),
    VESTING_CLIFF_PERIOD.toString(),
    VESTING_COMPLETE_PERIOD.toString(),
    HATCH_PERCENT_FUNDING_FOR_BENEFICIARY.toString(),
    OPEN_DATE.toString(),
    IH_TOKEN.toString(),
    MAX_IH_RATE.toString(),
    EXPECTED_RAISE_PER_IH.toString()
  );
  const createDaoTxTwoReceipt = await transactionTwo.wait();

  console.log(`Tx Two Complete. Gas used: ${createDaoTxTwoReceipt.gasUsed}`);

  const transactionThree = await hatchTemplate.createDaoTxThree(
    daoId(),
    [COLLATERAL_TOKEN],
    COLLATERAL_TOKEN,
    TOLLGATE_FEE.toString(),
    SCORE_TOKEN,
    HATCH_ORACLE_RATIO.toString()
  );
  const createDaoTxThreeReceipt = await transactionThree.wait();

  console.log(`Tx Three Complete. Gas used: ${createDaoTxThreeReceipt.gasUsed}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
