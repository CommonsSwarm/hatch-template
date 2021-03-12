import { Signer } from "@ethersproject/abstract-signer";
import { ethers } from "hardhat";
import { use, expect } from "chai";
import { solidity } from "ethereum-waffle";
import fetch from "node-fetch";

import newHatch from "../scripts/new-hatch";
import { impersonateAddress } from "../helpers/rpc";
import { Kernel, IHatch, IImpactHours, ERC20, MiniMeToken } from "../typechain";
import { BigNumber } from "@ethersproject/bignumber";

use(solidity);

// There are multiple ERC20 paths. We need to specify one.
const ERC20Path = "@aragon/os/contracts/lib/token/ERC20.sol:ERC20";
const HATCH_USER = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";
const CONTRIBUTORS_PROCESSED_PER_TRANSACTION = 10;
const TOKEN_DECIMALS = 1e18;

async function getContributors(tokenAddress) {
  return fetch("https://api.thegraph.com/subgraphs/name/aragon/aragon-tokens-xdai", {
    method: "POST",
    body: JSON.stringify({
      query: `
          {
            tokenHolders(first: 1000 where : { tokenAddress: "${tokenAddress}"}) {
              address
            }
          }
        `,
    }),
  })
    .then((res) => res.json())
    .then((res) => res.data.tokenHolders.map(({ address }) => address));
}

describe.only("Hatch Template", function () {
  let hatchUser: Signer;
  let dao: Kernel;
  let hatch: IHatch;
  let impactHours: IImpactHours;
  let contributionToken: ERC20;
  let ihTokenAddress: string;

  before(async () => {
    const [daoAddress, hatchAddress, impactHoursAddress] = await newHatch();

    console.log("DAO created using Hatch Template");

    hatchUser = await impersonateAddress(HATCH_USER);
    dao = (await ethers.getContractAt("Kernel", daoAddress)) as Kernel;
    hatch = (await ethers.getContractAt("IHatch", hatchAddress, hatchUser)) as IHatch;
    impactHours = (await ethers.getContractAt("IImpactHours", impactHoursAddress, hatchUser)) as IImpactHours;
    const contributionTokenAddress = await hatch.contributionToken();
    contributionToken = (await ethers.getContractAt(ERC20Path, contributionTokenAddress, hatchUser)) as ERC20;
    const ihClonedTokenAddress = await impactHours.token();
    const ihClonedToken = (await ethers.getContractAt("MiniMeToken", ihClonedTokenAddress, hatchUser)) as MiniMeToken;
    ihTokenAddress = await ihClonedToken.parentToken();
  });

  describe("Test General Flow", async function () {
    it("Test Hatch Flow when max goal is reached", async function () {
      let tx,
        txReceipt,
        totalGasUsed = BigNumber.from("0");

      tx = await hatch.open();
      txReceipt = await tx.wait();

      console.log(`Hatch Opened. Gas used: ${txReceipt.gasUsed}`);
      totalGasUsed = totalGasUsed.add(txReceipt.gasUsed);

      const contributionAmount = BigNumber.from("1000").mul(String(TOKEN_DECIMALS));

      tx = await contributionToken.approve(hatch.address, contributionAmount);
      txReceipt = await tx.wait();

      console.log(`Contribution amount approved. Gas used: ${txReceipt.gasUsed}`);
      totalGasUsed = totalGasUsed.add(txReceipt.gasUsed);

      tx = await hatch.contribute(contributionAmount);
      txReceipt = await tx.wait();

      console.log(`Contribution amount ${contributionAmount} made by ${HATCH_USER}. Gas used: ${txReceipt.gasUsed}`);
      totalGasUsed = totalGasUsed.add(txReceipt.gasUsed);

      const contributors = await getContributors(ihTokenAddress);

      console.log("IH token holders fetched");

      const total = Math.ceil(contributors.length / CONTRIBUTORS_PROCESSED_PER_TRANSACTION);
      let counter = 1;

      for (let i = 0; i < contributors.length; i += CONTRIBUTORS_PROCESSED_PER_TRANSACTION) {
        tx = await impactHours.claimReward(contributors.slice(i, i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION), {
          gasPrice: 1,
        });
        txReceipt = await tx.wait();

        console.log(
          `Rewards claimed for IH token holders ${i + 1} to ${Math.min(
            i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION,
            contributors.length
          )}. Tx ${counter++} of ${total}. Gas fee: ${txReceipt.gasUsed}`
        );
        totalGasUsed = totalGasUsed.add(txReceipt.gasUsed);
      }

      tx = await hatch.close();
      txReceipt = await tx.wait();

      console.log(`Hatch closed. Gas used: ${txReceipt.gasUsed}`);
      totalGasUsed = totalGasUsed.add(txReceipt.gasUsed);

      console.log(`Total gas used: ${totalGasUsed.toString()}`);
    });
  });
});
