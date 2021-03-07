pragma solidity ^0.4.24;

contract IImpactHours {

    bytes32 public constant CLAIM_ROLE = keccak256("CLAIM_ROLE");
    function initialize(address _token, address _hatch, uint256 _maxRate, uint256 _expectedRaisePerIH) external;
    function claimReward(address[] _contributors) external;
    function canPerform(address, address, bytes32, uint256[]) external view;
}
