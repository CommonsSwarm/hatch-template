pragma solidity ^0.4.24;

import "@aragon/os/contracts/lib/token/ERC20.sol";

contract IHatch {

    bytes32 public constant OPEN_ROLE = keccak256("OPEN_ROLE");
    bytes32 public constant CONTRIBUTE_ROLE = keccak256("CONTRIBUTE_ROLE");
    bytes32 public constant CLOSE_ROLE = keccak256("CLOSE_ROLE");

    ERC20                                           public token;

    address                                         public reserve;
    address                                         public beneficiary;
    address                                         public contributionToken;

    uint256                                         public minGoal;
    uint256                                         public maxGoal;
    uint64                                          public period;
    uint256                                         public exchangeRate;
    uint64                                          public vestingCliffPeriod;
    uint64                                          public vestingCompletePeriod;
    uint256                                         public supplyOfferedPct;
    uint256                                         public fundingForBeneficiaryPct;
    uint64                                          public openDate;

    bool                                            public isClosed;
    uint64                                          public vestingCliffDate;
    uint64                                          public vestingCompleteDate;
    uint256                                         public totalRaised;

    function initialize(
        address                      _tokenManager,
        address                      _reserve,
        address                      _beneficiary,
        address                      _contributionToken,
        uint256                      _minGoal,
        uint256                      _maxGoal,
        uint64                       _period,
        uint256                      _exchangeRate,
        uint64                       _vestingCliffPeriod,
        uint64                       _vestingCompletePeriod,
        uint256                      _supplyOfferedPct,
        uint256                      _fundingForBeneficiaryPct,
        uint64                       _openDate
    ) external;

    function open() external;

    function contribute(uint256 _value) external;

    function close() external;
    function state() external view returns (uint8);
    function contributionToTokens(uint256 _value) public view returns (uint256);

}
