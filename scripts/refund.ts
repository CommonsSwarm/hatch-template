import { ethers } from "hardhat";
import fetch from "node-fetch";
import ora from "ora";
import { IHatch } from "../typechain";

const hatchAddress = "0xae1cf34bf101fe05c6c4467efdc9ff06c9eb2fcd";

let spinner = ora();

// Types
interface Contributor {
  account: string;
  contributions: Contribution[];
}
interface Contribution {
  vestedPurchaseId: string;
  value: string;
}

const fetchContributors = async (hatchAddress: string): Promise<Contributor[]> => {
  return fetch("https://api.thegraph.com/subgraphs/name/commonsswarm/aragon-hatch-xdai-staging", {
    method: "POST",
    body: JSON.stringify({
      query: `
      {
        contributors(first: 1000, where: { hatchConfig: "${hatchAddress.toLowerCase()}"}) {
          account
          contributions {
            vestedPurchaseId
          }
        }
      }
    `,
    }),
  })
    .then((res) => res.json())
    .then((res) => res.data.contributors);
};

export default async function main(log = console.log): Promise<void> {
  const hatch = (await ethers.getContractAt("IHatch", hatchAddress)) as IHatch;
  const contributors = (await fetchContributors(hatch.address)).filter(({ contributions }) => contributions.length);
  let currentContributorMsg: string;

  log("Refunding hatch contributors: ");

  for (let i = 0; i < contributors.length; i++) {
    const { account, contributions } = contributors[i];
    currentContributorMsg = `Contributor ${account} (${i + 1} of ${contributors.length})`;

    for (let j = 0; j < contributions.length; j++) {
      const { vestedPurchaseId } = contributions[j];

      spinner = spinner.start(
        `${currentContributorMsg}: Refunding contribution ${j + 1} of ${contributions.length}...`
      );

      await (await hatch.refund(account, vestedPurchaseId)).wait(2);
    }

    spinner.succeed(
      `${currentContributorMsg}: ${contributions.length} contribution${contributions.length > 1 ? "s" : ""} refunded`
    );
  }

  spinner.stopAndPersist({ text: "All hatch tokens refunded!", symbol: "🙌" });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    spinner.fail();
    console.error(error);
    process.exit(1);
  });
