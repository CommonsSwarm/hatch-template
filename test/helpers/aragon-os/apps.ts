import { ContractReceipt } from "@ethersproject/contracts";
import { Address } from "hardhat-deploy/dist/types";
import { Kernel } from "../../../typechain";


export function getInstalledApps(dao: Kernel, receipt: ContractReceipt, appIds: string | string[]) {
  appIds = Array.isArray(appIds) ? appIds : appIds ? [appIds] : null
  
  return receipt.logs.map(log => dao.interface.parseLog(log)).filter(event => event.name === 'NewAppProxy')
    .filter((event) =>
      Array.isArray(appIds) ? appIds.includes(event.args.appId) : true
    )
    .map((event) => event.args.proxy)
}

export function getInstalledApp(dao: Kernel, receipt: ContractReceipt, appId: string) {
  return getInstalledApps(dao, receipt, appId)[0]
}

export async function installNewApp(dao: Kernel, appId: string, baseAppAddress: Address) {
  const receipt = await (await dao['newAppInstance(bytes32,address,bytes,bool)'](
    appId, // appId
    baseAppAddress, // appBase
    '0x', // initializePayload
    false, // setDefault
  )).wait()

  // Find the deployed proxy address in the tx logs
  return getInstalledApp(dao, receipt, appId)
}