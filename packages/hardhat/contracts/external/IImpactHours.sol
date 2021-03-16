pragma solidity ^0.4.24;

import "@aragon/os/contracts/common/SafeERC20.sol";
import "@aragon/os/contracts/lib/token/ERC20.sol";


contract IImpactHours {
    using SafeERC20 for ERC20;

    ERC20 public token;
    uint256 public maxRate;
    uint256 public expectedRaise;

    bytes32 public constant CLOSE_ROLE = keccak256("CLOSE_ROLE");

    function initialize(address _token, address _hatch, uint256 _maxRate, uint256 _expectedRaise) external;
    function claimReward(address[] _contributors) external;
    function closeHatch() external;
}
