import { ethers } from "hardhat";
import { MangroveStrategyTrading } from "../typechain-types";

/**
 * PRODUCTION DEPLOYMENT SCRIPT FOR ETHEREUM MAINNET
 * 
 * ⚠️  CRITICAL: Read all security checks before running!
 * 
 * Prerequisites:
 * 1. Set MAINNET_PRIVATE_KEY in .env (deployer wallet)
 * 2. Set ADMIN_SIGNER_ADDRESS in .env (backend admin)
 * 3. Ensure deployer has enough ETH for gas (~0.05 ETH)
 * 4. Verify all configuration parameters below
 * 5. Test on testnet first (Sepolia/Goerli)
 * 
 * Run: npx hardhat run scripts/deploy-mainnet.ts --network mainnet
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION - VERIFY THESE VALUES BEFORE DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
    // Admin signer address (backend wallet that signs bot registrations)
    // ⚠️  CRITICAL: This should be your secure backend admin wallet
    ADMIN_SIGNER_ADDRESS: process.env.ADMIN_SIGNER_ADDRESS || "",
    
    // Security limits
    MAX_GAS_PRICE: ethers.parseUnits("150", "gwei"),  // 150 gwei
    MAX_SWAP_AMOUNT: 100000n * 10n**6n,                // 100,000 USDT (6 decimals)
    
    // Pause on deployment (set to true for extra safety)
    PAUSE_ON_DEPLOYMENT: false,
    
    // Verification delay (seconds to wait before verification)
    VERIFICATION_DELAY: 30
};

// ═══════════════════════════════════════════════════════════════════
// PRE-DEPLOYMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════

function validateConfig() {
    console.log("\n🔍 Validating Configuration...\n");
    
    const errors: string[] = [];
    
    if (!CONFIG.ADMIN_SIGNER_ADDRESS || CONFIG.ADMIN_SIGNER_ADDRESS === "") {
        errors.push("❌ ADMIN_SIGNER_ADDRESS not set in .env");
    }
    
    if (!ethers.isAddress(CONFIG.ADMIN_SIGNER_ADDRESS)) {
        errors.push("❌ ADMIN_SIGNER_ADDRESS is not a valid address");
    }
    
    if (CONFIG.MAX_GAS_PRICE <= 0n) {
        errors.push("❌ MAX_GAS_PRICE must be greater than 0");
    }
    
    if (CONFIG.MAX_SWAP_AMOUNT <= 0n) {
        errors.push("❌ MAX_SWAP_AMOUNT must be greater than 0");
    }
    
    if (errors.length > 0) {
        console.error("\n⚠️  CONFIGURATION ERRORS:\n");
        errors.forEach(err => console.error(err));
        console.error("\n");
        throw new Error("Configuration validation failed");
    }
    
    console.log("✅ Configuration validated\n");
}

// ═══════════════════════════════════════════════════════════════════
// DEPLOYMENT CONFIRMATION
// ═══════════════════════════════════════════════════════════════════

async function confirmDeployment(deployer: string, network: string, chainId: bigint) {
    console.log("════════════════════════════════════════════════════════");
    console.log("⚠️  MAINNET DEPLOYMENT CONFIRMATION");
    console.log("════════════════════════════════════════════════════════\n");
    
    console.log("📋 Deployment Details:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`Network:           ${network}`);
    console.log(`Chain ID:          ${chainId}`);
    console.log(`Deployer:          ${deployer}`);
    console.log(`Admin Signer:      ${CONFIG.ADMIN_SIGNER_ADDRESS}`);
    console.log(`Max Gas Price:     ${ethers.formatUnits(CONFIG.MAX_GAS_PRICE, "gwei")} gwei`);
    console.log(`Max Swap Amount:   ${ethers.formatUnits(CONFIG.MAX_SWAP_AMOUNT, 6)} USDT`);
    console.log(`Pause on Deploy:   ${CONFIG.PAUSE_ON_DEPLOYMENT}\n`);
    
    console.log("⚠️  SECURITY CHECKLIST:");
    console.log("──────────────────────────────────────────────────────");
    console.log("□ Tested on testnet (Sepolia/Goerli)?");
    console.log("□ Admin signer address is correct?");
    console.log("□ Deployer has sufficient ETH for gas?");
    console.log("□ Configuration values verified?");
    console.log("□ Team notified about deployment?");
    console.log("□ Monitoring systems ready?\n");
    
    // For mainnet, require manual confirmation
    if (chainId === 1n) {
        console.log("⚠️  This is MAINNET (Chain ID: 1)");
        console.log("⚠️  Please verify all details above");
        console.log("⚠️  Proceeding in 10 seconds... (Ctrl+C to cancel)\n");
        
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DEPLOYMENT FUNCTION
// ═══════════════════════════════════════════════════════════════════

async function main() {
    console.log("\n════════════════════════════════════════════════════════");
    console.log("🚀 MANGROVE STRATEGY TRADING - MAINNET DEPLOYMENT");
    console.log("════════════════════════════════════════════════════════\n");
    
    // Validate configuration
    validateConfig();
    
    // Get deployer
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const deployerBalance = await ethers.provider.getBalance(deployerAddress);
    const network = await ethers.provider.getNetwork();
    
    console.log("📋 Network Information:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`Network:           ${network.name}`);
    console.log(`Chain ID:          ${network.chainId}`);
    console.log(`Deployer:          ${deployerAddress}`);
    console.log(`Deployer Balance:  ${ethers.formatEther(deployerBalance)} ETH`);
    console.log(`Block Number:      ${await ethers.provider.getBlockNumber()}\n`);
    
    // Check deployer balance
    if (deployerBalance < ethers.parseEther("0.05")) {
        throw new Error("⚠️  Insufficient ETH balance. Need at least 0.05 ETH for deployment");
    }
    
    // Confirm deployment
    await confirmDeployment(deployerAddress, network.name, network.chainId);
    
    // ════════════════════════════════════════════════════════════════
    // STEP 1: Deploy Contract
    // ════════════════════════════════════════════════════════════════
    console.log("════════════════════════════════════════════════════════");
    console.log("📦 STEP 1: Deploying Contract");
    console.log("════════════════════════════════════════════════════════\n");
    
    const MangroveStrategyTrading = await ethers.getContractFactory("MangroveStrategyTrading");
    
    console.log("⏳ Deploying MangroveStrategyTrading...");
    console.log(`   Admin Signer: ${CONFIG.ADMIN_SIGNER_ADDRESS}\n`);
    
    // Get current gas price and add buffer for faster confirmation
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice ? feeData.gasPrice * 120n / 100n : undefined; // 20% buffer
    
    console.log(`   Gas Price: ${gasPrice ? ethers.formatUnits(gasPrice, "gwei") : "auto"} gwei`);
    
    const contract = await MangroveStrategyTrading.deploy(
        CONFIG.ADMIN_SIGNER_ADDRESS,
        {
            gasPrice: gasPrice,
            gasLimit: 6000000 // 6M gas limit
        }
    ) as MangroveStrategyTrading;
    
    console.log("⏳ Waiting for deployment transaction...");
    console.log(`   Tx Hash: ${contract.deploymentTransaction()?.hash}\n`);
    await contract.waitForDeployment();
    
    const contractAddress = await contract.getAddress();
    const deploymentTx = contract.deploymentTransaction();
    
    console.log(`✅ Contract deployed!`);
    console.log(`   Address: ${contractAddress}`);
    console.log(`   Tx Hash: ${deploymentTx?.hash}\n`);
    
    // ════════════════════════════════════════════════════════════════
    // STEP 2: Verify Deployment
    // ════════════════════════════════════════════════════════════════
    console.log("════════════════════════════════════════════════════════");
    console.log("🔍 STEP 2: Verifying Deployment");
    console.log("════════════════════════════════════════════════════════\n");
    
    const owner = await contract.owner();
    const adminSigner = await contract.adminSigner();
    const maxGasPrice = await contract.maxGasPrice();
    const maxSwapAmount = await contract.maxSwapAmount();
    
    console.log("✅ Contract State:");
    console.log(`   Owner:           ${owner}`);
    console.log(`   Admin Signer:    ${adminSigner}`);
    console.log(`   Max Gas Price:   ${ethers.formatUnits(maxGasPrice, "gwei")} gwei`);
    console.log(`   Max Swap Amount: ${ethers.formatUnits(maxSwapAmount, 6)} USDT\n`);
    
    // Verify owner
    if (owner !== deployerAddress) {
        throw new Error("❌ Owner mismatch! Expected deployer to be owner");
    }
    
    // Verify admin signer
    if (adminSigner !== CONFIG.ADMIN_SIGNER_ADDRESS) {
        throw new Error("❌ Admin signer mismatch! Deployment failed");
    }
    
    console.log("✅ All verifications passed\n");
    
    // ════════════════════════════════════════════════════════════════
    // STEP 3: Configure Security Limits
    // ════════════════════════════════════════════════════════════════
    console.log("════════════════════════════════════════════════════════");
    console.log("⚙️  STEP 3: Configuring Security Limits");
    console.log("════════════════════════════════════════════════════════\n");
    
    console.log("⏳ Setting security limits...");
    const limitsTx = await contract.setSecurityLimits(
        CONFIG.MAX_GAS_PRICE,
        CONFIG.MAX_SWAP_AMOUNT,
        {
            gasPrice: gasPrice,
            gasLimit: 200000
        }
    );
    await limitsTx.wait();
    
    console.log("✅ Security limits configured:");
    console.log(`   Max Gas Price:   ${ethers.formatUnits(CONFIG.MAX_GAS_PRICE, "gwei")} gwei`);
    console.log(`   Max Swap Amount: ${ethers.formatUnits(CONFIG.MAX_SWAP_AMOUNT, 6)} USDT\n`);
    
    // ════════════════════════════════════════════════════════════════
    // STEP 4: Optional Pause
    // ════════════════════════════════════════════════════════════════
    if (CONFIG.PAUSE_ON_DEPLOYMENT) {
        console.log("════════════════════════════════════════════════════════");
        console.log("🛑 STEP 4: Pausing Contract");
        console.log("════════════════════════════════════════════════════════\n");
        
        console.log("⏳ Pausing contract for safety...");
        const pauseTx = await contract.pause({
            gasPrice: gasPrice,
            gasLimit: 100000
        });
        await pauseTx.wait();
        
        console.log("✅ Contract paused");
        console.log("   Unpause when ready to accept deposits\n");
    }
    
    // ════════════════════════════════════════════════════════════════
    // DEPLOYMENT COMPLETE
    // ════════════════════════════════════════════════════════════════
    console.log("════════════════════════════════════════════════════════");
    console.log("✅ DEPLOYMENT SUCCESSFUL!");
    console.log("════════════════════════════════════════════════════════\n");
    
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        contractAddress: contractAddress,
        owner: owner,
        adminSigner: adminSigner,
        deployer: deployerAddress,
        deploymentTxHash: deploymentTx?.hash,
        maxGasPrice: ethers.formatUnits(await contract.maxGasPrice(), "gwei") + " gwei",
        maxSwapAmount: ethers.formatUnits(await contract.maxSwapAmount(), 6) + " USDT",
        isPaused: CONFIG.PAUSE_ON_DEPLOYMENT,
        deployedAt: new Date().toISOString(),
        blockNumber: await ethers.provider.getBlockNumber()
    };
    
    console.log("📋 DEPLOYMENT SUMMARY:");
    console.log("──────────────────────────────────────────────────────");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    console.log("\n");
    
    console.log("📝 NEXT STEPS:");
    console.log("──────────────────────────────────────────────────────");
    console.log("1. ✅ Save deployment info to secure location");
    console.log("2. 🔍 Verify contract on Etherscan:");
    console.log(`   npx hardhat verify --network mainnet ${contractAddress} ${CONFIG.ADMIN_SIGNER_ADDRESS}`);
    console.log("3. 🔐 Transfer ownership if needed:");
    console.log(`   await contract.transferOwnership("NEW_OWNER_ADDRESS")`);
    console.log("4. 🛑 Unpause contract when ready (if paused):");
    console.log(`   await contract.unpause()`);
    console.log("5. ⚙️  Configure backend with contract address");
    console.log("6. 📊 Setup monitoring and alerts");
    console.log("7. 🧪 Test with small deposits first");
    console.log("8. 📢 Notify team about deployment\n");
    
    console.log("🔗 USEFUL LINKS:");
    console.log("──────────────────────────────────────────────────────");
    console.log(`Etherscan:  https://etherscan.io/address/${contractAddress}`);
    console.log(`Tx Hash:    https://etherscan.io/tx/${deploymentTx?.hash}\n`);
    
    console.log("════════════════════════════════════════════════════════\n");
    
    // Save to file
    const fs = require("fs");
    const path = require("path");
    const deploymentsDir = path.join(__dirname, "../deployments");
    
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const filename = `mainnet-${Date.now()}.json`;
    const filepath = path.join(deploymentsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`💾 Deployment info saved to: deployments/${filename}\n`);
}

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════

main()
    .then(() => {
        console.log("✅ Deployment script completed successfully\n");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n════════════════════════════════════════════════════════");
        console.error("❌ DEPLOYMENT FAILED");
        console.error("════════════════════════════════════════════════════════\n");
        console.error("Error:", error.message);
        console.error("\nStack trace:", error.stack);
        console.error("\n");
        process.exit(1);
    });


