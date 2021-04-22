pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";
import "@1hive/apps-dandelion-voting/contracts/DandelionVoting.sol";
import "@1hive/apps-redemptions/contracts/Redemptions.sol";
import "@commonsswarm/migration-tools/contracts/MigrationTools.sol";
import {ITollgate as Tollgate} from "./external/ITollgate.sol";
import {IHatch as Hatch} from "./external/IHatch.sol";
import {IHatchOracle as HatchOracle} from "./external/IHatchOracle.sol";
import {IImpactHours as ImpactHours} from "./external/IImpactHours.sol";
import "./appIds/AppIdsXDai.sol";

contract HatchTemplate is BaseTemplate, TimeHelpers, AppIdsXDai {
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
    uint8 private constant TIMESTAMP_PARAM_ID = 201;
    enum Op { NONE, EQ, NEQ, GT, LT, GTE, LTE, RET, NOT, AND, OR, XOR, IF_ELSE }

    struct StoredAddresses {
        Kernel dao;
        ACL acl;
        DandelionVoting dandelionVoting;
        Agent fundingPoolAgent;
        TokenManager tokenManager;
        address collateralToken;
        Agent reserveAgent;
        Hatch hatch;
        HatchOracle hatchOracle;
        ImpactHours impactHours;
        Tollgate tollgate;
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
    * @dev Create the DAO and initialise the basic apps.
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
        TokenManager tokenManager = _installTokenManagerApp(dao, voteToken, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);

        _createAgentPermissions(acl, Agent(fundingPoolAgent), dandelionVoting, address(dandelionVoting));

        _createEvmScriptsRegistryPermissions(acl, dandelionVoting, address(dandelionVoting));
        _createCustomVotingPermissions(acl, dandelionVoting);

        _storeAddressesTxOne(dao, acl, dandelionVoting, fundingPoolAgent, tokenManager, _collateralToken);
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
    * @param _hatchOpenDate The time the hatch starts, requires manual opening if set to 0
    * @param _ihToken Impact hours token address
    * @param _maxIHRate Max theoretical rate per impact hour in Collateral_token per IH
    * @param _expectedRaise How much will we need to raise to reach 1/2 of the MAX_IH_RATE 
    */
    function createDaoTxTwo(
        uint256 _minGoal,
        uint256 _maxGoal,
        uint64 _period,
        uint256 _exchangeRate,
        uint64 _vestingCliffPeriod,
        uint64 _vestingCompletePeriod,
        uint256 _hatchTributePct,
        uint64 _hatchOpenDate,
        address _ihToken,
        uint256 _maxIHRate,
        uint256 _expectedRaise
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
            _hatchOpenDate
        );

        senderStoredAddresses[msg.sender].impactHours = _installImpactHours(senderStoredAddresses[msg.sender].dao, _ihToken, _hatch, _maxIHRate, _expectedRaise);
        senderStoredAddresses[msg.sender].acl.createPermission(ANY_ENTITY, senderStoredAddresses[msg.sender].impactHours, senderStoredAddresses[msg.sender].impactHours.CLOSE_HATCH_ROLE(), address(this));
    }

    /**
    * @dev Add and initialise tollgate, redemptions and conviction voting apps
    * @param _id Unique Aragon DAO ID
    * @param _redeemableTokens Array of initially redeemable tokens
    * @param _tollgateFeeToken The token used to pay the tollgate fee
    * @param _tollgateFeeAmount The tollgate fee amount
    * @param _scoreToken Token for Hatch Oracle used to determine contributor allowance
    * @param _hatchOracleRatio Hatch Oracle ratio used to determine contributor allowance
    * @param _voteOpenAfterPeriod Time period in which vote creation will not be allowed
    */
    function createDaoTxThree(
        string _id,
        address[] _redeemableTokens,
        ERC20 _tollgateFeeToken,
        uint256 _tollgateFeeAmount,
        address _scoreToken,
        uint256 _hatchOracleRatio,
        uint64 _voteOpenAfterPeriod
    )
        public
    {
        require(_tollgateFeeToken != address(0), ERROR_NO_TOLLGATE_TOKEN);
        require(senderStoredAddresses[msg.sender].dao != address(0), ERROR_NO_CACHE);
        require(senderStoredAddresses[msg.sender].reserveAgent != address(0), ERROR_NO_CACHE);

        (Kernel dao,
        ACL acl,
        DandelionVoting dandelionVoting,
        ,
        TokenManager tokenManager,
        ) = _getStoredAddressesTxOne();

        senderStoredAddresses[msg.sender].tollgate = _installTollgate(dao, _tollgateFeeToken, _tollgateFeeAmount, address(senderStoredAddresses[msg.sender].fundingPoolAgent));
        _createTollgatePermissions(acl, senderStoredAddresses[msg.sender].tollgate, dandelionVoting, getTimestamp64().add(_voteOpenAfterPeriod));

        senderStoredAddresses[msg.sender].hatchOracle = _installHatchOracleApp(dao, _scoreToken, _hatchOracleRatio, senderStoredAddresses[msg.sender].hatch);
        _createHatchPermissions();

        Redemptions redemptions = _installRedemptions(dao, senderStoredAddresses[msg.sender].reserveAgent, tokenManager, _redeemableTokens);
        _createRedemptionsPermissions(acl, redemptions, dandelionVoting);
        _createAgentPermissions(acl, senderStoredAddresses[msg.sender].reserveAgent, dandelionVoting, address(dandelionVoting));
        
        MigrationTools migrationTools = _installMigrationTools(dao, tokenManager, senderStoredAddresses[msg.sender].reserveAgent, senderStoredAddresses[msg.sender].fundingPoolAgent);
        acl.createPermission(dandelionVoting, migrationTools, migrationTools.MIGRATE_ROLE(), dandelionVoting);

        _createTokenManagerPermissions(redemptions);

        // Grant permission for redemptions and migration tools to tranfer on reserveAgent
        acl.createPermission(redemptions, senderStoredAddresses[msg.sender].reserveAgent, senderStoredAddresses[msg.sender].reserveAgent.TRANSFER_ROLE(), this);
        acl.grantPermission(migrationTools, senderStoredAddresses[msg.sender].reserveAgent, senderStoredAddresses[msg.sender].reserveAgent.TRANSFER_ROLE());
        acl.setPermissionManager(dandelionVoting, senderStoredAddresses[msg.sender].reserveAgent, senderStoredAddresses[msg.sender].reserveAgent.TRANSFER_ROLE());

        // Grant permission for migration tools to transfer on funding pool
        acl.createPermission(migrationTools, senderStoredAddresses[msg.sender].fundingPoolAgent, senderStoredAddresses[msg.sender].fundingPoolAgent.TRANSFER_ROLE(), dandelionVoting);

        _validateId(_id);

        _transferRootPermissionsFromTemplateAndFinalizeDAO(senderStoredAddresses[msg.sender].dao, dandelionVoting);
        _registerID(_id, senderStoredAddresses[msg.sender].dao);
        _deleteStoredContracts();
    }

    // App installation/setup functions //

    function _installHatchOracleApp(Kernel _dao, address _scoreToken, uint256 _oracleRatio, address _hatch)
        internal returns(HatchOracle)
    {
        HatchOracle hatchOracle = HatchOracle(_installNonDefaultApp(_dao, HATCH_ORACLE_APP_ID));
        hatchOracle.initialize(_scoreToken, _oracleRatio, _hatch);
        return hatchOracle;
    }

    function _installImpactHours(Kernel _dao, address _impactHoursToken, address _hatch, uint256 _maxRate, uint256 _expectedRaise)
        internal returns(ImpactHours)
    {
        ImpactHours ih = ImpactHours(_installNonDefaultApp(_dao, IMPACT_HOURS_APP_ID));
        ih.initialize(_impactHoursToken, _hatch, _maxRate, _expectedRaise);
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

    function _installRedemptions(Kernel _dao, Agent _agent, TokenManager _tokenManager, address[] _redeemableTokens)
        internal returns (Redemptions)
    {
        Redemptions redemptions = Redemptions(_installNonDefaultApp(_dao, REDEMPTIONS_APP_ID));
        redemptions.initialize(_agent, TokenManager(_tokenManager), _redeemableTokens);
        return redemptions;
    }

    function _installMigrationTools(Kernel _dao, TokenManager _tokenManager, Vault _vault1, Vault _vault2) internal returns (MigrationTools) {
        MigrationTools migrationTools = MigrationTools(_installNonDefaultApp(_dao, MIGRATION_TOOLS_APP_ID));
        migrationTools.initialize(TokenManager(address(_tokenManager)), _vault1, _vault2);
        return migrationTools;
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
        Hatch hatch = Hatch(_installNonDefaultApp(dao, HATCH_APP_ID));

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
            TokenManager(senderStoredAddresses[msg.sender].tokenManager),
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

    function _createCustomVotingPermissions(ACL _acl, DandelionVoting _dandelionVoting)
        internal
    {
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_QUORUM_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_SUPPORT_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_BUFFER_BLOCKS_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_EXECUTION_DELAY_ROLE(), _dandelionVoting);
    }

    function _createTollgatePermissions(ACL _acl, Tollgate _tollgate, DandelionVoting _dandelionVoting, uint64 _voteOpenDate) internal {
        _acl.createPermission(_dandelionVoting, _tollgate, _tollgate.CHANGE_AMOUNT_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _tollgate, _tollgate.CHANGE_DESTINATION_ROLE(), _dandelionVoting);
        _acl.createPermission(_tollgate, _dandelionVoting, _dandelionVoting.CREATE_VOTES_ROLE(), this);
        _setTimelock(_acl, _tollgate, _dandelionVoting, _dandelionVoting.CREATE_VOTES_ROLE(), _voteOpenDate);
        _acl.setPermissionManager(_dandelionVoting, _dandelionVoting, _dandelionVoting.CREATE_VOTES_ROLE());
    }

    function _createRedemptionsPermissions(ACL _acl, Redemptions _redemptions, DandelionVoting _dandelionVoting)
        internal
    {
        _acl.createPermission(ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), address(this));
        _setOracle(_acl, ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), _dandelionVoting);
        _acl.setPermissionManager(_dandelionVoting, _redemptions, _redemptions.REDEEM_ROLE());

        _acl.createPermission(_dandelionVoting, _redemptions, _redemptions.ADD_TOKEN_ROLE(), _dandelionVoting);
        _acl.createPermission(_dandelionVoting, _redemptions, _redemptions.REMOVE_TOKEN_ROLE(), _dandelionVoting);
    }

    function _createMigrationToolsPermissions(ACL _acl, MigrationTools _migrationTools, DandelionVoting _dandelionVoting) internal {
        _acl.createPermission(ANY_ENTITY, _migrationTools, _migrationTools.MIGRATE_ROLE(), _dandelionVoting);
    }

    function _createTokenManagerPermissions(Redemptions _redemptions) internal {
        (, ACL acl, DandelionVoting dandelionVoting,, TokenManager tokenManager,) = _getStoredAddressesTxOne();
        (, Hatch hatch, ImpactHours impactHours) = _getStoredAddressesTxTwo();

        acl.createPermission(impactHours, tokenManager, tokenManager.MINT_ROLE(), dandelionVoting);
        acl.createPermission(hatch, tokenManager, tokenManager.ISSUE_ROLE(), dandelionVoting);
        acl.createPermission(hatch, tokenManager, tokenManager.ASSIGN_ROLE(), dandelionVoting);
        acl.createPermission(hatch, tokenManager, tokenManager.REVOKE_VESTINGS_ROLE(), dandelionVoting);
        acl.createPermission(hatch, tokenManager, tokenManager.BURN_ROLE(), this);
        acl.grantPermission(_redemptions, tokenManager, tokenManager.BURN_ROLE());
        acl.setPermissionManager(dandelionVoting, tokenManager, tokenManager.BURN_ROLE());
    }

    function _createHatchPermissions() internal {
        (, ACL acl, DandelionVoting dandelionVoting,,,) = _getStoredAddressesTxOne();
        (, Hatch hatch, ImpactHours impactHours) = _getStoredAddressesTxTwo();

        acl.createPermission(ANY_ENTITY, hatch, hatch.OPEN_ROLE(), dandelionVoting);
        acl.createPermission(ANY_ENTITY, hatch, hatch.CONTRIBUTE_ROLE(), this);
        acl.createPermission(impactHours, hatch, hatch.CLOSE_ROLE(), dandelionVoting);
        _setOracle(acl, ANY_ENTITY, hatch, hatch.CONTRIBUTE_ROLE(), senderStoredAddresses[msg.sender].hatchOracle);
        acl.setPermissionManager(dandelionVoting, hatch, hatch.CONTRIBUTE_ROLE());
    }

    // Temporary Storage functions //

    function _storeAddressesTxOne(Kernel _dao, ACL _acl, DandelionVoting _dandelionVoting, Agent _agent, TokenManager _tokenManager, address _collateralToken)
        internal
    {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        addresses.dao = _dao;
        addresses.acl = _acl;
        addresses.dandelionVoting = _dandelionVoting;
        addresses.fundingPoolAgent = _agent;
        addresses.tokenManager = _tokenManager;
        addresses.collateralToken = _collateralToken;
    }

    function _getStoredAddressesTxOne() internal view returns (Kernel, ACL, DandelionVoting, Agent, TokenManager, address) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return (
            addresses.dao,
            addresses.acl,
            addresses.dandelionVoting,
            addresses.fundingPoolAgent,
            addresses.tokenManager,
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

    function _getStoredAddressesTxTwo() internal view returns (Agent, Hatch, ImpactHours) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return (
            addresses.reserveAgent,
            addresses.hatch,
            addresses.impactHours
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

    function _setTimelock(ACL _acl, address _who, address _where, bytes32 _what, uint64 _date) private {
        uint256[] memory params = new uint256[](1);
        params[0] = _paramsTo256(TIMESTAMP_PARAM_ID, uint8(Op.GTE), uint240(_date));
        _acl.grantPermissionP(_who, _where, _what, params);
    }
    function _paramsTo256(uint8 _id,uint8 _op, uint240 _value) private pure returns (uint256) {
        return (uint256(_id) << 248) + (uint256(_op) << 240) + _value;
    }
}
