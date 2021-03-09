import { Signer } from "@ethersproject/abstract-signer";
import { ethers } from "hardhat";
import { use, expect } from "chai";
import { solidity } from "ethereum-waffle";

import newHatch from "../scripts/new-hatch";
import { impersonateAddress } from "../helpers/rpc";
import { Kernel, IHatch, ERC20 } from "../typechain";
import { BigNumber } from "@ethersproject/bignumber";

use(solidity);

async function getAppAddress(dao: Kernel, ensName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const inputAppId = ethers.utils.namehash(ensName);

    dao.on("NewAppProxy", (proxy, isUpgradeable, appId, event) => {
      if (inputAppId === appId) {
        dao.removeAllListeners("NewAppProxy");
        resolve(proxy);
      }
    });
  });
}

// Collateral Token is used to pay contributors and held in the bonding curve reserve
const COLLATERAL_TOKEN = "0xfb8f60246d56905866e12443ec0836ebfb3e1f2e"; // tDAI

const HATCH_USER = "0xDc2aDfA800a1ffA16078Ef8C1F251D50DcDa1065";
const HATCH_ENS = "marketplace-hatch.open.aragonpm.eth";

describe.only("Hatch Template", function () {
  let signers: Signer[];
  let hatchUser: Signer;
  let dao: Kernel;
  let daoAddress: string;

  before(async () => {
    daoAddress = await newHatch();
    dao = (await ethers.getContractAt("Kernel", daoAddress)) as Kernel;
    hatchUser = await impersonateAddress(HATCH_USER);
    signers = await ethers.getSigners();
  });

  describe("Test Hatch Flow", async function () {
    it("Get Hatch Address", async function () {
      const hatchAddress = await getAppAddress(dao, HATCH_ENS);

      const hatch = (await ethers.getContractAt("IHatch", hatchAddress, hatchUser)) as IHatch;

      await hatch.open();

      const token = (await ethers.getContractAt(
        "@aragon/os/contracts/lib/token/ERC20.sol:ERC20",
        COLLATERAL_TOKEN,
        hatchUser
      )) as ERC20;

      const value = BigNumber.from("10").mul(String(1e18));

      await token.approve(hatch.address, value);

      const tx = await hatch.contribute(value, { gasLimit: 2000000 });

      // TODO:
      // impactHours.claimRewards()
      // hatch.close()
    });
  });
});
