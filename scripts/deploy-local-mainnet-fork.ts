import { ethers } from "hardhat";
import { MangroveStrategyTrading } from "../typechain-types";

/**
 * Deployment script for LOCAL MAINNET FORK
 * Use this for testing on a forked mainnet environment
 * 
 * Run: npx hardhat run scripts/deploy-local-mainnet-fork.ts --network localhost
 */

// MAINNET ADDRESSES
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const INCH_ROUTER = "0x111111125421cA6dc452d289314280a0f8842A65";
const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// 1inch swap function selector
const INCH_SWAP_SELECTOR = "0x12aa3caf"; // swap(address,address,address,uint256,uint256,bytes)

async function main() {
    console.log("\n════════════════════════════════════════════════════════");
    console.log("🚀 DEPLOYING MANGROVE STRATEGY TRADING (LOCAL MAINNET FORK)");
    console.log("════════════════════════════════════════════════════════\n");

    const [deployer, adminSigner, user1, bot1] = await ethers.getSigners();

    console.log("📋 Deployment Configuration:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`Deployer:      ${deployer.address}`);
    console.log(`Admin Signer:  ${adminSigner.address}`);
    console.log(`User 1:        ${user1.address}`);
    console.log(`Bot 1:         ${bot1.address}`);
    console.log(`Network:       ${(await ethers.provider.getNetwork()).name}`);
    console.log(`Chain ID:      ${(await ethers.provider.getNetwork()).chainId}`);
    console.log(`Block Number:  ${await ethers.provider.getBlockNumber()}\n`);

    // ════════════════════════════════════════════════════════════════
    // STEP 1: Deploy Contract
    // ════════════════════════════════════════════════════════════════
    console.log("📦 Step 1: Deploying MangroveStrategyTrading...");
    const MangroveStrategyTrading = await ethers.getContractFactory("MangroveStrategyTrading");
    
    // Get current gas price from network and set proper fees
    const feeData = await ethers.provider.getFeeData();
    const baseFee = feeData.gasPrice || ethers.parseUnits("10", "gwei");
    
    console.log(`⛽ Current base fee: ${ethers.formatUnits(baseFee, "gwei")} gwei`);
    
    // Calculate proper gas fees (2x base fee for safety)
    const maxFeePerGas = baseFee * 2n;
    const maxPriorityFeePerGas = ethers.parseUnits("2", "gwei");
    
    console.log(`⛽ Using maxFeePerGas: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);
    console.log(`⛽ Using maxPriorityFeePerGas: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} gwei\n`);
    
    const contract = await MangroveStrategyTrading.deploy(adminSigner.address, {
        maxFeePerGas,
        maxPriorityFeePerGas
    }) as MangroveStrategyTrading;
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();
    console.log(`✅ Contract deployed at: ${contractAddress}\n`);

    // ════════════════════════════════════════════════════════════════
    // STEP 2: Verify Deployment
    // ════════════════════════════════════════════════════════════════
    console.log("🔍 Step 2: Verifying Deployment...");
    const owner = await contract.owner();
    const adminSignerAddr = await contract.adminSigner();
    const limits = await contract.securityLimits();

    console.log(`Owner:             ${owner}`);
    console.log(`Admin Signer:      ${adminSignerAddr}`);
    console.log(`Max Gas Price:     ${ethers.formatUnits(limits.maxGasPrice, "gwei")} gwei`);
    console.log(`Max Swap Amount:   ${ethers.formatUnits(limits.maxSwapAmount, 6)} USDT\n`);

    // ════════════════════════════════════════════════════════════════
    // STEP 3: Configure Security Limits (Optional)
    // ════════════════════════════════════════════════════════════════
    console.log("⚙️  Step 3: Configuring Security Limits...");
    const newMaxGasPrice = ethers.parseUnits("150", "gwei");
    const newMaxSwapAmount = 500000n * 10n**6n; // 500k USDT

    const tx1 = await contract.setSecurityLimits(newMaxGasPrice, newMaxSwapAmount, {
        maxFeePerGas,
        maxPriorityFeePerGas
    });
    await tx1.wait();
    console.log(`✅ Security limits updated`);
    console.log(`   Max Gas Price:   ${ethers.formatUnits(newMaxGasPrice, "gwei")} gwei`);
    console.log(`   Max Swap Amount: ${ethers.formatUnits(newMaxSwapAmount, 6)} USDT\n`);

    // ════════════════════════════════════════════════════════════════
    // STEP 4: Setup Test User & Bot
    // ════════════════════════════════════════════════════════════════
    console.log("👤 Step 4: Setting up Test User & Bot...");
    
    // Admin signs bot address for user1 (with contract address for security)
    const messageHash = ethers.solidityPackedKeccak256(
        ["address", "address", "address"],
        [bot1.address, user1.address, contractAddress]
    );
    const adminSignature = await adminSigner.signMessage(ethers.getBytes(messageHash));
    
    console.log(`✅ Admin signature created for bot registration\n`);

    // ════════════════════════════════════════════════════════════════
    // STEP 5: Get Test Tokens (Buy from Uniswap)
    // ════════════════════════════════════════════════════════════════
    console.log("💰 Step 5: Acquiring Test USDT...");
    
    try {
        const uniswapRouter = await ethers.getContractAt(
            ["function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)"],
            UNISWAP_V2_ROUTER
        );

        // Buy 10,000 USDT with ETH
        const ethAmount = ethers.parseEther("5"); // 5 ETH
        const path = [WETH_ADDRESS, USDT_ADDRESS];
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

        const swapTx = await uniswapRouter.connect(user1).swapExactETHForTokens(
            0, // Accept any amount
            path,
            user1.address,
            deadline,
            { 
                value: ethAmount,
                maxFeePerGas,
                maxPriorityFeePerGas
            }
        );
        await swapTx.wait();

        const usdt = await ethers.getContractAt("IERC20", USDT_ADDRESS);
        const usdtBalance = await usdt.balanceOf(user1.address);
        console.log(`✅ User1 acquired ${ethers.formatUnits(usdtBalance, 6)} USDT\n`);

        // ════════════════════════════════════════════════════════════════
        // STEP 6: Deposit to Contract
        // ════════════════════════════════════════════════════════════════
        console.log("💳 Step 6: Testing Deposit...");
        
        const depositAmount = 10000n * 10n**6n; // 10,000 USDT
        
        // Approve contract
        const approveTx = await usdt.connect(user1).approve(contractAddress, depositAmount, {
            maxFeePerGas,
            maxPriorityFeePerGas
        });
        await approveTx.wait();
        console.log(`✅ Approved ${ethers.formatUnits(depositAmount, 6)} USDT`);

        // Deposit
        const depositTx = await contract.connect(user1).deposit(
            USDT_ADDRESS,
            depositAmount,
            bot1.address,
            adminSignature,
            {
                maxFeePerGas,
                maxPriorityFeePerGas
            }
        );
        await depositTx.wait();
        console.log(`✅ Deposited ${ethers.formatUnits(depositAmount, 6)} USDT`);

        const balance = await contract.getBalance(user1.address, bot1.address, USDT_ADDRESS);
        console.log(`✅ Contract balance: ${ethers.formatUnits(balance, 6)} USDT\n`);

        // ════════════════════════════════════════════════════════════════
        // STEP 7: Whitelist Router
        // ════════════════════════════════════════════════════════════════
        console.log("✅ Step 7: Whitelisting 1inch Router...");
        
        const whitelistTx = await contract.connect(user1).setRouterWhitelist(
            bot1.address,
            INCH_ROUTER,
            INCH_SWAP_SELECTOR,
            true,
            {
                maxFeePerGas,
                maxPriorityFeePerGas
            }
        );
        await whitelistTx.wait();
        
        const isWhitelisted = await contract.isRouterWhitelisted(
            user1.address,
            bot1.address,
            INCH_ROUTER,
            INCH_SWAP_SELECTOR
        );
        console.log(`✅ 1inch router whitelisted: ${isWhitelisted}\n`);

        // ════════════════════════════════════════════════════════════════
        // STEP 8: Test Pause/Unpause
        // ════════════════════════════════════════════════════════════════
        console.log("🛑 Step 8: Testing Pause Functionality...");
        
        const pauseTx = await contract.pause({
            maxFeePerGas,
            maxPriorityFeePerGas
        });
        await pauseTx.wait();
        console.log(`✅ Contract paused`);

        const unpauseTx = await contract.unpause({
            maxFeePerGas,
            maxPriorityFeePerGas
        });
        await unpauseTx.wait();
        console.log(`✅ Contract unpaused\n`);

    } catch (error: any) {
        console.log(`⚠️  Skipping token acquisition and testing: ${error.message}`);
        console.log(`   (This is expected if you don't have a mainnet fork running)\n`);
    }

    // ════════════════════════════════════════════════════════════════
    // DEPLOYMENT SUMMARY
    // ════════════════════════════════════════════════════════════════
    console.log("════════════════════════════════════════════════════════");
    console.log("✅ DEPLOYMENT COMPLETE!");
    console.log("════════════════════════════════════════════════════════\n");

    console.log("📋 Contract Information:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`Contract Address:  ${contractAddress}`);
    console.log(`Owner:             ${owner}`);
    console.log(`Admin Signer:      ${adminSignerAddr}`);
    console.log(`Network:           ${(await ethers.provider.getNetwork()).name}`);
    console.log(`Chain ID:          ${(await ethers.provider.getNetwork()).chainId}\n`);

    console.log("🔧 Configuration:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`Max Gas Price:     ${ethers.formatUnits(await contract.maxGasPrice(), "gwei")} gwei`);
    console.log(`Max Swap Amount:   ${ethers.formatUnits(await contract.maxSwapAmount(), 6)} USDT\n`);

    console.log("📝 Test Accounts:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`User 1:            ${user1.address}`);
    console.log(`Bot 1:             ${bot1.address}\n`);

    console.log("🔗 Mainnet Addresses:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`USDT:              ${USDT_ADDRESS}`);
    console.log(`WETH:              ${WETH_ADDRESS}`);
    console.log(`1inch Router:      ${INCH_ROUTER}`);
    console.log(`Uniswap V2 Router: ${UNISWAP_V2_ROUTER}\n`);

    console.log("💡 Next Steps:");
    console.log("──────────────────────────────────────────────────────");
    console.log("1. Verify contract on Etherscan (if deploying to testnet/mainnet)");
    console.log("2. Transfer ownership if needed");
    console.log("3. Configure backend with contract address");
    console.log("4. Test deposit, swap, and withdraw flows");
    console.log("5. Monitor events and security limits\n");

    console.log("════════════════════════════════════════════════════════\n");

    // Save deployment info to file
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId.toString(),
        contractAddress: contractAddress,
        owner: owner,
        adminSigner: adminSignerAddr,
        maxGasPrice: ethers.formatUnits(await contract.maxGasPrice(), "gwei"),
        maxSwapAmount: ethers.formatUnits(await contract.maxSwapAmount(), 6),
        deployedAt: new Date().toISOString(),
        blockNumber: await ethers.provider.getBlockNumber()
    };

    console.log("💾 Deployment Info (save this):");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    console.log("\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });

