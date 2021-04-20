import hre, { ethers } from "hardhat";

const { BigNumber } = ethers;

// xdai as default network.
const DEFAULT_CHAIN = 5;
const network = hre.network.name === 'localhost' ? 'xdai' : hre.network.name

// Helpers, no need to change
const HOURS = 60 * 60;
const DAYS = 24 * HOURS;
const ONE_HUNDRED_PERCENT = 1e18;
const ONE_TOKEN = BigNumber.from((1e18).toString());
const FUNDRAISING_ONE_HUNDRED_PERCENT = 1e6;
const fundraisingOneToken = params => BigNumber.from((10 ** params.collateralTokenDecimals).toString());
const PPM = 1000000;

// Collateral Token is used to pay contributors and held in the bonding curve reserve
const collateralToken = params => params.collateralToken; // wxDAI

// Org Token represents membership in the community and influence in proposals
const orgTokenName = params => params.orgTokenName;
const orgTokenSymbol = params => params.orgTokenSymbol;

// # Hatch Oracle Settings

// Score membership token is used to check how much members can contribute to the hatch
const scoreToken = params => params.scoreToken; // CSTK Token on xDai
const scoreOneToken = params => BigNumber.from(10 ** params.scoreTokenDecimals);
// Ratio contribution tokens allowed per score membership token
const hatchOracleRatio = params => BigNumber.from(params.hatchOracleRatio * PPM)
  .mul(fundraisingOneToken(params))
  .div(scoreOneToken(params));

// # Dandelion Voting Settings
// Used for administrative or binary choice decisions with ragequit-like functionality on Dandelion Voting
const voteDuration = params => params.voteDurationDays * DAYS // Alternatively: 3 * DAYS;
const voteBuffer = params => params.voteBufferHours * HOURS;
const voteExecutionDelay = params => params.rageQuitHours * HOURS // Alternatively: 24 * HOURS;
const supportRequired = params => String(params.supportRequired * ONE_HUNDRED_PERCENT);
const minAcceptQuorum = params => String(params.minAcceptQuorum * ONE_HUNDRED_PERCENT);

// Set the fee paid to the org to create an administrative vote
const tollgateFee = params => BigNumber.from(params.tollgateFee).mul(ONE_TOKEN);

// # Hatch settings

// How many COLLATERAL_TOKEN's are required to Hatch
const hatchMinGoal = params => BigNumber.from(params.hatchMinGoal).mul(ONE_TOKEN);
// What is the Max number of COLLATERAL_TOKEN's the Hatch can recieve
const hatchMaxGoal = params => BigNumber.from(params.hatchMaxGoal).mul(ONE_TOKEN);
// How long should the hatch period last
const hatchPeriod = params => params.hatchPeriodDays * DAYS;
// How many organization tokens should be minted per collateral token
const hatchExchangeRate = params => BigNumber.from(params.hatchMintRate * PPM)
  .mul(ONE_TOKEN)
  .div(fundraisingOneToken(params));
// When does the cliff for vesting restrictions end
const vestingCliffPeriod = params => Math.floor(hatchPeriod(params) + params.refundPeriodDays * DAYS); // This is now the Refund period
// When will the Hatchers be fully vested and able to use the redemptions app
const vestingCompletePeriod = params => vestingCliffPeriod(params) + 1; // 1 week and 1 second after hatch
// What percentage of Hatch contributions should go to the Funding Pool and therefore be non refundable
const hatchTribute = params => params.hatchTribute * FUNDRAISING_ONE_HUNDRED_PERCENT;
// when should the Hatch open, setting 0 will allow anyone to open the Hatch anytime after deployment
const OPEN_DATE = 0;

// # Impact hours settings

// Impact Hours token address
const ihToken = params => params.ihToken;
// Max theoretical collateral token rate per impact hour
const maxIHRate = params => BigNumber.from(params.maxIHRate * PPM).mul(ONE_TOKEN).div(PPM);

// How much will we need to raise to reach 1/2 of the MAX_IH_RATE divided by total IH
const expectedRaisePerIH = params => BigNumber.from(params.ihSlope * PPM)
  .mul(ONE_TOKEN)
  .div(PPM);

const getParams = async (blockTime = DEFAULT_CHAIN) => {

  const params = await import(`./params-${network}.json`);
  return {
    HOURS,
    DAYS,
    ONE_HUNDRED_PERCENT,
    ONE_TOKEN,
    FUNDRAISING_ONE_HUNDRED_PERCENT,
    fundraisingOneToken: fundraisingOneToken(params),
    PPM,
    collateralToken: collateralToken(params),
    orgTokenName: orgTokenName(params),
    orgTokenSymbol: orgTokenSymbol(params),
    scoreToken: scoreToken(params),
    scoreOneToken: scoreOneToken(params),
    hatchOracleRatio: hatchOracleRatio(params),
    tollgateFee: tollgateFee(params),
    hatchMinGoal: hatchMinGoal(params),
    hatchMaxGoal: hatchMaxGoal(params),
    hatchPeriod: hatchPeriod(params),
    hatchExchangeRate: hatchExchangeRate(params),
    vestingCliffPeriod: vestingCliffPeriod(params),
    vestingCompletePeriod: vestingCompletePeriod(params),
    hatchTribute: hatchTribute(params),
    openDate: OPEN_DATE,
    ihToken: ihToken(params),
    maxIHRate: maxIHRate(params),
    ihSlope: expectedRaisePerIH(params),
    supportRequired: supportRequired(params),
    minAcceptQuorum: minAcceptQuorum(params),
    voteDurationBlocks: voteDuration(params) / blockTime,
    voteBufferBlocks: voteBuffer(params) / blockTime,
    voteExecutionDelayBlocks: voteExecutionDelay(params) / blockTime,
  }
};

export default getParams;
