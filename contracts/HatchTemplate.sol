pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";
import "@1hive/apps-dandelion-voting/contracts/DandelionVoting.sol";
import "@1hive/apps-redemptions/contracts/Redemptions.sol";
import "@1hive/apps-token-manager/contracts/HookedTokenManager.sol";
import {ITollgate as Tollgate} from "./external/ITollgate.sol";
import {IHatch as Hatch} from "./external/IHatch.sol";
import {IHatchOracle as HatchOracle} from "./external/IHatchOracle.sol";
import {IImpactHours as ImpactHours} from "./external/IImpactHours.sol";
import "./appIds/AppIdsXDai.sol";

contract HatchTemplate is BaseTemplate, AppIdsXDai {
    using SafeMath64 for uint64;

    string constant private ERROR_MISSING_MEMBERS = "MISSING_MEMBERS";
    string constant private ERROR_TOKENS_STAKES_MISMATCH = "TOKENS_STAKE_MISMATCH";
    string constant private ERROR_BAD_VOTE_SETTINGS = "BAD_SETTINGS";
    string constant private ERROR_NO_CACHE = "NO_CACHE";
    string constant private ERROR_NO_COLLATERAL = "NO_COLLATERAL";
    string constant private ERROR_NO_TOLLGATE_TOKEN = "NO_TOLLGATE_TOKEN";

    bool private constant TOKEN_TRANSFERABLE = false;
    uint8 private constant TOKEN_DECIMALS = uint8(18);
    uint256 private constant TOKEN_MAX_PER_ACCOUNT = uint256(-1);
    uint64 private constant DEFAULT_FINANCE_PERIOD = uint64(30 days);
    address private constant ANY_ENTITY = address(-1);
    uint256 private constant ONE_HUNDRED_PERCENT = 1e6;
    uint8 private constant ORACLE_PARAM_ID = 203;
    enum Op { NONE, EQ, NEQ, GT, LT, GTE, LTE, RET, NOT, AND, OR, XOR, IF_ELSE }

    struct StoredAddresses {
        Kernel dao;
        ACL acl;
        DandelionVoting dandelionVoting;
        Agent fundingPoolAgent;
        HookedTokenManager hookedTokenManager;
        address collateralToken;
        Agent reserveAgent;
        Hatch hatch;
        HatchOracle hatchOracle;
        ImpactHours impactHours;
    }

    mapping(address => StoredAddresses) internal senderStoredAddresses;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    // New DAO functions //

    /**
    * @dev Create the DAO and initialise the basic apps necessary for gardens
    * @param _voteTokenName The name for the token used by share holders in the organization
    * @param _voteTokenSymbol The symbol for the token used by share holders in the organization
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration, voteBufferBlocks, voteExecutionDelayBlocks] to set up the voting app of the organization
    * @param _collateralToken Token distributed by conviction voting and used as collateral in fundraising
    */
    function createDaoTxOne(
        string _voteTokenName,
        string _voteTokenSymbol,
        uint64[5] _votingSettings,
        address _collateralToken
    )
        public
    {
        require(_votingSettings.length == 5, ERROR_BAD_VOTE_SETTINGS);

        (Kernel dao, ACL acl) = _createDAO();
        MiniMeToken voteToken = _createToken(_voteTokenName, _voteTokenSymbol, TOKEN_DECIMALS);
        Agent fundingPoolAgent = _installDefaultAgentApp(dao);

        DandelionVoting dandelionVoting = _installDandelionVotingApp(dao, voteToken, _votingSettings);
        HookedTokenManager hookedTokenManager = _installHookedTokenManagerApp(dao, voteToken, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);

        _createAgentPermissions(acl, Agent(fundingPoolAgent), dandelionVoting, address(dandelionVoting));

        _createEvmScriptsRegistryPermissions(acl, dandelionVoting, address(dandelionVoting));
        _createCustomVotingPermissions(acl, dandelionVoting, hookedTokenManager);

        _storeAddressesTxOne(dao, acl, dandelionVoting, fundingPoolAgent, hookedTokenManager, _collateralToken);
    }

    /**
    * @dev Add and initialise fundraising apps
    * @param _minGoal Hatch min goal in wei
    * @param _maxGoal Hatch max goal in wei
    * @param _period Hatch length in seconds
    * @param _exchangeRate Hatch exchange rate in PPM
    * @param _vestingCliffPeriod Vesting cliff length for hatch bought tokens in seconds
    * @param _vestingCompletePeriod Vesting complete length for hatch bought tokens in seconds
    * @param _hatchTributePct Percent of raised hatch funds sent to the organization in PPM
    * @param _openDate The time the hatch starts, requires manual opening if set to 0
    * @param _ihToken Impact hours token address
    * @param _maxIHRate Max theoretical rate per impact hour in Collateral_token per IH
    * @param _expectedRaisePerIH How much will we need to raise to reach 1/2 of the MAX_IH_RATE divided by total IH
    */
    function createDaoTxTwo(
        uint256 _minGoal,
        uint256 _maxGoal,
        uint64 _period,
        uint256 _exchangeRate,
        uint64 _vestingCliffPeriod,
        uint64 _vestingCompletePeriod,
        uint256 _hatchTributePct,
        uint64 _openDate,
        address _ihToken,
        uint256 _maxIHRate,
        uint256 _expectedRaisePerIH
    )
        public
    {
        require(senderStoredAddresses[msg.sender].collateralToken != address(0), ERROR_NO_CACHE);

        Hatch _hatch = _installHatch(
            _minGoal,
            _maxGoal,
            _period,
            _exchangeRate,
            _vestingCliffPeriod,
            _vestingCompletePeriod,
            _hatchTributePct,
            _openDate
        );

        senderStoredAddresses[msg.sender].impactHours = _installImpactHours(senderStoredAddresses[msg.sender].dao, _ihToken, _hatch, _maxIHRate, _expectedRaisePerIH);

        _createHookedTokenManagerPermissions();
        senderStoredAddresses[msg.sender].acl.createPermission(ANY_ENTITY, senderStoredAddresses[msg.sender].impactHours, senderStoredAddresses[msg.sender].impactHours.CLAIM_ROLE(), address(this));
    }

    /**
    * @dev Add and initialise tollgate, redemptions and conviction voting or finance apps
    * @param _id Unique Aragon DAO ID
    * @param _redeemableTokens Array of initially redeemable tokens
    * @param _tollgateFeeToken The token used to pay the tollgate fee
    * @param _tollgateFeeAmount The tollgate fee amount
    */
    function createDaoTxThree(
        string _id,
        address[] _redeemableTokens,
        ERC20 _tollgateFeeToken,
        uint256 _tollgateFeeAmount,
        address _scoreToken,
        uint256 _hatchOracleRatio
    )
        public
    {
        require(_tollgateFeeToken != address(0), ERROR_NO_TOLLGATE_TOKEN);
        require(senderStoredAddresses[msg.sender].dao != address(0), ERROR_NO_CACHE);
        require(senderStoredAddresses[msg.sender].reserveAgent != address(0), ERROR_NO_CACHE);

        (,
        ACL acl,
        DandelionVoting dandelionVoting,
        Agent fundingPoolAgent,
        HookedTokenManager hookedTokenManager,
        address collateralToken) = _getStoredAddressesTxOne();

        Tollgate tollgate = _installTollgate(senderStoredAddresses[msg.sender].dao, _tollgateFeeToken, _tollgateFeeAmount, address(fundingPoolAgent));
        _createTollgatePermissions(acl, tollgate, dandelionVoting);

        _createPermissionForTemplate(acl, hookedTokenManager, hookedTokenManager.SET_HOOK_ROLE());
        hookedTokenManager.registerHook(dandelionVoting);
        _removePermissionFromTemplate(acl, hookedTokenManager, hookedTokenManager.SET_HOOK_ROLE());

        senderStoredAddresses[msg.sender].hatchOracle = _installHatchOracleApp(senderStoredAddresses[msg.sender].dao, _scoreToken, _hatchOracleRatio, senderStoredAddresses[msg.sender].hatch);
        _createHatchPermissions();
        _removePermissionFromTemplate(senderStoredAddresses[msg.sender].acl, senderStoredAddresses[msg.sender].impactHours, senderStoredAddresses[msg.sender].impactHours.CLAIM_ROLE());

        Redemptions redemptions = _installRedemptions(senderStoredAddresses[msg.sender].dao, senderStoredAddresses[msg.sender].reserveAgent, hookedTokenManager, _redeemableTokens);
        _createRedemptionsPermissions(acl, redemptions, dandelionVoting);
        _createAgentPermissions(acl, senderStoredAddresses[msg.sender].reserveAgent, dandelionVoting, address(dandelionVoting));
        acl.createPermission(redemptions, senderStoredAddresses[msg.sender].reserveAgent, senderStoredAddresses[msg.sender].reserveAgent.TRANSFER_ROLE(), address(dandelionVoting));

        _validateId(_id);

        _transferRootPermissionsFromTemplateAndFinalizeDAO(senderStoredAddresses[msg.sender].dao, dandelionVoting);
        _registerID(_id, senderStoredAddresses[msg.sender].dao);
        _deleteStoredContracts();
    }

    // App installation/setup functions //

    function _installHookedTokenManagerApp(
        Kernel _dao,
        MiniMeToken _token,
        bool _transferable,
        uint256 _maxAccountTokens
    )
        internal returns (HookedTokenManager)
    {
        HookedTokenManager hookedTokenManager = HookedTokenManager(_installDefaultApp(_dao, HOOKED_TOKEN_MANAGER_APP_ID));
        _token.changeController(hookedTokenManager);
        hookedTokenManager.initialize(_token, _transferable, _maxAccountTokens);
        return hookedTokenManager;
    }

    function _installHatchOracleApp(Kernel _dao, address _scoreToken, uint256 _oracleRatio, address _hatch)
        internal returns(HatchOracle)
    {
        HatchOracle hatchOracle = HatchOracle(_installNonDefaultApp(_dao, HATCH_ORACLE_ID));
        hatchOracle.initialize(_scoreToken, _oracleRatio, _hatch);
        return hatchOracle;
    }

    function _installImpactHours(Kernel _dao, address _impactHoursToken, address _hatch, uint256 _maxRate, uint256 _expectedRaisePerIH)
        internal returns(ImpactHours)
    {
        ImpactHours ih = ImpactHours(_installNonDefaultApp(_dao, IMPACT_HOURS_ID));
        ih.initialize(_impactHoursToken, _hatch, _maxRate, _expectedRaisePerIH);
        return ih;
    }

    function _installDandelionVotingApp(Kernel _dao, MiniMeToken _voteToken, uint64[5] _votingSettings)
        internal returns (DandelionVoting)
    {
        DandelionVoting dandelionVoting = DandelionVoting(_installNonDefaultApp(_dao, DANDELION_VOTING_APP_ID));
        dandelionVoting.initialize(_voteToken, _votingSettings[0], _votingSettings[1], _votingSettings[2],
            _votingSettings[3], _votingSettings[4]);
        return dandelionVoting;
    }

    function _installTollgate(Kernel _dao, ERC20 _tollgateFeeToken, uint256 _tollgateFeeAmount, address _tollgateFeeDestination)
        internal returns (Tollgate)
    {
        Tollgate tollgate = Tollgate(_installNonDefaultApp(_dao, TOLLGATE_APP_ID));
        tollgate.initialize(_tollgateFeeToken, _tollgateFeeAmount, _tollgateFeeDestination);
        return tollgate;
    }

    function _installRedemptions(Kernel _dao, Agent _agent, HookedTokenManager _hookedTokenManager, address[] _redeemableTokens)
        internal returns (Redemptions)
    {
        Redemptions redemptions = Redemptions(_installNonDefaultApp(_dao, REDEMPTIONS_APP_ID));
        redemptions.initialize(_agent, TokenManager(_hookedTokenManager), _redeemableTokens);
        return redemptions;
    }

    function _installHatch(
        uint256 _minGoal,
        uint256 _maxGoal,
        uint64  _period,
        uint256 _exchangeRate,
        uint64  _vestingCliffPeriod,
        uint64  _vestingCompletePeriod,
        uint256 _hatchTributePct,
        uint64  _openDate
    )
        internal returns (Hatch)
    {
        
        (Kernel dao,,,,, address collateralToken) = _getStoredAddressesTxOne();
        Agent reserveAgent = _installNonDefaultAgentApp(dao);
        Hatch hatch = Hatch(_installNonDefaultApp(dao, HATCH_ID));

        _storeAddressesTxTwo(reserveAgent, hatch);

        _initializeHatch(
            _minGoal,
            _maxGoal,
            _period,
            _exchangeRate,
            _vestingCliffPeriod,
            _vestingCompletePeriod,
            _hatchTributePct,
            _openDate,
            collateralToken
        );

        return hatch;
    }

    function _initializeHatch(
        uint256 _minGoal,
        uint256 _maxGoal,
        uint64  _period,
        uint256 _exchangeRate,
        uint64  _vestingCliffPeriod,
        uint64  _vestingCompletePeriod,
        uint256 _hatchTributePct,
        uint64  _openDate,
        address _collateralToken
    )
        internal
    {
        // Accessing deployed contracts directly due to stack too deep error.
        senderStoredAddresses[msg.sender].hatch.initialize(
            TokenManager(senderStoredAddresses[msg.sender].hookedTokenManager),
            senderStoredAddresses[msg.sender].reserveAgent,
            senderStoredAddresses[msg.sender].fundingPoolAgent,
            _collateralToken,
            _minGoal,
            _maxGoal,
            _period,
            _exchangeRate,
            _vestingCliffPeriod,
            _vestingCompletePeriod,
            ONE_HUNDRED_PERCENT, // do not mint tokens for funding pool
            _hatchTributePct,
            _openDate
        );
    }

    // Permission setting functions //

    function _createCustomVotingPermissions(ACL _acl, DandelionVoting _dandelionVoting, HookedTokenManager _hookedTokenManager)
        internal
    {
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_QUORUM_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_SUPPORT_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_BUFFER_BLOCKS_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_EXECUTION_DELAY_ROLE(), _dandelionVoting);
    }

    function _createTollgatePermissions(ACL _acl, Tollgate _tollgate, DandelionVoting _dandelionVoting) internal {
        (,,DandelionVoting dandelionVoting,,,) = _getStoredAddressesTxOne();
        _acl.createPermission(_dandelionVoting, _tollgate, _tollgate.CHANGE_AMOUNT_ROLE(), dandelionVoting);
        _acl.createPermission(_dandelionVoting, _tollgate, _tollgate.CHANGE_DESTINATION_ROLE(), dandelionVoting);
        _acl.createPermission(_tollgate, _dandelionVoting, _dandelionVoting.CREATE_VOTES_ROLE(), dandelionVoting);
    }

    function _createRedemptionsPermissions(ACL _acl, Redemptions _redemptions, DandelionVoting _dandelionVoting)
        internal
    {
        (,,DandelionVoting dandelionVoting,,,) = _getStoredAddressesTxOne();
        _acl.createPermission(ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), address(this));
        _setOracle(_acl, ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), _dandelionVoting);
        _acl.setPermissionManager(dandelionVoting, _redemptions, _redemptions.REDEEM_ROLE());

        _acl.createPermission(_dandelionVoting, _redemptions, _redemptions.ADD_TOKEN_ROLE(), dandelionVoting);
        _acl.createPermission(_dandelionVoting, _redemptions, _redemptions.REMOVE_TOKEN_ROLE(), dandelionVoting);
    }

    function _createHookedTokenManagerPermissions() internal {
        (, ACL acl, DandelionVoting dandelionVoting,, HookedTokenManager hookedTokenManager,) = _getStoredAddressesTxOne();
        (, Hatch hatch) = _getStoredAddressesTxTwo();
        ImpactHours impactHours = senderStoredAddresses[msg.sender].impactHours;

        acl.createPermission(impactHours, hookedTokenManager, hookedTokenManager.MINT_ROLE(), dandelionVoting);
        acl.createPermission(hatch, hookedTokenManager, hookedTokenManager.ISSUE_ROLE(), dandelionVoting);
        acl.createPermission(hatch, hookedTokenManager, hookedTokenManager.ASSIGN_ROLE(), dandelionVoting);
        acl.createPermission(hatch, hookedTokenManager, hookedTokenManager.REVOKE_VESTINGS_ROLE(), dandelionVoting);
        acl.createPermission(hatch, hookedTokenManager, hookedTokenManager.BURN_ROLE(), dandelionVoting);
    }

    function _createHatchPermissions() internal {
        (, ACL acl, DandelionVoting dandelionVoting,,,) = _getStoredAddressesTxOne();
        (Agent reserveAgent, Hatch hatch) = _getStoredAddressesTxTwo();

        acl.createPermission(ANY_ENTITY, hatch, hatch.OPEN_ROLE(), dandelionVoting);
        acl.createPermission(ANY_ENTITY, hatch, hatch.CONTRIBUTE_ROLE(), this);
        acl.createPermission(ANY_ENTITY, hatch, hatch.CLOSE_ROLE(), this);
        _setOracle(acl, ANY_ENTITY, hatch, hatch.CONTRIBUTE_ROLE(), senderStoredAddresses[msg.sender].hatchOracle);
        _setOracle(acl, ANY_ENTITY, hatch, hatch.CLOSE_ROLE(), senderStoredAddresses[msg.sender].impactHours);
        acl.setPermissionManager(dandelionVoting, hatch, hatch.CONTRIBUTE_ROLE());
        acl.setPermissionManager(dandelionVoting, hatch, hatch.CLOSE_ROLE());
    }

    // Temporary Storage functions //

    function _storeAddressesTxOne(Kernel _dao, ACL _acl, DandelionVoting _dandelionVoting, Agent _agent, HookedTokenManager _hookedTokenManager, address _collateralToken)
        internal
    {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        addresses.dao = _dao;
        addresses.acl = _acl;
        addresses.dandelionVoting = _dandelionVoting;
        addresses.fundingPoolAgent = _agent;
        addresses.hookedTokenManager = _hookedTokenManager;
        addresses.collateralToken = _collateralToken;
    }

    function _getStoredAddressesTxOne() internal returns (Kernel, ACL, DandelionVoting, Agent, HookedTokenManager, address) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return (
            addresses.dao,
            addresses.acl,
            addresses.dandelionVoting,
            addresses.fundingPoolAgent,
            addresses.hookedTokenManager,
            addresses.collateralToken
        );
    }

    function _storeAddressesTxTwo(Agent _reserve, Hatch _hatch)
        internal
    {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        addresses.reserveAgent = _reserve;
        addresses.hatch = _hatch;
    }

    function _getStoredAddressesTxTwo() internal returns (Agent, Hatch) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return (
            addresses.reserveAgent,
            addresses.hatch
        );
    }

    function _deleteStoredContracts() internal {
        delete senderStoredAddresses[msg.sender];
    }

    // Oracle permissions with params functions //

    function _setOracle(ACL _acl, address _who, address _where, bytes32 _what, address _oracle) private {
        uint256[] memory params = new uint256[](1);
        params[0] = _paramsTo256(ORACLE_PARAM_ID, uint8(Op.EQ), uint240(_oracle));

        _acl.grantPermissionP(_who, _where, _what, params);
    }

    function _paramsTo256(uint8 _id,uint8 _op, uint240 _value) private returns (uint256) {
        return (uint256(_id) << 248) + (uint256(_op) << 240) + _value;
    }
}
