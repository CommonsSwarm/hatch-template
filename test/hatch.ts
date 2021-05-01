import { ethers } from "hardhat";
import { use, assert } from "chai";
import { ContractTransaction } from "ethers";
import { assertBn, assertRevert } from "./helpers/asserts";
import { calculateRewards, claimTokens, contributeToHatch, log } from "./helpers/helpers";
import { userContext, UserContext } from "./helpers/user-context"
import { solidity } from "ethereum-waffle";

import newHatch, { HatchAddresses } from "../scripts/new-hatch";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  getStateByKey,
  STATE_CLOSED,
  STATE_FUNDING,
  STATE_GOAL_REACHED,
  STATE_REFUNDING,
} from "./helpers/hatch-states";
import { HATCH_ERRORS, IMPACT_HOURS_ERRORS, REDEMPTIONS_ERRORS, TOKEN_ERRORS } from "./helpers/errors";
import { impersonateAddress, increase, duration, restoreSnapshot, takeSnapshot } from "../helpers/rpc";
import { PPM as ppm } from "../params";
import { newMigrableDao } from "./helpers/migrable-dao";
import { encodeActCall, encodeCallScript } from './helpers/aragon-os'
import { MigrationTools, MiniMeToken, Vault } from "../typechain";

const PPM = BigNumber.from(ppm);

use(solidity);

// Addresses with contribution tokens to perform hatch operations
const USER1 = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";
const USER2 = "0x5b7575494b1e28974efe6ea71ec569b34958f72e";
const MIN_NEGLIGIBLE_AMOUNT = ethers.BigNumber.from(String("10000000"));

