import { Signer } from "@ethersproject/abstract-signer";
import hre, { ethers } from "hardhat";
import { use, expect } from "chai";
import { solidity } from "ethereum-waffle";

import newHatch from "../scripts/new-hatch";
import { impersonateAddress } from "../helpers/rpc";
import { HatchTemplate, Kernel } from "../typechain";

use(solidity);

async function getAppAddress(dao: Kernel, ensName: string) {
  const appNamesapace = await dao.APP_ADDR_NAMESPACE();
  const appId = ethers.utils.namehash(ensName);
  return dao.getApp(appNamesapace, appId);
}

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
      // How to reproduce ACL Oracle
      // hatch.open()
      // aprove() al token tDAI
      // hatch.contribute() // add funds (tDAI) usign HATCH_USER
      // impactHours.claimRewards()
      // hatch.close()
    });
  });
});
