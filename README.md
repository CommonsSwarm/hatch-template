Hatch Template
==============

The Hatch template is intended to be used as the basis for a Commons  governed organization. Its main purpose is to raise funds in order to hatch a Commons and perform a vote on a "Commons Upgrade". It will also reward previous contributors with hatch tokens and allow them to "rage quit" before the migration is performed.

## Usage

### Deploy template

```shell
npx hardhat deploy --network xdai
```

### Deploy new hatch

```shell
npx hardhat run scripts/new-hatch.ts --network xdai
```

### Test
```shell
yarn run chain
yarn test --network localhost
```

## Apps
* Token Manager: It controls the hatch token.
* Dandelion Voting: It controls almost everything in the DAO. Hatch tokenholders use this application to collectively decide how to use the funds within the DAO and can control the smart contract system that makes up the DAO.
* Tollgate: controls the cost of creating a dandelion voting proposal.
* Hatch: controls the initial funds of the DAO, it receives funds and mints hatch tokens.
* Hatch oracle: controls how much funds the hatch can receive from a specific address. The sending address needs to have a minimum amount of membership score tokens in order to send to the Hatch.
* Impact Hours: determines how to distribute hatch tokens to previous community contributors.
* Agents: Redeemable and Non-redeemable where the funds are stored.
* Redemptions: enables hatch tokenholders to redeem their tokens for the tokens in the redeemable agent on a pro rata basis.
* Migration tools: enables the migration of the funds to a new DAO and clone and lock hatch tokens into new tokens.

## Permissions
|        App        |       Permission       |    Grantee    |    Manager   |
|-----------------|----------------------|-------------|------------|
|       Kernel      |       APP_MANAGER      |  Dandelion Voting  | Dandelion Voting  |
|        ACL        |   CREATE_PERMISSIONS   |  Dandelion Voting  | Dandelion Voting  |
| EVMScriptRegistry |    REGISTRY_MANAGER    |  Dandelion Voting  | Dandelion Voting  |
| EVMScriptRegistry |  REGISTRY_ADD_EXECUTOR |  Dandelion Voting  | Dandelion Voting  |
|      Agent 1      |         TRANSFER        |  Redemptions | Dandelion Voting  |
|      Agent 1      |         TRANSFER        |  Migration Tools | Dandelion Voting  |
|      Agent 1      |         EXECUTE        |  Dandelion Voting  | Dandelion Voting  |
|      Agent 1      |       RUN_SCRIPT       |  Dandelion Voting  | Dandelion Voting  |
|      Agent 2      |         TRANSFER        |  Migration Tools | Dandelion Voting  |
|      Agent 2      |         EXECUTE        |  Dandelion Voting  | Dandelion Voting  |
|      Agent 2      |       RUN_SCRIPT       |  Dandelion Voting  | Dandelion Voting  |
|       Hatch       |          OPEN          |  ANY ACCOUNT  | Dandelion Voting  |
|       Hatch       |          CLOSE        |  Impact Hours  | Dandelion Voting  |
|       Hatch       |       CONTRIBUTE       |  ANY ACCOUNT  | Dandelion Voting  |
|    Impact Hours   |    CLOSE_HATCH    |  ANY ACCOUNT  | Dandelion Voting  |
|  Migration Tools | MIGRATE | Dandelion Voting  | Dandelion Voting  |
|    Redemptions    |         REDEEM         |  ANY ACCOUNT  | Dandelion Voting  |
|    Redemptions    |        ADD_TOKEN       |  Dandelion Voting  | Dandelion Voting  |
|    Redemptions    |      REMOVE_TOKEN      |  Dandelion Voting  | Dandelion Voting  |
|       Tokens      |          MINT          |     Hatch     | Dandelion Voting  |
|       Tokens      |          BURN          |     Hatch     | Dandelion Voting  |
|       Tokens      |          BURN          |     Redemptions     | Dandelion Voting  |
|       Tokens      |          ISSUE         |     Hatch     | Dandelion Voting  |
|       Tokens      |         ASSIGN         |     Hatch     | Dandelion Voting  |
|       Tokens      |     REVOKE_VESTINGS    |     Hatch     | Dandelion Voting  |
|      Tollgate     |   CHANGE_DESTINATION   |  Dandelion Voting  | Dandelion Voting  |
|      Tollgate     |      CHANGE_AMOUNT     |  Dandelion Voting  | Dandelion Voting  |
|    Dandelion Voting    |      CREATE_VOTES      |    Tollgate   | Dandelion Voting  |
|    Dandelion Voting    |     MODIFY_SUPPORT     |  Dandelion Voting  | Dandelion Voting  |
|    Dandelion Voting    |      MODIFY_QUORUM     | Dandelion Voting   | Dandelion Voting  |
|    Dandelion Voting    |  MODIFY_BUFFER_BLOCKS  |  Dandelion Voting  | Dandelion Voting  |
|    Dandelion Voting    | MODIFY_EXECUTION_DELAY |  Dandelion Voting  | Dandelion Voting  |