pragma solidity ^0.4.24;

contract IHatch {

    bytes32 public constant OPEN_ROLE = keccak256("OPEN_ROLE");
    bytes32 public constant CONTRIBUTE_ROLE = keccak256("CONTRIBUTE_ROLE");
    bytes32 public constant CLOSE_ROLE = keccak256("CLOSE_ROLE");

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
}