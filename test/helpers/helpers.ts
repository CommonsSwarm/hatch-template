import { ethers } from "hardhat";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import fetch from "node-fetch";

import { ERC20, IHatch, IImpactHours, Kernel, MiniMeToken } from "../../typechain/index";

export async function getAddress(selectedFilter: string, contract: Contract, transactionHash: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const filter = contract.filters[selectedFilter]();

    contract.on(filter, (contractAddress, event) => {
      if (event.transactionHash === transactionHash) {
        contract.removeAllListeners(filter);
        resolve(contractAddress);
      }
    });
  });
}

export async function getAppAddresses(dao: Kernel, ensNames: string[]): Promise<string[]> {
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
}

export const calculateRewards = async (
  impactHours: IImpactHours,
  totalRaised: BigNumber,
  balance: BigNumber
): Promise<BigNumber> => {
  const maxRate = await impactHours.maxRate();
  const expectedRaise = await impactHours.expectedRaise();

  return balance.mul(maxRate).div(String(1e18)).mul(totalRaised).div(totalRaised.add(expectedRaise));
};

export const getContributors = async (tokenAddress: string): Promise<string[]> => {
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
};

export async function claimRewards(impactHours: IImpactHours, impactHoursToken: MiniMeToken): Promise<void> {
  const CONTRIBUTORS_PROCESSED_PER_TRANSACTION = 10;
  const contributors = await getContributors(impactHoursToken.address);
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

export const log = (message: string, spaces = 4): void => console.log(`${" ".repeat(spaces)}⚡ ${message}`);
