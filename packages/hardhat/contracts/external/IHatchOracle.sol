pragma solidity ^0.4.24;

contract IHatchOracle {

    bytes32 public constant SET_SCORE_TOKEN_ROLE = keccak256("SET_SCORE_TOKEN_ROLE");
    bytes32 public constant SET_RATIO_ROLE = keccak256("SET_RATIO_ROLE");

    function initialize(address _score, uint256 _ratio, address _hatch) external;
}
