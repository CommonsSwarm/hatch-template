pragma solidity 0.4.24;

import "@aragon/os/contracts/apm/APMNamehash.sol";


contract AppIdsXDai is APMNamehash {
    bytes32 public constant DANDELION_VOTING_APP_ID = keccak256(abi.encodePacked(apmNamehash("1hive"), keccak256("dandelion-voting"))); // dandelion-voting.1hive.aragonpm.eth
    bytes32 public constant REDEMPTIONS_APP_ID = keccak256(abi.encodePacked(apmNamehash("1hive"), keccak256("redemptions"))); // redemptions.1hive.aragonpm.eth
    bytes32 public constant TOLLGATE_APP_ID = keccak256(abi.encodePacked(apmNamehash("1hive"), keccak256("tollgate"))); // tollgate.1hive.aragonpm.eth
    bytes32 public constant HATCH_APP_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("marketplace-hatch"))); //  marketplace-hatch.open.aragonpm.eth
    bytes32 public constant HATCH_ORACLE_APP_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("hatch-oracle"))); //  hatch-oracle.open.aragonpm.eth
    bytes32 public constant IMPACT_HOURS_APP_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("impact-hours-beta"))); //  impact-hours.open.aragonpm.eth
    bytes32 public constant MIGRATION_TOOLS_APP_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("migration-tools-beta"))); //  migration-tools-beta.open.aragonpm.eth
}
