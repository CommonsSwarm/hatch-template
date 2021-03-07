pragma solidity 0.4.24;

import "@aragon/os/contracts/apm/APMNamehash.sol";


contract AppIdsXDai is APMNamehash {
    bytes32 public constant DANDELION_VOTING_APP_ID = 0x40a80c4b4050993512df39c802adec62dafeb1f0586cc15f4d34bda9c47ba468; // gardens-dandelion-voting.open.aragonpm.eth
    bytes32 public constant REDEMPTIONS_APP_ID = 0x743bd419d5c9061290b181b19e114f36e9cc9ddb42b4e54fc811edb22eb85e9d;
    bytes32 public constant TOLLGATE_APP_ID = 0x0d321283289e70165ef6db7f11fc62c74a7d39dac3ee148428c4f9e3d74c6d61; // tollgate.open.aragonpm.eth
    bytes32 public constant HOOKED_TOKEN_MANAGER_APP_ID = 0x26bb91b115bf14acbdc18d75042e165321eceeb3d10d852386576bbd0ec11519; // gardens-token-manager.open.aragonpm.eth
    bytes32 public constant HATCH_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("marketplace-hatch"))); //  marketplace-hatch.open.aragonpm.eth
    bytes32 public constant HATCH_ORACLE_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("hatch-oracle"))); //  hatch-oracle.open.aragonpm.eth
    bytes32 public constant IMPACT_HOURS_ID = keccak256(abi.encodePacked(apmNamehash("open"), keccak256("impact-hours-beta"))); //  impact-hours.open.aragonpm.eth
}
