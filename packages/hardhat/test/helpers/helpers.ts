import { BigNumber } from "ethers";
import fetch from "node-fetch";

import { IImpactHours } from "../../typechain/index";

export const calculateRewards = async (
  impactHours: IImpactHours,
  totalRaised: BigNumber,
  balance: BigNumber
): Promise<BigNumber> => {
  const maxRate = await impactHours.maxRate();
  const expectedRaise = await impactHours.expectedRaise();

  return balance.mul(maxRate).div(String(1e18)).mul(totalRaised).div(totalRaised.add(expectedRaise));
};

export const getContributors = async (tokenAddress) => {
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

export const log = (message, spaces = 4) => console.log(`${" ".repeat(spaces)}⚡ ${message}`);
