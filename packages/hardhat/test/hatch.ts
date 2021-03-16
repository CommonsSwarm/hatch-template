import { Signer } from "@ethersproject/abstract-signer";
import { ethers } from "hardhat";
import { use, assert } from "chai";
import { getContributors, log } from "./helpers/helpers";
import { solidity } from "ethereum-waffle";
import { assertBn } from "@aragon/contract-helpers-test/src/asserts";

import newHatch from "../scripts/new-hatch";
import { impersonateAddress } from "../helpers/rpc";
import { Kernel, IHatch, IImpactHours, ERC20, MiniMeToken } from "../typechain";
import { BigNumber } from "@ethersproject/bignumber";
import { getStateByKey, STATE_CLOSED, STATE_FUNDING, STATE_GOAL_REACHED } from "./helpers/hatch-states";
import { HATCH_ERRORS, IMPACT_HOURS_ERRORS, TOKEN_ERRORS } from "./helpers/errors";
import { calculateRewards } from "./helpers/helpers";

use(solidity);

// There are multiple ERC20 paths. We need to specify one.
const ERC20Path = "@aragon/os/contracts/lib/token/ERC20.sol:ERC20";
const HATCH_USER = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";
const MIN_NEGLIGIBLE_AMOUNT = ethers.BigNumber.from(String("10000000"));

async function claimRewards(impactHours: IImpactHours, impactHoursTokenAddress: string): Promise<void> {
  const CONTRIBUTORS_PROCESSED_PER_TRANSACTION = 10;
  const contributors = await getContributors(impactHoursTokenAddress);
  const total = Math.ceil(contributors.length / CONTRIBUTORS_PROCESSED_PER_TRANSACTION);
  let counter = 1;
  let tx;

  for (let i = 0; i < contributors.length; i += CONTRIBUTORS_PROCESSED_PER_TRANSACTION) {
    // Claim rewards might get too expensive so we set gasPrice to 1
    tx = await impactHours.claimReward(contributors.slice(i, i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION), {
      gasPrice: 1,
    });

    await tx.wait();

    log(
      `Tx ${counter++} of ${total}: Rewards claimed for IH token holders ${i + 1} to ${Math.min(
        i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION,
        contributors.length
      )}.`,
      10
    );
  }
}

describe("Hatch Flow", function () {
  let hatchUser: Signer;
  let dao: Kernel;
  let hatch: IHatch;
  let impactHours: IImpactHours;
  let contributionToken: ERC20;
  let hatchToken: ERC20;
  let impactHoursClonedToken: ERC20;
  let impactHoursTokenAddress: string;

  before(async () => {
    const [daoAddress, hatchAddress, impactHoursAddress] = await newHatch();

    hatchUser = await impersonateAddress(HATCH_USER);
    dao = (await ethers.getContractAt("Kernel", daoAddress)) as Kernel;
    hatch = (await ethers.getContractAt("IHatch", hatchAddress, hatchUser)) as IHatch;
    impactHours = (await ethers.getContractAt("IImpactHours", impactHoursAddress, hatchUser)) as IImpactHours;
    contributionToken = (await ethers.getContractAt(ERC20Path, await hatch.contributionToken(), hatchUser)) as ERC20;
    hatchToken = (await ethers.getContractAt(ERC20Path, await hatch.token(), hatchUser)) as ERC20;
    impactHoursClonedToken = (await ethers.getContractAt(
      "MiniMeToken",
      await impactHours.token(),
      hatchUser
    )) as MiniMeToken;
    impactHoursTokenAddress = await impactHoursClonedToken.parentToken();
  });

  context("When max goal is reached", async () => {
    it("opens the hatch", async function () {
      const tx = await hatch.open();

      await tx.wait();

      assert.strictEqual(getStateByKey(await hatch.state()), STATE_FUNDING, HATCH_ERRORS.ERROR_HATCH_NOT_OPENED);
    });

    it("contributes with a max goal amount to the hatch", async () => {
      let tx;
      const maxGoalContribution = await hatch.maxGoal();

      tx = await contributionToken.approve(hatch.address, maxGoalContribution);

      await tx.wait();

      assertBn(
        await contributionToken.allowance(HATCH_USER, hatch.address),
        maxGoalContribution,
        TOKEN_ERRORS.ERROR_APPROVAL_MISMATCH
      );

      tx = await hatch.contribute(maxGoalContribution);

      await tx.wait();

      assertBn(
        await contributionToken.balanceOf(hatch.address),
        maxGoalContribution,
        HATCH_ERRORS.ERROR_CONTRIBUTION_NOT_MADE
      );

      assert.equal(getStateByKey(await hatch.state()), STATE_GOAL_REACHED, HATCH_ERRORS.ERROR_HATCH_GOAL_NOT_REACHED);
    });

    it("claims the impact hours for all contributors", async () => {
      const totalRaised = await hatch.totalRaised();
      const totalIH = await impactHoursClonedToken.totalSupply();
      const totalIHRewards = await calculateRewards(impactHours, totalRaised, totalIH);
      const expectedHatchTokens = await hatch.contributionToTokens(totalIHRewards);
      const hatchTokenTotalSupply = await hatchToken.totalSupply();

      await claimRewards(impactHours, impactHoursTokenAddress);

      assert.isTrue(
        hatchTokenTotalSupply
          .add(expectedHatchTokens)
          .sub(await hatchToken.totalSupply())
          .lt(MIN_NEGLIGIBLE_AMOUNT),
        IMPACT_HOURS_ERRORS.ERROR_CLAIMED_REWARDS_MISMATCH
      );

      assertBn(
        await impactHoursClonedToken.totalSupply(),
        BigNumber.from(0),
        IMPACT_HOURS_ERRORS.ERROR_ALL_TOKENS_NOT_DESTROYED
      );
    });

    it("closes the hatch", async () => {
      const tx = await impactHours.closeHatch();

      await tx.wait();

      assert.equal(getStateByKey(await hatch.state()), STATE_CLOSED, HATCH_ERRORS.ERROR_HATCH_NOT_CLOSED);
    });
  });
});
