
import { ethers } from "hardhat";
const { hash: namehash } = require('eth-ens-namehash')

import { ZERO_ADDRESS } from '../helpers/helpers'
import { ANY_ENTITY, newDao, installNewApp } from '../helpers/aragon-os'
import { MiniMeToken, TokenManager, MigrationTools, Vault } from "../../typechain";

const TOKEN_MANAGER_APP_ID = namehash(`token-manager.aragonpm.test`)
const MIGRATION_TOOLS_APP_ID = namehash(`migration-tools.aragonpm.test`)
const VAULT_APP_ID = namehash(`vault.aragonpm.eth`)

export const newMigrableDao = async () => {
  const root = (await ethers.getSigners())[0].address
  const { dao, acl } = await newDao(root)
  const tokenManagerBase = await (await ethers.getContractFactory('TokenManager')).deploy()
  const migrationToolsBase = await (await ethers.getContractFactory('MigrationTools')).deploy()
  const vaultBase = await (await ethers.getContractFactory('Vault')).deploy()

  const tokenManager = (await ethers.getContractAt('TokenManager', await installNewApp(dao, TOKEN_MANAGER_APP_ID, tokenManagerBase.address))) as TokenManager
  const migrationTools = (await ethers.getContractAt('MigrationTools', await installNewApp(dao, MIGRATION_TOOLS_APP_ID, migrationToolsBase.address))) as MigrationTools
  const vault1 = (await ethers.getContractAt('Vault', await installNewApp(dao, VAULT_APP_ID, vaultBase.address))) as Vault
  const vault2 = (await ethers.getContractAt('Vault', await installNewApp(dao, VAULT_APP_ID, vaultBase.address))) as Vault

  const token = await (await ethers.getContractFactory('MiniMeToken')).deploy(ZERO_ADDRESS, ZERO_ADDRESS, 0, 'n', 0, 'n', true) as MiniMeToken

  await token.changeController(tokenManager.address)
  await tokenManager.initialize(token.address, true, 0)
  await vault1.initialize()
  await vault2.initialize()
  await migrationTools.initialize(tokenManager.address, vault1.address, vault2.address)

  const PREPARE_CLAIMS_ROLE = await migrationToolsBase.PREPARE_CLAIMS_ROLE()
  const ISSUE_ROLE = await tokenManagerBase.ISSUE_ROLE()
  const ASSIGN_ROLE = await tokenManagerBase.ASSIGN_ROLE()

  await acl.createPermission(
    migrationTools.address,
    tokenManager.address,
    ISSUE_ROLE,
    root
  )
  await acl.createPermission(
    migrationTools.address,
    tokenManager.address,
    ASSIGN_ROLE,
    root
  )
  await acl.createPermission(
    ANY_ENTITY,
    migrationTools.address,
    PREPARE_CLAIMS_ROLE,
    root
  )
  return { dao, acl, tokenManager, token, vault1, vault2, migrationTools }
}