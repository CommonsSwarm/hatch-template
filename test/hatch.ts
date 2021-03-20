import { ethers } from "hardhat";
import { use, assert } from "chai";
import { ContractTransaction } from "ethers";
import { assertBn, assertRevert } from "./helpers/asserts";
import { calculateRewards, claimRewards, contributeToHatch, createContextForUser, log } from "./helpers/helpers";
import { solidity } from "ethereum-waffle";

import { default as newHatch, HatchContext } from "../scripts/new-hatch";
import { BigNumber } from "@ethersproject/bignumber";
import {
  getStateByKey,
  STATE_CLOSED,
  STATE_FUNDING,
  STATE_GOAL_REACHED,
  STATE_REFUNDING,
} from "./helpers/hatch-states";
import { HATCH_ERRORS, IMPACT_HOURS_ERRORS, REDEMPTIONS_ERRORS, TOKEN_ERRORS } from "./helpers/errors";
import { impersonateAddress, increase, restoreSnapshot, takeSnapshot } from "../helpers/rpc";
import getParams from "../params";
import { TokenManager } from "../typechain";

const { PPM: ppm } = getParams();
const PPM = BigNumber.from(ppm);

use(solidity);

// Addresses with contribution tokens to perform hatch operations
const USER1 = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";
const USER2 = "0x5b7575494b1e28974efe6ea71ec569b34958f72e";
const USER3 = "0x839395e20bbb182fa440d08f850e6c7a8f6f0780";
const MIN_NEGLIGIBLE_AMOUNT = ethers.BigNumber.from(String("10000000"));

