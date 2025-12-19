import { ethers } from "hardhat";

async function main() {
    const address = "0x07CE08aeBeFD380e9647e41263a886E5fB775029";
    
    console.log("\n🔍 Checking Sepolia Balance...\n");
    
    const balance = await ethers.provider.getBalance(address);
    const network = await ethers.provider.getNetwork();
    const blockNumber = await ethers.provider.getBlockNumber();
    
    console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
    console.log(`Block Number: ${blockNumber}`);
    console.log(`Address: ${address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`Balance (wei): ${balance.toString()}\n`);
    
    if (balance < ethers.parseEther("0.05")) {
        console.log("⚠️  Insufficient balance for deployment (need 0.05 ETH)\n");
    } else {
        console.log("✅ Sufficient balance for deployment\n");
    }
    
    // Check if we can get signers
    try {
        const [signer] = await ethers.getSigners();
        const signerAddress = await signer.getAddress();
        console.log(`Signer Address: ${signerAddress}`);
        
        if (signerAddress === address) {
            console.log("✅ Signer matches the address\n");
        } else {
            console.log("⚠️  Signer does NOT match the address\n");
            console.log("This means your DEPLOYER_PRIVATE_KEY in .env is different from the address you sent funds to.\n");
        }
    } catch (error: any) {
        console.log("❌ No signer available (DEPLOYER_PRIVATE_KEY not set in .env)\n");
    }
}

main().catch(console.error);