describe("Hatch Flow", () => {
  let hatchAddresses: HatchAddresses;
  let userContext1: UserContext;
  let userContext2: UserContext;
  let snapshotId: string;

  const useSnapshot = async (): Promise<void> => {
    await restoreSnapshot(snapshotId);
    snapshotId = await takeSnapshot();
  };

  before(async () => {
    hatchAddresses = await newHatch(log);
    userContext1 = await userContext(hatchAddresses, await impersonateAddress(USER1))
    userContext2 = await userContext(hatchAddresses, await impersonateAddress(USER2))

    snapshotId = await takeSnapshot();
  });

  context("When max goal is reached", async () => {
    let userContribution: BigNumber;
    let totalContributed: BigNumber;

    it("opens the hatch", async () => {
      const { hatch } = userContext1;

      const tx = await hatch.open();
      await tx.wait();

      assert.strictEqual(getStateByKey(await hatch.state()), STATE_FUNDING, HATCH_ERRORS.ERROR_HATCH_NOT_OPENED);
    });

    it("contributes with a max goal amount to the hatch", async () => {
      const { hatch, contributionToken, signer: hatchUser } = userContext1;
      userContribution = await hatch.maxGoal();
      totalContributed = userContribution;
      await contributionToken.approve(hatch.address, userContribution);

      assertBn(
        await contributionToken.allowance(await hatchUser.getAddress(), hatch.address),
        userContribution,
        TOKEN_ERRORS.ERROR_APPROVAL_MISMATCH
      );

      await hatch.contribute(userContribution);

      assertBn(
        await contributionToken.balanceOf(hatch.address),
        userContribution,
        HATCH_ERRORS.ERROR_CONTRIBUTION_NOT_MADE
      );

      assert.equal(getStateByKey(await hatch.state()), STATE_GOAL_REACHED, HATCH_ERRORS.ERROR_HATCH_GOAL_NOT_REACHED);
    });

    it("doesn't allow to create votes before the hatch is closed", async() => {
      const { dandelionVoting, contributionToken, tollgate } = userContext1;
      const voteScript = encodeCallScript([{
        to: dandelionVoting.address,
        calldata: encodeActCall('newVote(bytes,string,bool)', ['0x', '', false]),
      }])
      const [tollgateToken, tollgateFee] = await tollgate.forwardFee()
      assert.equal(tollgateToken, contributionToken.address)
      await contributionToken.approve(tollgate.address, tollgateFee)
      await assertRevert(tollgate.forward(voteScript), 'APP_AUTH_FAILED')
    })
  
    it("claims the impact hours for all contributors", async () => {
      const { hatch, impactHours, impactHoursToken, impactHoursClonedToken, hatchToken } = userContext1;

      const totalRaised = await hatch.totalRaised();
      const totalIH = await impactHoursClonedToken.totalSupply();
      const totalIHRewards = await calculateRewards(impactHours, totalRaised, totalIH);
      const expectedHatchTokens = await hatch.contributionToTokens(totalIHRewards);
      const hatchTokenTotalSupply = await hatchToken.totalSupply();

      await claimTokens(impactHours, impactHoursToken);

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
      const { hatch, impactHours } = await userContext1;

      const tx = await impactHours.closeHatch();
      await tx.wait();

      assert.equal(getStateByKey(await hatch.state()), STATE_CLOSED, HATCH_ERRORS.ERROR_HATCH_NOT_CLOSED);
    });
  
    it("distributes part of the funds to the funding pool", async () => {
      const { hatch, contributionToken } = userContext1;
      const fundingPool = await hatch.beneficiary();
      const fundingPoolBalance = totalContributed.mul(await hatch.fundingForBeneficiaryPct()).div(PPM);

      assertBn(
        await contributionToken.balanceOf(fundingPool),
        fundingPoolBalance,
        HATCH_ERRORS.ERROR_WRONG_BENEFICIARY_FUNDS_DISTRIBUTION
      );
    });

    it("distributes part of the funds to the reserve pool", async () => {
      const { hatch, contributionToken } = userContext1;
      const reservePool = await hatch.reserve();
      const reservePoolBalance = totalContributed.mul(PPM.sub(await hatch.fundingForBeneficiaryPct())).div(PPM);

      assertBn(
        await contributionToken.balanceOf(reservePool),
        reservePoolBalance,
        HATCH_ERRORS.ERROR_WRONG_RESEVE_FUNDS_DISTRIBUTION
      );
    });
  
    it("distributes part of the initial supply of tokens to funding pool ", async () => {
      const { hatch, hatchToken } = userContext1;
      const beneficiary = await hatch.beneficiary();
      const supplyOfferedPct = (await hatch.supplyOfferedPct()).toNumber();
      const hatchTokenOfferedAmount = (await hatchToken.totalSupply()).mul(PPM.sub(supplyOfferedPct)).div(PPM);

      assertBn(
        await hatchToken.balanceOf(beneficiary),
        hatchTokenOfferedAmount,
        HATCH_ERRORS.ERROR_WRONG_SUPPLY_OFFERED_DISTRIBUTION
      );
    });

    it("should not redeem tokens for non-contributors", async () => {
      const { redemptions } = userContext2;
      await assertRevert(redemptions.redeem(1), "REDEMPTIONS_INSUFFICIENT_BALANCE");
    });
  
    it("redeems contributor's token amount", async () => {
      const { hatch, hatchToken, contributionToken, redemptions, tokenManager } = userContext1;
      const previousContributionBalance = await contributionToken.balanceOf(USER1);
      const previousHatchBalance = await hatchToken.balanceOf(USER1)
      const previousRedeemableFunds = (await hatch.totalRaised()).mul(PPM.sub(await hatch.fundingForBeneficiaryPct())).div(PPM)
      const previousTotalHatchSupply = await hatchToken.totalSupply()

      const applyPct = (amount: BigNumber, pct: BigNumberish) => amount.mul(pct).div(100)

      increase(await hatch.vestingCompletePeriod())

      assertBn(await tokenManager.spendableBalanceOf(USER1), previousHatchBalance);
      const tx = await redemptions.redeem(applyPct(previousHatchBalance, 10));
      await tx.wait();

      const redeemedAmount = applyPct(previousHatchBalance, 10).mul(previousRedeemableFunds).div(previousTotalHatchSupply)

      const currentContributionBalance = await contributionToken.balanceOf(USER1)
      const currentHatchBalance = await hatchToken.balanceOf(USER1)

      assertBn(
        currentContributionBalance,
        previousContributionBalance.add(redeemedAmount),
        REDEMPTIONS_ERRORS.ERROR_CONTRIBUTION_NOT_REDEEM
      );

      assertBn(
        currentHatchBalance,
        applyPct(previousHatchBalance, 90),
        REDEMPTIONS_ERRORS.ERROR_REDEEMED_TOKENS_NOT_BURNED
      );
    });

    describe('migration', async() => {
      let newMigrationTools: MigrationTools, newVault1: Vault, newVault2: Vault, newToken: MiniMeToken
      before(async () => {
        ({migrationTools: newMigrationTools, vault1: newVault1, vault2: newVault2, token: newToken } = await newMigrableDao())
      })

      it("creates migration vote", async () => {
        const { dandelionVoting, contributionToken, migrationTools, tollgate } = userContext1;
        const migrateSignature = 'migrate(address,address,address,address,uint256,uint64,uint64,uint64)'
        const calldata = encodeActCall(migrateSignature, [newMigrationTools.address, newVault1.address, newVault2.address, contributionToken.address, 0, 0, 1, 1])
        const script = encodeCallScript([{
          to: migrationTools.address,
          calldata,
        }])
        const voteScript = encodeCallScript([{
          to: dandelionVoting.address,
          calldata: encodeActCall('newVote(bytes,string,bool)', [script, '', false]),
        }])
        const [tollgateToken, tollgateFee] = await tollgate.forwardFee()
        assert.equal(tollgateToken, contributionToken.address)
        await contributionToken.approve(tollgate.address, 0)
        await contributionToken.approve(tollgate.address, tollgateFee)
        await (await tollgate.forward(voteScript)).wait()
        const vote = await dandelionVoting.getVote(1)
        assert.strictEqual(vote.script, script)
        assert.isTrue(vote.open)
      })

      it("vote and wait 2 blocks", async() => {
        const { dandelionVoting, hatchToken } = userContext1;
        const vote = await dandelionVoting.getVote(1)
        const userBalance = await hatchToken.balanceOf(USER1)
        assert.equal(hatchToken.address, await dandelionVoting.token(), 'tokens do not match')
        assert.isTrue(userBalance.toString() != '0', 'User can not vote')
        assertBn(await hatchToken.balanceOfAt(USER1, vote.snapshotBlock), userBalance)
        assert.equal(await dandelionVoting.getVoterState(1, USER1), 0, 'user already voted')
        assert.isTrue((await dandelionVoting.canVote(1, USER1)))
        await dandelionVoting.vote(1, true)
        await increase(duration.seconds(5))
        await increase(duration.seconds(5))
        assert.isFalse((await dandelionVoting.getVote(1)).open)
        assert.isTrue(await dandelionVoting.canExecute(1))
      })

      it("executes", async() => {
        const { dandelionVoting, contributionToken, migrationTools } = userContext1;
        const vault1Funds = await contributionToken.balanceOf(await migrationTools.vault1())
        const vault2Funds = await contributionToken.balanceOf(await migrationTools.vault2())
        const allFunds = vault1Funds.add(vault2Funds)
        await dandelionVoting.executeVote(1)
        assertBn(await contributionToken.balanceOf(newVault1.address), BigNumber.from('0'))
        assertBn(await contributionToken.balanceOf(newVault2.address), allFunds)
      })

      it("convert tokens", async() => {
        const { hatchToken } = userContext1;
        const balance = await hatchToken.balanceOf(USER1)
        await newMigrationTools.claimFor(USER1)
        await assertBn(await newToken.balanceOf(USER1), balance)
      })
    })
  });

  context("When min goal is reached", async () => {
    let minGoalContribution: BigNumber;

    before(async () => {
      await useSnapshot();

      const { hatch } = userContext1;
      let tx: ContractTransaction;
      minGoalContribution = await hatch.minGoal();

      tx = await hatch.open();
      await tx.wait();
    });

    it("hatch state is goal reached", async () => {
      const { hatch, contributionToken } = userContext1;

      await contributeToHatch(hatch, contributionToken, minGoalContribution);

      await increase(await hatch.period());

      assert.equal(getStateByKey(await hatch.state()), STATE_GOAL_REACHED, HATCH_ERRORS.ERROR_HATCH_GOAL_NOT_REACHED);
    });
  });

  context("When min goal is not reached", async () => {
    let contributionAmount: BigNumber;

    before(async () => {
      await useSnapshot();

      const { hatch: h1, contributionToken: ct1 } = userContext1;
      const { hatch: h2, contributionToken: ct2 } = userContext2;
      let tx: ContractTransaction;

      await (await h1.open()).wait();

      contributionAmount = (await h1.minGoal()).div(3);

      await contributeToHatch(h1, ct1, contributionAmount);
      await contributeToHatch(h2, ct2, contributionAmount);

      await increase(await h1.period());
    });

    it("hatch state is refunding", async () => {
      const { hatch } = userContext1;
      assert.equal(getStateByKey(await hatch.state()), STATE_REFUNDING);
    });

    it("gives the refund amount to contributor", async () => {
      const { hatch, contributionToken, hatchToken, tokenManager } = userContext1;

      const previousBalance1 = await contributionToken.balanceOf(USER1)
      const previousBalance2 = await contributionToken.balanceOf(USER2)

      assertBn(await hatchToken.balanceOf(USER1), await hatch.contributionToTokens(contributionAmount))
      assert.equal(tokenManager.address, await hatchToken.controller())

      await(await hatch.refund(USER1, 0)).wait();
      await(await hatch.refund(USER2, 0)).wait();

      assertBn(
        await contributionToken.balanceOf(USER1),
        previousBalance1.add(contributionAmount),
        HATCH_ERRORS.ERROR_CONTRIBUTOR_NOT_REFUNDED
      );

      assertBn(
        await contributionToken.balanceOf(USER2),
        previousBalance2.add(contributionAmount),
        HATCH_ERRORS.ERROR_CONTRIBUTOR_NOT_REFUNDED
      );
    });

    it("Burns the hatch tokens once contributor gets refunded", async () => {
      const { hatchToken } = userContext1;
      assertBn(await hatchToken.balanceOf(USER1), BigNumber.from(0), HATCH_ERRORS.ERROR_HATCH_TOKENS_NOT_BURNED);
      assertBn(await hatchToken.balanceOf(USER2), BigNumber.from(0), HATCH_ERRORS.ERROR_HATCH_TOKENS_NOT_BURNED);
    });
  });
});
