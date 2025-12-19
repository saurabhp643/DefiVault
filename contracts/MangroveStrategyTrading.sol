// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title MangroveStrategyTrading
 * @notice Secure live trading contract with user+bot account isolation
 * @dev Features:
 * - User + Bot account model: Each user can have multiple bot accounts (one per strategy)
 * - Bot authorization: Admin signs bot public keys
 * - Complete isolation: Each user+bot pair has separate balances
 * - Swap whitelisting: Only pre-approved DEX routers per user+bot
 * - Replay protection: Nonce tracking per user+bot
 * - Gas efficient: No on-chain strategy metadata
 */
contract MangroveStrategyTrading is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============================================================
    // STATE VARIABLES
    // ============================================================

    // User Address => Bot Address => Token => Balance
    mapping(address => mapping(address => mapping(address => uint256))) public balances;

    // User Address => Bot Address => Registered (admin approved)
    mapping(address => mapping(address => bool)) public botRegistered;

    // User Address => Bot Address => Nonce (for replay protection)
    mapping(address => mapping(address => uint256)) public nonce;

    // User Address => Bot Address => Router => Function Selector => Whitelisted
    mapping(address => mapping(address => mapping(address => mapping(bytes4 => bool)))) public whitelistedRouters;

    // User Address => Bot Address => In Trade (concurrent trade protection)
    mapping(address => mapping(address => bool)) public inTrade;

    // Admin signer address (backend signs bot public keys)
    address public adminSigner;

    // Security limits organized in struct for better code structure
    struct SecurityLimits {
        uint256 maxGasPrice;
        uint256 maxSwapAmount;
    }
    SecurityLimits public securityLimits = SecurityLimits({
        maxGasPrice: 100 gwei,
        maxSwapAmount: 100000 * 10**6 // 100k USDT default (6 decimals)
    });

    // ============================================================
    // EVENTS
    // ============================================================

    event BotRegistered(
        address indexed user,
        address indexed botAddress
    );

    event Deposited(
        address indexed user,
        address indexed botAddress,
        address indexed token,
        uint256 amount
    );

    event Withdrawn(
        address indexed user,
        address indexed botAddress,
        address indexed token,
        uint256 amount,
        address recipient
    );

    event SwapExecuted(
        address indexed user,
        address indexed botAddress,
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event RouterWhitelisted(
        address indexed user,
        address indexed botAddress,
        address router,
        bytes4 selector,
        bool status
    );

    event AdminSignerUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );

    event SecurityLimitsUpdated(
        uint256 maxGasPrice,
        uint256 maxSwapAmount
    );

    event EmergencyPaused(address indexed by);
    event EmergencyUnpaused(address indexed by);

    // ============================================================
    // ERRORS
    // ============================================================

    error Unauthorized();
    error InvalidSignature();
    error RouterNotWhitelisted();
    error InsufficientBalance();
    error InvalidAmount();
    error SwapFailed();
    error InvalidNonce();
    error ZeroAddress();
    error GasPriceTooHigh();
    error ExceedsMaxSwapAmount();
    error TradeInProgress();
    error InvalidSwapCalldata();
    error InvalidRecipient();
    error RouterNotContract();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @notice Initializes the contract with admin signer
     * @param _adminSigner Address authorized to sign bot registrations
     */
    constructor(address _adminSigner) Ownable(msg.sender) {
        if (_adminSigner == address(0)) revert ZeroAddress();
        adminSigner = _adminSigner;
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Update the admin signer address
     * @param newAdminSigner New admin signer address
     */
    function setAdminSigner(address newAdminSigner) external onlyOwner {
        if (newAdminSigner == address(0)) revert ZeroAddress();
        address oldSigner = adminSigner;
        adminSigner = newAdminSigner;
        emit AdminSignerUpdated(oldSigner, newAdminSigner);
    }

    /**
     * @notice Update security limits
     * @param _maxGasPrice Maximum gas price in wei
     * @param _maxSwapAmount Maximum swap amount
     */
    function setSecurityLimits(uint256 _maxGasPrice, uint256 _maxSwapAmount) external onlyOwner {
        if (_maxGasPrice == 0 || _maxSwapAmount == 0) revert InvalidAmount();
        securityLimits = SecurityLimits(_maxGasPrice, _maxSwapAmount);
        emit SecurityLimitsUpdated(_maxGasPrice, _maxSwapAmount);
    }

    /**
     * @notice Emergency pause all operations
     */
    function pause() external onlyOwner {
        _pause();
        emit EmergencyPaused(msg.sender);
    }

    /**
     * @notice Unpause operations
     */
    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }

    /**
     * @notice Force unlock a stuck trade
     * @param userAddress User address
     * @param botAddress Bot address
     */
    function forceUnlockTrade(address userAddress, address botAddress) external onlyOwner {
        inTrade[userAddress][botAddress] = false;
    }

    /**
     * @notice Whitelist a router and function selector for user's bot account
     * @param botAddress Bot address
     * @param router DEX router address
     * @param selector Function selector to whitelist
     * @param status True to whitelist, false to remove
     */
    function setRouterWhitelist(
        address botAddress,
        address router,
        bytes4 selector,
        bool status
    ) external {
        // Only contract owner or user with registered bot can whitelist
        if (msg.sender != owner() && !botRegistered[msg.sender][botAddress]) {
            revert Unauthorized();
        }

        // Validate router is a contract
        if (router.code.length == 0) revert RouterNotContract();

        whitelistedRouters[msg.sender][botAddress][router][selector] = status;
        emit RouterWhitelisted(msg.sender, botAddress, router, selector, status);
    }

    /**
     * @notice Batch whitelist multiple routers
     */
    function batchSetRouterWhitelist(
        address botAddress,
        address[] calldata routers,
        bytes4[] calldata selectors,
        bool status
    ) external {
        if (msg.sender != owner() && !botRegistered[msg.sender][botAddress]) {
            revert Unauthorized();
        }

        uint256 length = routers.length;
        if (length != selectors.length) revert InvalidAmount();

        for (uint256 i = 0; i < length; i++) {
            // Validate router is a contract
            if (routers[i].code.length == 0) revert RouterNotContract();
            whitelistedRouters[msg.sender][botAddress][routers[i]][selectors[i]] = status;
            emit RouterWhitelisted(msg.sender, botAddress, routers[i], selectors[i], status);
        }
    }

    // ============================================================
    // DEPOSIT & WITHDRAWAL
    // ============================================================

    /**
     * @notice Deposit ERC20 tokens to user's bot account
     * @dev User must approve this contract before calling
     * @dev First deposit registers bot with admin signature verification
     * @param token Token address
     * @param amount Amount to deposit
     * @param botAddress Bot's address (one bot per strategy)
     * @param botSignature Admin's signature of bot address (required for first deposit)
     */
    function deposit(
        address token,
        uint256 amount,
        address botAddress,
        bytes memory botSignature
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (token == address(0)) revert ZeroAddress();
        if (botAddress == address(0)) revert ZeroAddress();

        // First deposit: verify admin signed the bot address for this user
        if (!botRegistered[msg.sender][botAddress]) {
            // Verify admin signature of bot public key
            // Message format: keccak256(abi.encodePacked(botAddress, msg.sender, address(this)))
            bytes32 messageHash = keccak256(abi.encodePacked(botAddress, msg.sender, address(this)));
            bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
            address signer = ethSignedHash.recover(botSignature);

            if (signer != adminSigner) revert InvalidSignature();

            // Register bot for this user
            botRegistered[msg.sender][botAddress] = true;
            emit BotRegistered(msg.sender, botAddress);
        }

        // Transfer tokens from user to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update balance
        balances[msg.sender][botAddress][token] += amount;

        emit Deposited(msg.sender, botAddress, token, amount);
    }

    /**
     * @notice Withdraw tokens from user's bot account
     * @param botAddress Bot address
     * @param token Token address
     * @param amount Amount to withdraw (0 = withdraw all)
     * @param recipient Address to receive tokens
     */
    function withdraw(
        address botAddress,
        address token,
        uint256 amount,
        address recipient
    ) external nonReentrant whenNotPaused {
        if (recipient == address(0)) revert ZeroAddress();
        if (!botRegistered[msg.sender][botAddress]) revert Unauthorized();

        uint256 balance = balances[msg.sender][botAddress][token];
        
        // If amount is 0, withdraw entire balance
        if (amount == 0) {
            amount = balance;
        }

        if (balance < amount) revert InsufficientBalance();

        // Update balance before transfer (CEI pattern)
        balances[msg.sender][botAddress][token] = balance - amount;

        // Transfer tokens
        IERC20(token).safeTransfer(recipient, amount);

        emit Withdrawn(msg.sender, botAddress, token, amount, recipient);
    }

    // ============================================================
    // SWAP EXECUTION
    // ============================================================

    /**
     * @notice Execute a swap for user's bot account
     * @dev Can be called by user directly or by anyone with valid bot signature
     * @param userAddress Strategy owner address
     * @param botAddress Bot address (unique per strategy)
     * @param router DEX router address
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input token
     * @param minAmountOut Minimum output amount (slippage protection)
     * @param swapCalldata Encoded swap function call from 1inch
     * @param swapNonce Nonce for replay protection
     * @param botSignature Bot's signature (required if not called by user)
     */
    function executeSwap(
        address userAddress,
        address botAddress,
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapCalldata,
        uint256 swapNonce,
        bytes memory botSignature
    ) external nonReentrant whenNotPaused {
        // Cache storage values to avoid multiple SLOAD operations (significant gas savings)
        SecurityLimits memory limits = securityLimits;
        bytes4 functionSelector = bytes4(swapCalldata[:4]);

        // Gas price check
        if (tx.gasprice > limits.maxGasPrice) revert GasPriceTooHigh();

        // Maximum swap amount check
        if (amountIn > limits.maxSwapAmount) revert ExceedsMaxSwapAmount();

        // Cache user+bot state for multiple accesses
        bool isBotRegistered_ = botRegistered[userAddress][botAddress];
        bool inTrade_ = inTrade[userAddress][botAddress];
        uint256 currentNonce = nonce[userAddress][botAddress];

        // Concurrent trade protection
        if (inTrade_) revert TradeInProgress();
        inTrade[userAddress][botAddress] = true;

        if (!isBotRegistered_) revert Unauthorized();

        // Authorization: either user directly or bot with valid signature
        if (msg.sender != userAddress) {
            // Verify bot signature
            if (
                keccak256(
                    abi.encodePacked(
                        userAddress,
                        botAddress,
                        router,
                        tokenIn,
                        tokenOut,
                        amountIn,
                        minAmountOut,
                        swapNonce,
                        address(this)
                    )
                ).toEthSignedMessageHash().recover(botSignature) != botAddress
            ) revert InvalidSignature();
        }

        // Verify nonce (replay protection)
        if (swapNonce != currentNonce) revert InvalidNonce();
        unchecked {
            nonce[userAddress][botAddress] = currentNonce + 1;
        }

        // Validate parameters
        if (amountIn == 0 || minAmountOut == 0) revert InvalidAmount();
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();

        // Verify router is whitelisted for this user+bot combination
        if (!whitelistedRouters[userAddress][botAddress][router][functionSelector]) {
            revert RouterNotWhitelisted();
        }

        // Check balance
        if (balances[userAddress][botAddress][tokenIn] < amountIn) {
            revert InsufficientBalance();
        }

        // Validate swap calldata
        _validateSwapCalldata(tokenIn, tokenOut, amountIn, router, swapCalldata);

        // Execute the swap
        _executeSwapInternal(
            userAddress,
            botAddress,
            router,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            swapCalldata
        );

        // Unlock trade
        inTrade[userAddress][botAddress] = false;
    }

    /**
     * @dev Validate swap calldata to ensure it matches expected parameters
     * @dev This prevents malicious calldata manipulation by verifying token addresses and amounts
     */
    function _validateSwapCalldata(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address /* router */,
        bytes calldata swapCalldata
    ) internal pure {
        if (swapCalldata.length < 4 || swapCalldata.length > 10000) revert InvalidSwapCalldata();

        bytes4 selector = bytes4(swapCalldata[:4]);

        // Validate 1inch V6 swap function: swap(address,(address,address,address,address,uint256,uint256,uint256,uint256,address,bytes),bytes,bytes)
        if (selector == 0x7c025200) {
            // Decode the parameters
            (
                ,
                bytes memory descBytes,
                ,
            ) = abi.decode(swapCalldata[4:], (address, bytes, bytes, bytes));

            // Decode SwapDescription struct
            (
                address srcToken,
                address dstToken,
                ,
                ,
                uint256 srcAmount,
                ,
                ,
                ,
                ,
            ) = abi.decode(descBytes, (address, address, address, address, uint256, uint256, uint256, uint256, address, bytes));

            // Verify the swap parameters match expected values
            if (srcToken != tokenIn) revert InvalidSwapCalldata();
            if (dstToken != tokenOut) revert InvalidSwapCalldata();
            if (srcAmount != amountIn) revert InvalidSwapCalldata();
        }
        // Add validation for other DEX selectors as needed (Uniswap V2/V3, etc.)
        // For now, only 1inch V6 is fully validated
    }

    /**
     * @dev Internal function to handle swap execution
     */
    function _executeSwapInternal(
        address userAddress,
        address botAddress,
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata swapCalldata
    ) private {
        // Get balances before swap
        uint256 balanceOutBefore = IERC20(tokenOut).balanceOf(address(this));

        // Deduct input amount (before swap - CEI pattern)
        balances[userAddress][botAddress][tokenIn] -= amountIn;

        // Approve router to spend tokens
        IERC20(tokenIn).safeIncreaseAllowance(router, amountIn);

        // Execute swap on DEX router (1inch, Uniswap, etc.)
        (bool success, ) = router.call(swapCalldata);
        if (!success) revert SwapFailed();

        // Calculate actual output received
        uint256 actualAmountOut;
        unchecked {
            actualAmountOut = IERC20(tokenOut).balanceOf(address(this)) - balanceOutBefore;
        }

        // Verify slippage protection
        if (actualAmountOut < minAmountOut) revert SwapFailed();

        // Add received output tokens
        balances[userAddress][botAddress][tokenOut] += actualAmountOut;

        // Reset allowance to 0 for security (only if needed to prevent leftover approvals)
        uint256 remainingAllowance = IERC20(tokenIn).allowance(address(this), router);
        if (remainingAllowance > 0) {
            IERC20(tokenIn).safeDecreaseAllowance(router, remainingAllowance);
        }

        emit SwapExecuted(userAddress, botAddress, router, tokenIn, tokenOut, amountIn, actualAmountOut);
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get balance for user's bot account
     */
    function getBalance(
        address user,
        address botAddress,
        address token
    ) external view returns (uint256) {
        return balances[user][botAddress][token];
    }

    /**
     * @notice Get nonce for user's bot account
     */
    function getNonce(address user, address botAddress) external view returns (uint256) {
        return nonce[user][botAddress];
    }

    /**
     * @notice Check if bot is registered for user
     */
    function isBotRegistered(address user, address botAddress) external view returns (bool) {
        return botRegistered[user][botAddress];
    }

    /**
     * @notice Check if router is whitelisted for user's bot
     */
    function isRouterWhitelisted(
        address user,
        address botAddress,
        address router,
        bytes4 selector
    ) external view returns (bool) {
        return whitelistedRouters[user][botAddress][router][selector];
    }

    // ============================================================
    // EMERGENCY FUNCTIONS
    // ============================================================

    /**
     * @notice Emergency withdrawal by contract owner
     * @dev Only for recovering stuck funds, not for normal operations
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();
        IERC20(token).safeTransfer(recipient, amount);
    }
}
