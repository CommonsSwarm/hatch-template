pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";
import "@1hive/apps-dandelion-voting/contracts/DandelionVoting.sol";
import "@1hive/apps-redemptions/contracts/Redemptions.sol";
import "@1hive/apps-token-manager/contracts/HookedTokenManager.sol";
import "@ablack/fundraising-bancor-formula/contracts/BancorFormula.sol";
import "@ablack/fundraising-aragon-fundraising/contracts/AragonFundraisingController.sol";
import "@ablack/fundraising-presale/contracts/Presale.sol";
import {IConvictionVoting as ConvictionVoting} from "./external/IConvictionVoting.sol";
import {ITollgate as Tollgate} from "./external/ITollgate.sol";
import {IBancorMarketMaker as MarketMaker} from "./external/IBancorMarketMaker.sol";
import {IAragonFundraisingController as Controller} from "./external/IAragonFundraisingController.sol";
import {IHatchOracle as HatchOracle} from "./external/IHatchOracle.sol";
import "./appIds/AppIdsXDai.sol";

contract GardensTemplate is BaseTemplate, AppIdsXDai {
    using SafeMath64 for uint64;

    string constant private ERROR_MISSING_MEMBERS = "MISSING_MEMBERS";
    string constant private ERROR_TOKENS_STAKES_MISMATCH = "TOKENS_STAKE_MISMATCH";
    string constant private ERROR_BAD_VOTE_SETTINGS = "BAD_SETTINGS";
    string constant private ERROR_NO_CACHE = "NO_CACHE";
    string constant private ERROR_NO_COLLATERAL = "NO_COLLATERAL";
    string constant private ERROR_NO_TOLLGATE_TOKEN = "NO_TOLLGATE_TOKEN";

    bool private constant TOKEN_TRANSFERABLE = true;
    uint8 private constant TOKEN_DECIMALS = uint8(18);
    uint256 private constant TOKEN_MAX_PER_ACCOUNT = uint256(-1);
    uint64 private constant DEFAULT_FINANCE_PERIOD = uint64(30 days);
    address private constant ANY_ENTITY = address(-1);
    uint8 private constant ORACLE_PARAM_ID = 203;
    enum Op { NONE, EQ, NEQ, GT, LT, GTE, LTE, RET, NOT, AND, OR, XOR, IF_ELSE }

    struct StoredAddresses {
        Kernel dao;
        ACL acl;
        DandelionVoting dandelionVoting;
        Vault fundingPoolVault;
        HookedTokenManager hookedTokenManager;
        address permissionManager;
        address collateralToken;
        Vault reserveVault;
        Presale presale;
        MarketMaker marketMaker;
        Controller controller;
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
    * @param _useAgentAsVault Whether to use an Agent app or Vault app
    */
    function createDaoTxOne(
        string _voteTokenName,
        string _voteTokenSymbol,
        uint64[5] _votingSettings,
        bool _useAgentAsVault,
        address _permissionManager
    )
        public
    {
        require(_votingSettings.length == 5, ERROR_BAD_VOTE_SETTINGS);

        (Kernel dao, ACL acl) = _createDAO();
        MiniMeToken voteToken = _createToken(_voteTokenName, _voteTokenSymbol, TOKEN_DECIMALS);
        Vault fundingPoolVault = _useAgentAsVault ? _installDefaultAgentApp(dao) : _installVaultApp(dao);

        DandelionVoting dandelionVoting = _installDandelionVotingApp(dao, voteToken, _votingSettings);
        HookedTokenManager hookedTokenManager = _installHookedTokenManagerApp(dao, voteToken, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);

        if (_permissionManager == 0x0) {
            _permissionManager = address(dandelionVoting);
        }

        if (_useAgentAsVault) {
            _createAgentPermissions(acl, Agent(fundingPoolVault), dandelionVoting, _permissionManager);
        }
        _createEvmScriptsRegistryPermissions(acl, dandelionVoting, _permissionManager);
        _createCustomVotingPermissions(acl, dandelionVoting, hookedTokenManager);

        _storeAddressesTxOne(dao, acl, dandelionVoting, fundingPoolVault, hookedTokenManager, _permissionManager);
    }

    /**
    * @dev Add and initialise tollgate, redemptions and conviction voting or finance apps
    * @param _tollgateFeeToken The token used to pay the tollgate fee
    * @param _tollgateFeeAmount The tollgate fee amount
    * @param _redeemableTokens Array of initially redeemable tokens
    * @param _convictionSettings Array with delay, maxRatio, and weight
    * @param _collateralToken Token distributed by conviction voting and used as collateral in fundraising
    */
    function createDaoTxTwo(
        ERC20 _tollgateFeeToken,
        uint256 _tollgateFeeAmount,
        address[] _redeemableTokens,
        uint256[4] _convictionSettings,
        address _collateralToken
    )
        public
    {
        require(_tollgateFeeToken != address(0), ERROR_NO_TOLLGATE_TOKEN);
        require(_collateralToken != address(0), ERROR_NO_COLLATERAL);
        require(senderStoredAddresses[msg.sender].dao != address(0), ERROR_NO_CACHE);

        (,
        ACL acl,
        DandelionVoting dandelionVoting,
        Vault fundingPoolVault,
        HookedTokenManager hookedTokenManager,
        address permissionManager) = _getStoredAddressesTxOne();

        Tollgate tollgate = _installTollgate(senderStoredAddresses[msg.sender].dao, _tollgateFeeToken, _tollgateFeeAmount, address(fundingPoolVault));
        _createTollgatePermissions(acl, tollgate, dandelionVoting);

        Redemptions redemptions = _installRedemptions(senderStoredAddresses[msg.sender].dao, fundingPoolVault, hookedTokenManager, _redeemableTokens);
        _createRedemptionsPermissions(acl, redemptions, dandelionVoting);

        ConvictionVoting convictionVoting = _installConvictionVoting(senderStoredAddresses[msg.sender].dao, hookedTokenManager.token(), fundingPoolVault, _collateralToken, _convictionSettings);
        _createVaultPermissions(acl, fundingPoolVault, convictionVoting, permissionManager);
        _createConvictionVotingPermissions(acl, convictionVoting);

        _createPermissionForTemplate(acl, hookedTokenManager, hookedTokenManager.SET_HOOK_ROLE());
        hookedTokenManager.registerHook(convictionVoting);
        hookedTokenManager.registerHook(dandelionVoting);
        _removePermissionFromTemplate(acl, hookedTokenManager, hookedTokenManager.SET_HOOK_ROLE());

        _storeAddressesTxTwo(_collateralToken);
    }

    /**
    * @dev Mint vested tokens for the initial holders.
    * @param _holders List of holder addresses
    * @param _stakes List of holder stakes
    * @param _openDate Date the vesting calculations start
    * @param _vestingCliffPeriod Date when the initial portion of tokens are transferable
    * @param _vestingCompletePeriod Date when all tokens are transferable
    */
    function createTxTokenHolders(
        address[] _holders,
        uint256[] _stakes,
        uint64 _openDate,
        uint64 _vestingCliffPeriod,
        uint64 _vestingCompletePeriod
    )
        public
    {
        require(_holders.length == _stakes.length, ERROR_TOKENS_STAKES_MISMATCH);
        (, ACL acl,,, HookedTokenManager hookedTokenManager,) = _getStoredAddressesTxOne();
        uint64 vestingCliffDate = _openDate.add(_vestingCliffPeriod);
        uint64 vestingCompleteDate = _openDate.add(_vestingCompletePeriod);

        _createPermissionForTemplate(acl, hookedTokenManager, hookedTokenManager.ISSUE_ROLE());
        _createPermissionForTemplate(acl, hookedTokenManager, hookedTokenManager.ASSIGN_ROLE());

        for (uint256 i = 0; i < _holders.length; i++) {
            hookedTokenManager.issue(_stakes[i]);
            hookedTokenManager.assignVested(
                _holders[i],
                _stakes[i],
                _openDate,
                vestingCliffDate,
                vestingCompleteDate,
                true /* revokable */
            );
        }

        _removePermissionFromTemplate(acl, hookedTokenManager, hookedTokenManager.ISSUE_ROLE());
        _removePermissionFromTemplate(acl, hookedTokenManager, hookedTokenManager.ASSIGN_ROLE());
    }

    /**
    * @dev Add and initialise fundraising apps
    * @param _goal Presale goal in wei
    * @param _period Presale length in seconds
    * @param _exchangeRate Presale exchange rate in PPM
    * @param _vestingCliffPeriod Vesting cliff length for presale bought tokens in seconds
    * @param _vestingCompletePeriod Vesting complete length for presale bought tokens in seconds
    * @param _supplyOfferedPct Percent of total supply offered in presale in PPM
    * @param _fundingForBeneficiaryPct Percent of raised presale funds sent to the organization in PPM
    * @param _openDate The time the presale starts, requires manual opening if set to 0
    * @param _buyFeePct The Percent of a purchase contribution that is sent to the organization in PCT_BASE
    * @param _sellFeePct The percent of a sale return that is sent to the organization in PCT_BASE
    */
    function createDaoTxThree(
        uint256 _goal,
        uint64 _period,
        uint256 _exchangeRate,
        uint64 _vestingCliffPeriod,
        uint64 _vestingCompletePeriod,
        uint256 _supplyOfferedPct,
        uint256 _fundingForBeneficiaryPct,
        uint64 _openDate,
        uint256 _buyFeePct,
        uint256 _sellFeePct
    )
        public
    {
        require(senderStoredAddresses[msg.sender].collateralToken != address(0), ERROR_NO_CACHE);

        _installFundraisingApps(
            _goal,
            _period,
            _exchangeRate,
            _vestingCliffPeriod,
            _vestingCompletePeriod,
            _supplyOfferedPct,
            _fundingForBeneficiaryPct,
            _openDate,
            _buyFeePct,
            _sellFeePct
        );

        _createHookedTokenManagerPermissions();
        _createFundraisingPermissions();
    }

    /**
    * @dev Configure the fundraising collateral, install the hatch oracle and finalise permissions
    * @param _id Unique Aragon DAO ID
    * @param _virtualSupply Collateral token virtual supply in wei
    * @param _virtualBalance Collateral token virtual balance in wei
    * @param _reserveRatio The reserve ratio to be used for the collateral token in PPM
    * @param _scoreToken The membership score token address
    * @param _hatchOracleRatio Hatch oracle ratio between the contribution and membership score
    */
    function createDaoTxFour(
        string _id,
        uint256 _virtualSupply,
        uint256 _virtualBalance,
        uint32 _reserveRatio,
        address _scoreToken,
        uint256 _hatchOracleRatio
    )
        public
    {
        require(senderStoredAddresses[msg.sender].reserveVault != address(0), ERROR_NO_CACHE);

        _validateId(_id);
        (Kernel dao, ACL acl, DandelionVoting dandelionVoting,,, address permissionManager) = _getStoredAddressesTxOne();
        (, Presale presale,, Controller controller) = _getStoredAddressesTxThree();

        _setupCollateralToken(dao, acl, _virtualSupply, _virtualBalance, _reserveRatio);

        HatchOracle hatchOracle = _installHatchOracleApp(dao, _scoreToken, _hatchOracleRatio, address(presale));

        _setOracle(acl, ANY_ENTITY, controller, controller.CONTRIBUTE_ROLE(), hatchOracle);
        acl.setPermissionManager(permissionManager, controller, controller.CONTRIBUTE_ROLE());

        _transferRootPermissionsFromTemplateAndFinalizeDAO(dao, dandelionVoting);
        _registerID(_id, dao);
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

    function _installRedemptions(Kernel _dao, Vault _agentOrVault, HookedTokenManager _hookedTokenManager, address[] _redeemableTokens)
        internal returns (Redemptions)
    {
        Redemptions redemptions = Redemptions(_installNonDefaultApp(_dao, REDEMPTIONS_APP_ID));
        redemptions.initialize(_agentOrVault, TokenManager(_hookedTokenManager), _redeemableTokens);
        return redemptions;
    }

    function _installConvictionVoting(Kernel _dao, MiniMeToken _stakeToken, Vault _agentOrVault, address _requestToken, uint256[4] _convictionSettings)
        internal returns (ConvictionVoting)
    {
        ConvictionVoting convictionVoting = ConvictionVoting(_installNonDefaultApp(_dao, CONVICTION_VOTING_APP_ID));
        convictionVoting.initialize(_stakeToken, _agentOrVault, _requestToken, _convictionSettings[0], _convictionSettings[1], _convictionSettings[2], _convictionSettings[3]);
        return convictionVoting;
    }

    function _installFundraisingApps(
        uint256 _goal,
        uint64  _period,
        uint256 _exchangeRate,
        uint64  _vestingCliffPeriod,
        uint64  _vestingCompletePeriod,
        uint256 _supplyOfferedPct,
        uint256 _fundingForBeneficiaryPct,
        uint64  _openDate,
        uint256 _buyFeePct,
        uint256 _sellFeePct
    )
        internal
    {
        _proxifyFundraisingApps();
        address collateralToken = _getStoredAddressesTxTwo();

        _initializePresale(
            _goal,
            _period,
            _exchangeRate,
            _vestingCliffPeriod,
            _vestingCompletePeriod,
            _supplyOfferedPct,
            _fundingForBeneficiaryPct,
            _openDate,
            collateralToken
        );
        _initializeMarketMaker(_buyFeePct, _sellFeePct);
        _initializeController(collateralToken);
    }

    function _proxifyFundraisingApps() internal {
        (Kernel dao,,,,,) = _getStoredAddressesTxOne();

        Vault reserveVault = _installVaultApp(dao);
        Presale presale = Presale(_installNonDefaultApp(dao, PRESALE_ID));
        MarketMaker marketMaker = MarketMaker(_installNonDefaultApp(dao, MARKET_MAKER_ID));
        Controller controller = Controller(_installNonDefaultApp(dao, MARKETPLACE_CONTROLLER_ID));

        _storeAddressesTxThree(reserveVault, presale, marketMaker, controller);
    }

    function _initializePresale(
        uint256 _goal,
        uint64  _period,
        uint256 _exchangeRate,
        uint64  _vestingCliffPeriod,
        uint64  _vestingCompletePeriod,
        uint256 _supplyOfferedPct,
        uint256 _fundingForBeneficiaryPct,
        uint64  _openDate,
        address _collateralToken
    )
        internal
    {
        // Accessing deployed contracts directly due to stack too deep error.
        senderStoredAddresses[msg.sender].presale.initialize(
            AragonFundraisingController(senderStoredAddresses[msg.sender].controller),
            TokenManager(senderStoredAddresses[msg.sender].hookedTokenManager),
            senderStoredAddresses[msg.sender].reserveVault,
            senderStoredAddresses[msg.sender].fundingPoolVault,
            _collateralToken,
            _goal,
            _period,
            _exchangeRate,
            _vestingCliffPeriod,
            _vestingCompletePeriod,
            _supplyOfferedPct,
            _fundingForBeneficiaryPct,
            _openDate
        );
    }

    function _initializeMarketMaker(uint256 _buyFeePct, uint256 _sellFeePct) internal {
        IBancorFormula bancorFormula = IBancorFormula(_latestVersionAppBase(BANCOR_FORMULA_ID));

        (,,, Vault beneficiary, HookedTokenManager hookedTokenManager,) = _getStoredAddressesTxOne();
        (Vault reserveVault,, MarketMaker marketMaker, Controller controller) = _getStoredAddressesTxThree();

        marketMaker.initialize(AragonFundraisingController(controller), TokenManager(hookedTokenManager), bancorFormula, reserveVault, beneficiary, _buyFeePct, _sellFeePct);
    }

    function _initializeController(address _collateralToken) internal {
        (Vault reserveVault, Presale presale, MarketMaker marketMaker, Controller controller) = _getStoredAddressesTxThree();
        controller.initialize(presale, marketMaker, reserveVault);
    }

    function _setupCollateralToken(
        Kernel _dao,
        ACL _acl,
        uint256 _virtualSupply,
        uint256 _virtualBalance,
        uint32 _reserveRatio
    )
    internal
    {
        (,, DandelionVoting dandelionVoting,,, address permissionManager) = _getStoredAddressesTxOne();
        (,,, Controller controller) = _getStoredAddressesTxThree();
        address collateralToken = _getStoredAddressesTxTwo();

        _createPermissionForTemplate(_acl, address(controller), controller.ADD_COLLATERAL_TOKEN_ROLE());
        controller.addCollateralToken(
            collateralToken,
            _virtualSupply,
            _virtualBalance,
            _reserveRatio
        );
        _transferPermissionFromTemplate(_acl, controller, dandelionVoting, controller.ADD_COLLATERAL_TOKEN_ROLE(), permissionManager);
    }

    // Permission setting functions //

    function _createCustomVotingPermissions(ACL _acl, DandelionVoting _dandelionVoting, HookedTokenManager _hookedTokenManager)
        internal
    {
        (,,,,, address permissionManager) = _getStoredAddressesTxOne();
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_QUORUM_ROLE(), permissionManager);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_SUPPORT_ROLE(), permissionManager);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_BUFFER_BLOCKS_ROLE(), permissionManager);
        _acl.createPermission(_dandelionVoting, _dandelionVoting, _dandelionVoting.MODIFY_EXECUTION_DELAY_ROLE(), permissionManager);
    }

    function _createTollgatePermissions(ACL _acl, Tollgate _tollgate, DandelionVoting _dandelionVoting) internal {
        (,,,,, address permissionManager) = _getStoredAddressesTxOne();
        _acl.createPermission(_dandelionVoting, _tollgate, _tollgate.CHANGE_AMOUNT_ROLE(), permissionManager);
        _acl.createPermission(_dandelionVoting, _tollgate, _tollgate.CHANGE_DESTINATION_ROLE(), permissionManager);
        _acl.createPermission(_tollgate, _dandelionVoting, _dandelionVoting.CREATE_VOTES_ROLE(), permissionManager);
    }

    function _createRedemptionsPermissions(ACL _acl, Redemptions _redemptions, DandelionVoting _dandelionVoting)
        internal
    {
        (,,,,, address permissionManager) = _getStoredAddressesTxOne();
        _acl.createPermission(ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), address(this));
        _setOracle(_acl, ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), _dandelionVoting);
        _acl.setPermissionManager(permissionManager, _redemptions, _redemptions.REDEEM_ROLE());

        _acl.createPermission(_dandelionVoting, _redemptions, _redemptions.ADD_TOKEN_ROLE(), permissionManager);
        _acl.createPermission(_dandelionVoting, _redemptions, _redemptions.REMOVE_TOKEN_ROLE(), permissionManager);
    }

    function _createConvictionVotingPermissions(ACL _acl, ConvictionVoting _convictionVoting)
        internal
    {
        (,, DandelionVoting dandelionVoting,,, address permissionManager) = _getStoredAddressesTxOne();
        _acl.createPermission(dandelionVoting, _convictionVoting, _convictionVoting.UPDATE_SETTINGS_ROLE(), permissionManager);
        _acl.createPermission(ANY_ENTITY, _convictionVoting, _convictionVoting.CREATE_PROPOSALS_ROLE(), permissionManager);
        _acl.createPermission(ANY_ENTITY, _convictionVoting, _convictionVoting.CANCEL_PROPOSAL_ROLE(), permissionManager);
    }

    function _createHookedTokenManagerPermissions() internal {
        (, ACL acl, DandelionVoting dandelionVoting,, HookedTokenManager hookedTokenManager, address permissionManager) = _getStoredAddressesTxOne();
        (, Presale presale, MarketMaker marketMaker,) = _getStoredAddressesTxThree();

        address[] memory grantees = new address[](2);
        grantees[0] = address(marketMaker);
        grantees[1] = address(presale);
        acl.createPermission(marketMaker, hookedTokenManager, hookedTokenManager.MINT_ROLE(), permissionManager);
        acl.createPermission(presale, hookedTokenManager, hookedTokenManager.ISSUE_ROLE(), permissionManager);
        acl.createPermission(presale, hookedTokenManager, hookedTokenManager.ASSIGN_ROLE(), permissionManager);
        acl.createPermission(presale, hookedTokenManager, hookedTokenManager.REVOKE_VESTINGS_ROLE(), permissionManager);
        _createPermissions(acl, grantees, hookedTokenManager, hookedTokenManager.BURN_ROLE(), permissionManager);
    }

    function _createFundraisingPermissions() internal {
        (, ACL acl, DandelionVoting dandelionVoting,,, address permissionManager) = _getStoredAddressesTxOne();
        (Vault reserveVault, Presale presale, MarketMaker marketMaker, Controller controller) = _getStoredAddressesTxThree();

        // reserveVault
        acl.createPermission(marketMaker, reserveVault, reserveVault.TRANSFER_ROLE(), permissionManager);
        // presale
        acl.createPermission(controller, presale, presale.OPEN_ROLE(), permissionManager);
        acl.createPermission(controller, presale, presale.CONTRIBUTE_ROLE(), permissionManager);
        // market maker
        acl.createPermission(controller, marketMaker, marketMaker.CONTROLLER_ROLE(), permissionManager);
        // controller
        // ADD_COLLATERAL_TOKEN_ROLE is handled later [after collaterals have been added]
        acl.createPermission(dandelionVoting, controller, controller.UPDATE_BENEFICIARY_ROLE(), permissionManager);
        acl.createPermission(dandelionVoting, controller, controller.UPDATE_FEES_ROLE(), permissionManager);
        acl.createPermission(dandelionVoting, controller, controller.REMOVE_COLLATERAL_TOKEN_ROLE(), permissionManager);
        acl.createPermission(dandelionVoting, controller, controller.UPDATE_COLLATERAL_TOKEN_ROLE(), permissionManager);
        acl.createPermission(ANY_ENTITY, controller, controller.OPEN_PRESALE_ROLE(), permissionManager);
        acl.createPermission(presale, controller, controller.OPEN_TRADING_ROLE(), permissionManager);

        acl.createPermission(ANY_ENTITY, controller, controller.CONTRIBUTE_ROLE(), this);
        // We'll set a hatch oracle on the fourth transaction 

        acl.createPermission(ANY_ENTITY, controller, controller.MAKE_BUY_ORDER_ROLE(), permissionManager);

        acl.createPermission(ANY_ENTITY, controller, controller.MAKE_SELL_ORDER_ROLE(), address(this));
        _setOracle(acl, ANY_ENTITY, controller, controller.MAKE_SELL_ORDER_ROLE(), dandelionVoting);
        acl.setPermissionManager(permissionManager, controller, controller.MAKE_SELL_ORDER_ROLE());
    }

    // Temporary Storage functions //

    function _storeAddressesTxOne(Kernel _dao, ACL _acl, DandelionVoting _dandelionVoting, Vault _agentOrVault, HookedTokenManager _hookedTokenManager, address _permissionManager)
        internal
    {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        addresses.dao = _dao;
        addresses.acl = _acl;
        addresses.dandelionVoting = _dandelionVoting;
        addresses.fundingPoolVault = _agentOrVault;
        addresses.hookedTokenManager = _hookedTokenManager;
        addresses.permissionManager = _permissionManager;
    }

    function _getStoredAddressesTxOne() internal returns (Kernel, ACL, DandelionVoting, Vault, HookedTokenManager, address) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return (
            addresses.dao,
            addresses.acl,
            addresses.dandelionVoting,
            addresses.fundingPoolVault,
            addresses.hookedTokenManager,
            addresses.permissionManager
        );
    }

    function _storeAddressesTxTwo(address _collateralToken) internal {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        addresses.collateralToken = _collateralToken;
    }

    function _getStoredAddressesTxTwo() internal returns (address) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return addresses.collateralToken;
    }

    function _storeAddressesTxThree(Vault _reserve, Presale _presale, MarketMaker _marketMaker, Controller _controller)
        internal
    {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        addresses.reserveVault = _reserve;
        addresses.presale = _presale;
        addresses.marketMaker = _marketMaker;
        addresses.controller = _controller;
    }

    function _getStoredAddressesTxThree() internal returns (Vault, Presale, MarketMaker, Controller) {
        StoredAddresses storage addresses = senderStoredAddresses[msg.sender];
        return (
            addresses.reserveVault,
            addresses.presale,
            addresses.marketMaker,
            addresses.controller
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
