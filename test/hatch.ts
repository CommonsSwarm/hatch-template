import { Signer } from "@ethersproject/abstract-signer";
import { ethers } from "hardhat";
import { use, expect } from "chai";
import { solidity } from "ethereum-waffle";
import fetch from 'node-fetch';

import newHatch, { COLLATERAL_TOKEN, SCORE_TOKEN } from "../scripts/new-hatch";
import { impersonateAddress } from "../helpers/rpc";
import { Kernel, IHatch, IImpactHours, ERC20 } from "../typechain";
import { BigNumber } from "@ethersproject/bignumber";

use(solidity);

const CONTRIBUTORS_PROCESSED_PER_TRANSACTION = 10

async function getContributors() {
  return fetch(
    'https://api.thegraph.com/subgraphs/name/aragon/aragon-tokens-xdai',
    {
      method: 'POST',
      body: JSON.stringify({
        query: `
          {
            tokenHolders(first: 1000 where : { tokenAddress: "${SCORE_TOKEN}"}) {
              address
            }
          }
        `})
    }
  )
  .then(res => res.json())
  .then(res => res.data.tokenHolders.map(({ address }) => address))
}

const HATCH_USER = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";

describe.only("Hatch Template", function () {
  let signers: Signer[];
  let hatchUser: Signer;
  let dao: Kernel;
  let daoAddress: string;
  let hatchAddress: string;

  before(async () => {
    [daoAddress, hatchAddress] = await newHatch();
    dao = (await ethers.getContractAt("Kernel", daoAddress)) as Kernel;
    hatchUser = await impersonateAddress(HATCH_USER);
    signers = await ethers.getSigners();
  });

  describe("Test Hatch Flow", async function () {
    it("Get Hatch Address", async function () {

      const hatch = (await ethers.getContractAt("IHatch", hatchAddress, hatchUser)) as IHatch;

      await hatch.open();

      const token = (await ethers.getContractAt(
        "@aragon/os/contracts/lib/token/ERC20.sol:ERC20",
        COLLATERAL_TOKEN,
        hatchUser
      )) as ERC20;

      const value = BigNumber.from("1000").mul(String(1e18));

      await token.approve(hatch.address, value);

      await hatch.contribute(value, { gasLimit: 2000000 });

      const impactHours = (await ethers.getContractAt("IImpactHours", hatchAddress, hatchUser)) as IImpactHours;

      const contributors = await getContributors()
      const total = Math.ceil(contributors.length / CONTRIBUTORS_PROCESSED_PER_TRANSACTION);
      let counter = 1;
      for (let i = 0; i < contributors.length; i += CONTRIBUTORS_PROCESSED_PER_TRANSACTION) {
        const tx = await impactHours.claimReward(
          contributors.slice(i, i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION),
          { gasLimit: 2000000 }
        );
        const txReceipt = await tx.wait();
        console.log(`Impact hours Txs: ${counter++} of ${total}. Claimed ${i + 1} to ${Math.min(i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION, contributors.length)} impact hours. Gas fee: ${txReceipt.gasUsed}`)
      }
      const txClose = await hatch.close({ gasLimit: 2000000 });
      const txCloseReceipt = await txClose.wait();
      console.log(`Hatch closed successfully. Gas used: ${txCloseReceipt.gasUsed}`)
    });
  });
});