describe("Hatch Flow", () => {
  let contextUser1: HatchContext;
  let contextUser2: HatchContext;
  let snapshotId: string;

  const useSnapshot = async (): Promise<void> => {
    await restoreSnapshot(snapshotId);
    snapshotId = await takeSnapshot();
  };

  before(async () => {
    contextUser1 = await newHatch(USER1, log);
    contextUser2 = createContextForUser(contextUser1, await impersonateAddress(USER2));

    snapshotId = await takeSnapshot();
  });

  context("When max goal is reached", async () => {
    let userContribution: BigNumber;
    let totalContributed: BigNumber;

    it("opens the hatch", async () => {
      const { hatch } = contextUser1;

      const tx = await hatch.open();
      await tx.wait();

      assert.strictEqual(getStateByKey(await hatch.state()), STATE_FUNDING, HATCH_ERRORS.ERROR_HATCH_NOT_OPENED);
    });

    it("contributes with a max goal amount to the hatch", async () => {
      const { hatch, contributionToken, hatchUser, hatchToken, redemptions } = contextUser1;
      userContribution = await hatch.maxGoal();
      totalContributed = userContribution;
      await contributionToken.approve(hatch.address, userContribution);

      assertBn(
        await contributionToken.allowance(await hatchUser.getAddress(), hatch.address),
        userContribution,
        TOKEN_ERRORS.ERROR_APPROVAL_MISMATCH
      );

      await hatch.contribute(userContribution);

      const tokenManager = (await ethers.getContractAt(
        "TokenManager",
        await redemptions.tokenManager(),
        hatchUser
      )) as TokenManager;
      console.log((await tokenManager.spendableBalanceOf(USER1)).toString());
      console.log((await contributionToken.balanceOf(await hatch.reserve())).toString());
      console.log((await hatchToken.balanceOf(USER1)).toString());

      assertBn(
        await contributionToken.balanceOf(hatch.address),
        userContribution,
        HATCH_ERRORS.ERROR_CONTRIBUTION_NOT_MADE
      );

      assert.equal(getStateByKey(await hatch.state()), STATE_GOAL_REACHED, HATCH_ERRORS.ERROR_HATCH_GOAL_NOT_REACHED);
    });
    it("claims the impact hours for all contributors", async () => {
      const { hatch, impactHours, impactHoursToken, impactHoursClonedToken, hatchToken } = contextUser1;

      const totalRaised = await hatch.totalRaised();
      const totalIH = await impactHoursClonedToken.totalSupply();
      const totalIHRewards = await calculateRewards(impactHours, totalRaised, totalIH);
      const expectedHatchTokens = await hatch.contributionToTokens(totalIHRewards);
      const hatchTokenTotalSupply = await hatchToken.totalSupply();

      await claimRewards(impactHours, impactHoursToken);

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
      const { hatch, impactHours } = contextUser1;

      const tx = await impactHours.closeHatch();
      await tx.wait();

      assert.equal(getStateByKey(await hatch.state()), STATE_CLOSED, HATCH_ERRORS.ERROR_HATCH_NOT_CLOSED);
    });
    it("distributes part of the funds to the funding pool", async () => {
      const { hatch, contributionToken } = contextUser1;
      const fundingPool = await hatch.beneficiary();
      const fundingPoolBalance = totalContributed.mul(await hatch.fundingForBeneficiaryPct()).div(PPM);

      assertBn(
        await contributionToken.balanceOf(fundingPool),
        fundingPoolBalance,
        HATCH_ERRORS.ERROR_WRONG_BENEFICIARY_FUNDS_DISTRIBUTION
      );
    });
    it("distributes part of the funds to the reserve pool", async () => {
      const { hatch, contributionToken } = contextUser1;
      const reservePool = await hatch.reserve();
      const reservePoolBalance = totalContributed.mul(PPM.sub(await hatch.fundingForBeneficiaryPct())).div(PPM);

      assertBn(
        await contributionToken.balanceOf(reservePool),
        reservePoolBalance,
        HATCH_ERRORS.ERROR_WRONG_RESEVE_FUNDS_DISTRIBUTION
      );
    });
    it("distributes part of the initial supply of tokens to funding pool ", async () => {
      const { hatch, hatchToken } = contextUser1;
      const beneficiary = await hatch.beneficiary();
      const supplyOfferedPct = (await hatch.supplyOfferedPct()).toNumber();
      const hatchTokenOfferedAmount = (await hatchToken.totalSupply()).mul(PPM.sub(supplyOfferedPct)).div(PPM);

      assertBn(
        await hatchToken.balanceOf(beneficiary),
        hatchTokenOfferedAmount,
        HATCH_ERRORS.ERROR_WRONG_SUPPLY_OFFERED_DISTRIBUTION
      );
    });
    xit("redeems contributor's token amount", async () => {
      const { hatchToken, contributionToken, redemptions } = contextUser1;
      const previousBalance = await contributionToken.balanceOf(USER1);

      const tx = await redemptions.redeem(await hatchToken.balanceOf(USER1));
      await tx.wait();

      assertBn(
        await contributionToken.balanceOf(USER1),
        previousBalance.add(userContribution),
        REDEMPTIONS_ERRORS.ERROR_CONTRIBUTION_NOT_REDEEM
      );

      assertBn(
        await hatchToken.balanceOf(USER1),
        BigNumber.from(0),
        REDEMPTIONS_ERRORS.ERROR_REDEEMED_TOKENS_NOT_BURNED
      );
    });
    xit("should not redeem tokens for non-contributors", async () => {
      const { redemptions } = contextUser2;
      await assertRevert(redemptions.redeem(userContribution), "REDEMPTIONS_CANNOT_REDEEM_ZERO");
    });
  });
  context("When min goal is reached", async () => {
    let minGoalContribution: BigNumber;

    before(async () => {
      await useSnapshot();

      const { hatch } = contextUser1;
      let tx: ContractTransaction;
      minGoalContribution = await hatch.minGoal();

      tx = await hatch.open();
      await tx.wait();
    });
    it("hatch state is goal reached", async () => {
      const { hatch } = contextUser1;

      await contributeToHatch(contextUser1, minGoalContribution);

      await increase(await hatch.period());

      assert.equal(getStateByKey(await hatch.state()), STATE_GOAL_REACHED, HATCH_ERRORS.ERROR_HATCH_GOAL_NOT_REACHED);
    });
  });
  context("When min goal is not reached", async () => {
    let previousBalance: BigNumber;
    let contributionAmount: BigNumber;

    before(async () => {
      await useSnapshot();

      const { hatch: h1, contributionToken: ct1 } = contextUser1;
      let tx: ContractTransaction;

      tx = await h1.open();
      await tx.wait();

      contributionAmount = (await h1.minGoal()).div(3);

      await contributeToHatch(contextUser1, contributionAmount);
      await contributeToHatch(contextUser2, contributionAmount);

      await increase(await h1.period());
    });
    it("hatch state is refunding", async () => {
      const { hatch } = contextUser1;
      assert.equal(getStateByKey(await hatch.state()), STATE_REFUNDING);
    });
    xit("gives the refund amount to contributor", async () => {
      const { hatch, contributionToken, hatchToken } = contextUser1;

      const tx = await hatch.refund(USER1, 0);
      await tx.wait();

      assertBn(
        await contributionToken.balanceOf(USER1),
        previousBalance.add(contributionAmount),
        HATCH_ERRORS.ERROR_CONTRIBUTOR_NOT_REFUNDED
      );
    });
    xit("Burns the hatch tokens once contributor gets refunded", async () => {
      const { hatchToken } = contextUser1;
      assertBn(await hatchToken.balanceOf(USER1), BigNumber.from(0), HATCH_ERRORS.ERROR_HATCH_TOKENS_NOT_BURNED);
    });
  });
});
