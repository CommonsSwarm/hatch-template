import { BigNumber } from "@ethersproject/bignumber";
import { ContractTransaction, Overrides } from "@ethersproject/contracts";
import fetch from "node-fetch";

import { ERC20, IHatch, IImpactHours, MigrationTools, MiniMeToken } from "../../typechain/index";

export const ZERO_ADDRESS = '0x' + '0'.repeat(40) // 0x0000...0000

export const log = (message: string, spaces = 4): void => console.log(`${" ".repeat(spaces)}⚡ ${message}`);

export const now = (): BigNumber => {
  return BigNumber.from(Math.floor(new Date().getTime() / 1000));
};

export const contributeToHatch = async (hatch: IHatch, contributionToken: ERC20, amount: BigNumber): Promise<void> => {
  let tx: ContractTransaction;

  tx = await contributionToken.approve(hatch.address, amount);
  await tx.wait();
  tx = await hatch.contribute(amount);
  await tx.wait();
};

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
  // return fetch("https://api.thegraph.com/subgraphs/name/1hive/aragon-tokens-xdai", {
  //   method: "POST",
  //   body: JSON.stringify({
  //     query: `
  //         {
  //           tokenHolders(first: 1000 where : { tokenAddress: "${tokenAddress.toLowerCase()}"}) {
  //             address
  //           }
  //         }
  //       `,
  //   }),
  // })
  //   .then((res) => res.json())
  //   .then((res) => res.data.tokenHolders.map(({ address }) => address));
  // return fetch(`https://blockscout.com/xdai/mainnet/api?module=token&action=getTokenHolders&contractaddress=${tokenAddress}&offset=200`)
  //   .then(res => res.json())
  //   .then(res => res.result.map(({ address }) => address))
  const res = await import('./data.json')
  return Promise.resolve(res.result.map(({ address }) => address))
};

export const claimTokens = async (claimableContract: IImpactHours | MigrationTools, token: MiniMeToken, overrides?: Overrides): Promise<void> => {
  const claim = claimableContract.claimReward// || claimableContract.claimForMany 
  const CONTRIBUTORS_PROCESSED_PER_TRANSACTION = 10;
  const contributors = await getContributors(token.address);
  const total = Math.ceil(contributors.length / CONTRIBUTORS_PROCESSED_PER_TRANSACTION);
  let counter = 1;
  let tx;

  for (let i = 0; i < contributors.length; i += CONTRIBUTORS_PROCESSED_PER_TRANSACTION) {
    tx = await claim(contributors.slice(i, i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION), overrides ?? {});

    await tx.wait();

    log(
      `Tx ${counter++} of ${total}: Claimed for token holders ${i + 1} to ${Math.min(
        i + CONTRIBUTORS_PROCESSED_PER_TRANSACTION,
        contributors.length
      )}.`,
      10
    );
  }
};
