import { ethers } from "ethers";

console.log("\n═══════════════════════════════════════════════════════════");
console.log("🔐 GENERATE NEW SECURE WALLET FOR DEPLOYMENT");
console.log("═══════════════════════════════════════════════════════════\n");

// Generate a new random wallet
const wallet = ethers.Wallet.createRandom();

console.log("✅ New Wallet Generated:\n");
console.log("Address:     ", wallet.address);
console.log("Private Key: ", wallet.privateKey);
console.log("Mnemonic:    ", wallet.mnemonic?.phrase);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("📝 NEXT STEPS:");
console.log("═══════════════════════════════════════════════════════════\n");

console.log("1. ⚠️  SAVE YOUR PRIVATE KEY SECURELY!");
console.log("   - Never share it with anyone");
console.log("   - Store in password manager or hardware wallet");
console.log("   - This private key controls real funds!\n");

console.log("2. Update your .env file:");
console.log("   Add this line to web3/.env:");
console.log(`   DEPLOYER_PRIVATE_KEY=${wallet.privateKey}\n`);

console.log("3. Get Sepolia ETH for your NEW address:");
console.log(`   Address: ${wallet.address}`);
console.log("   Use any Sepolia faucet:");
console.log("   - https://sepoliafaucet.com/");
console.log("   - https://faucets.chain.link/sepolia");
console.log("   - https://cloud.google.com/application/web3/faucet/ethereum/sepolia\n");

console.log("4. Verify balance:");
console.log("   npx hardhat run scripts/check-balance.ts --network sepolia\n");

console.log("5. Deploy contract:");
console.log("   npx hardhat run scripts/deploy-mainnet.ts --network sepolia\n");

console.log("═══════════════════════════════════════════════════════════\n");

console.log("⚠️  IMPORTANT SECURITY NOTES:");
console.log("- This is YOUR unique wallet - only you have the private key");
console.log("- The previous address (0xf39F...) is publicly known - never use it!");
console.log("- Keep your private key secret and secure");
console.log("- For mainnet, consider using a hardware wallet (Ledger/Trezor)\n");

