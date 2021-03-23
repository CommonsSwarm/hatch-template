import { ethers } from "hardhat";
import { Kernel, ACL, EVMScriptRegistryFactory, DAOFactory } from "../../../typechain";
import { Contract, ContractReceipt } from "@ethersproject/contracts";
import { Address } from "hardhat-deploy/dist/types";

async function getAddress(selectedFilter: string, receipt: ContractReceipt, contract: Contract): Promise<string> {
  return new Promise((resolve, reject) => {
    const filter = contract.filters[selectedFilter]();

    contract.on(filter, (contractAddress, event) => {
      if (event.transactionHash === receipt.transactionHash) {
        contract.removeAllListeners(filter);
        resolve(contractAddress);
      }
    });
  });
}

export async function newDao(rootAccount: Address) {

  const daoFactory = await newDaoFactory()

  // Create a DAO instance
  const daoReceipt = await (await daoFactory.newDAO(rootAccount)).wait()
  const daoAddress = await getAddress('DeployDAO', daoReceipt, daoFactory)
  const dao = (await ethers.getContractAt('Kernel', daoAddress)) as Kernel

  // Grant the rootAccount address permission to install apps in the DAO
  const acl = (await ethers.getContractAt('ACL', await dao.acl())) as ACL
  const APP_MANAGER_ROLE = await dao.APP_MANAGER_ROLE()
  await acl.createPermission(
    rootAccount,
    dao.address,
    APP_MANAGER_ROLE,
    rootAccount
  )

  return { dao, acl }
}

export async function newDaoFactory() {
  const kernelBase = await (await ethers.getContractFactory('Kernel')).deploy(true) as Kernel
  const aclBase = await (await ethers.getContractFactory('ACL')).deploy() as ACL
  const registryFactory = await (await ethers.getContractFactory('EVMScriptRegistryFactory')).deploy() as EVMScriptRegistryFactory

  return await (await ethers.getContractFactory('DAOFactory')).deploy(
    kernelBase.address,
    aclBase.address,
    registryFactory.address
  ) as DAOFactory
}
