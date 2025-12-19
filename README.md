# Mangrove Live Trading Smart Contract

> **Production-grade Solidity contract for strategy-based live trading with non-custodial wallet support**

## 🎯 Overview

A minimal, secure smart contract that enables live trading for user strategies. Users maintain full control of their funds through their non-custodial wallets.

### Core Principles

✅ **User Control** - Users deposit from their own wallets  
✅ **Strategy Isolation** - Each strategy's funds are completely isolated  
✅ **Backend Managed** - Strategy lifecycle (active/paused) handled by backend  
✅ **Bot Execution** - Automated trading with admin-signed authorization  
✅ **Swap Whitelisting** - Only approved DEX routers  
✅ **Replay Protection** - Nonce-based security  

---

## 🏗️ Architecture

### System Flow

```
Backend Database                Smart Contract
─────────────────              ──────────────────
Strategy (DB)                  Contract Strategy
├─ id (UUID)                   ├─ contractStrategyId (bytes32)
├─ user_id                     ├─ owner (address)
├─ status (active/paused)      ├─ balances (mapping)
├─ is_deployed                 └─ nonce (uint256)
└─ contract_strategy_id ──────────┘
   (maps to on-chain)
```

### Key Design Decisions

**1. Strategy Management Split**
- **Backend**: Manages strategy creation, status (active/paused/stopped), configuration
- **Contract**: Only handles funds (deposit/withdraw/swap) and isolation

**2. contractStrategyId**
- Maps backend UUID to on-chain bytes32
- Generated: `contractStrategyId = keccak256(abi.encodePacked(strategyUUID))`
- Stored in both DB and used on-chain

**3. Non-Custodial Wallet**
- Users keep their private keys
- Users must approve contract to spend tokens
- Users can withdraw anytime

---

## 📋 Contract Functions

### 1. Deposit

```solidity
function deposit(
    bytes32 contractStrategyId,
    address token,
    uint256 amount,
    address botAddress,
    bytes memory botSignature
) external
```

**Usage**:
```typescript
// First deposit: Admin signs bot public key
const messageHash = ethers.solidityPackedKeccak256(
  ['bytes32', 'address', 'address'],
  [contractStrategyId, botAddress, userAddress]
);
const botSignature = await adminWallet.signMessage(ethers.getBytes(messageHash));

// User approves contract
await usdt.approve(contractAddress, amount);

// User deposits with bot address and admin signature
await contract.deposit(contractStrategyId, usdtAddress, amount, botAddress, botSignature);

// Subsequent deposits: bot params ignored
await contract.deposit(contractStrategyId, usdtAddress, amount, ethers.ZeroAddress, '0x');
```

**Authorization**: 
- First deposit: Requires admin-signed bot address (verifies bot is authorized)
- Subsequent deposits: Only strategy owner

**Security**: 
- Registers authorized bot for the strategy
- Bot private key stored encrypted in backend (KMS)
- Only admin-approved bots can execute swaps

**Gas**: ~80k (~$8 @ 50 gwei, $2000 ETH)

### 2. Withdraw

```solidity
function withdraw(
    bytes32 contractStrategyId,
    address token,
    uint256 amount,        // 0 = withdraw all
    address recipient
) external
```

**Usage**:
```typescript
// Withdraw 500 USDT
await contract.withdraw(contractStrategyId, usdtAddress, parseUnits('500', 6), userAddress);

// Withdraw all
await contract.withdraw(contractStrategyId, usdtAddress, 0, userAddress);
```

**Authorization**: Only strategy owner  
**Gas**: ~60k (~$6)

### 3. Execute Swap

```solidity
function executeSwap(
    bytes32 contractStrategyId,
    address router,
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes calldata swapCalldata,
    uint256 nonce,
    bytes memory adminSignature
) external
```

**Authorization**: Strategy owner OR admin-signed bot  
**Gas**: ~200-300k (~$20-30)

**Bot Execution**:
```typescript
// Backend bot signs swap
const messageHash = ethers.solidityPackedKeccak256(
  ['bytes32', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'address'],
  [contractStrategyId, router, tokenIn, tokenOut, amountIn, minAmountOut, nonce, contractAddress]
);
const signature = await adminWallet.signMessage(ethers.getBytes(messageHash));

// Execute swap (can be called by anyone with valid signature)
await contract.executeSwap(
  contractStrategyId,
  router,
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
  swapCalldata,
  nonce,
  signature
);
```

### 4. Whitelist Router (Admin)

```solidity
function setRouterWhitelist(
    bytes32 contractStrategyId,
    address router,
    bytes4 selector,
    bool status
) external
```

**Example**:
```typescript
// Whitelist 1inch swap function
const oneinchRouter = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const swapSelector = '0x12aa3caf'; // swap() function

await contract.setRouterWhitelist(contractStrategyId, oneinchRouter, swapSelector, true);
```

**Authorization**: Contract owner or strategy owner

---

## 🔐 Security Model

### 1. Strategy Isolation

```solidity
// Each user's balance is isolated per strategy
mapping(bytes32 => mapping(address => mapping(address => uint256))) public balances;
//       ↑               ↑                 ↑                 ↑
//   strategyId         user            token            balance

// Bot authorized for each strategy (admin-signed)
mapping(bytes32 => address) public strategyBot;
```

**Guarantee**: 
- Strategy A cannot access Strategy B's funds. Ever.
- Only admin-signed bots can execute swaps for a strategy.

### 2. Access Control

| Function | Strategy Owner | Bot (registered) | Admin Signs |
|----------|----------------|------------------|-------------|
| `deposit` (first) | ✅ | - | ✅ bot address |
| `deposit` (subsequent) | ✅ | - | ❌ |
| `withdraw` | ✅ | ❌ | ❌ |
| `executeSwap` | ✅ | ✅ | ❌ |
| `setRouterWhitelist` | ✅ | ❌ | ✅ (contract owner) |

### 3. Swap Safety

**Before Swap**:
- ✅ Verify router is whitelisted
- ✅ Verify function selector is whitelisted
- ✅ Verify signature (if not owner)
- ✅ Verify nonce (replay protection)
- ✅ Check sufficient balance

**During Swap**:
- ✅ Deduct balance before external call (CEI pattern)
- ✅ Limited approval to router
- ✅ Measure actual swap results

**After Swap**:
- ✅ Verify slippage protection
- ✅ Update balances with actual amounts
- ✅ Reset router approval to 0

### 4. Reentrancy Protection

All state-changing functions use `nonReentrant` modifier from OpenZeppelin.

### 5. Replay Protection

Each strategy has an incrementing nonce. Every bot swap increments it.

---

## 🚀 Deployment Guide

### Prerequisites

```bash
cd web3
npm install
```

### 🔧 Configuration

Create and configure `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Deployer wallet (needs ETH for gas)
MAINNET_PRIVATE_KEY=0x...

# Admin signer (backend wallet that signs bot registrations)
ADMIN_SIGNER_ADDRESS=0x...

# RPC endpoints
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# Etherscan API key (for contract verification)
ETHERSCAN_API_KEY=YOUR_KEY
```

**Important Notes:**
- `MAINNET_PRIVATE_KEY`: Deployer wallet (needs ~0.05 ETH for deployment)
- `ADMIN_SIGNER_ADDRESS`: Backend admin wallet (signs bot registrations)
- Keep these separate for security
- NEVER commit private keys to git

---

### 📦 Compile Contract

```bash
npx hardhat compile
```

Expected output:
```
Compiled 18 Solidity files successfully
```

---

### 🧪 Run Tests

```bash
npx hardhat test
```

Verify all tests pass before deployment.

---

### 🌐 Deployment Options

#### Option 1: Local Mainnet Fork (For Testing)

**Step 1: Start Hardhat Node with Mainnet Fork**

```bash
# Terminal 1: Start forked mainnet
npx hardhat node --fork https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Step 2: Deploy to Fork**

```bash
# Terminal 2: Deploy
npx hardhat run scripts/deploy-local-mainnet-fork.ts --network localhost
```

**What it does:**
- ✅ Deploys contract
- ✅ Configures security limits
- ✅ Tests deposit flow (buys USDT from Uniswap)
- ✅ Tests pause/unpause
- ✅ Saves deployment info

**Use case:** Full integration testing with real mainnet state

---

#### Option 2: Ethereum Mainnet (Production)

⚠️ **CRITICAL: Read carefully before deploying to mainnet**

**Pre-Deployment Checklist:**

```bash
# 1. Verify configuration
echo $ADMIN_SIGNER_ADDRESS
# Should show your backend admin wallet address

# 2. Check deployer balance
cast balance $DEPLOYER_ADDRESS --rpc-url $MAINNET_RPC_URL
# Need at least 0.05 ETH

# 3. Verify network
cast chain-id --rpc-url $MAINNET_RPC_URL
# Should show: 1 (mainnet)

# 4. Test on testnet FIRST
npx hardhat run scripts/deploy-mainnet.ts --network sepolia
```

**Deploy to Mainnet:**

```bash
npx hardhat run scripts/deploy-mainnet.ts --network mainnet
```

**Script Features:**
- ✅ Configuration validation
- ✅ Pre-deployment confirmation (10 second delay)
- ✅ Security limits configuration
- ✅ Optional pause on deployment
- ✅ Saves deployment info to `deployments/mainnet-{timestamp}.json`
- ✅ Post-deployment verification

**Expected Output:**
```
════════════════════════════════════════════════════════════
🚀 MANGROVE STRATEGY TRADING - MAINNET DEPLOYMENT
════════════════════════════════════════════════════════════

📋 Network Information:
──────────────────────────────────────────────────────────
Network:           mainnet
Chain ID:          1
Deployer:          0x...
Deployer Balance:  0.1 ETH
Block Number:      18500000

⚠️  MAINNET DEPLOYMENT CONFIRMATION
⚠️  This is MAINNET (Chain ID: 1)
⚠️  Please verify all details above
⚠️  Proceeding in 10 seconds... (Ctrl+C to cancel)

📦 STEP 1: Deploying Contract
──────────────────────────────────────────────────────────
✅ Contract deployed!
   Address: 0x...
   Tx Hash: 0x...

🔍 STEP 2: Verifying Deployment
──────────────────────────────────────────────────────────
✅ All verifications passed

⚙️  STEP 3: Configuring Security Limits
──────────────────────────────────────────────────────────
✅ Security limits configured

════════════════════════════════════════════════════════════
✅ DEPLOYMENT SUCCESSFUL!
════════════════════════════════════════════════════════════
```

**Save the deployment info!** It's saved to `deployments/mainnet-{timestamp}.json`

---

### ✅ Verify Contract on Etherscan

After deployment, verify your contract:

```bash
npx hardhat verify --network mainnet \
  0xCONTRACT_ADDRESS \
  0xADMIN_SIGNER_ADDRESS
```

Example:
```bash
npx hardhat verify --network mainnet \
  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb \
  0x1234567890123456789012345678901234567890
```

**Successful verification output:**
```
Successfully submitted source code for contract
Waiting for verification result...

Successfully verified contract on Etherscan.
https://etherscan.io/address/0x...#code
```

---

### 🔐 Post-Deployment Security

#### 1. Test with Small Amount First

```typescript
// Test with 10 USDT
const testAmount = 10n * 10n**6n; // 10 USDT

// User approves
await usdt.approve(contractAddress, testAmount);

// Admin signs bot for user
const messageHash = ethers.solidityPackedKeccak256(
  ["address", "address"],
  [botAddress, userAddress]
);
const adminSignature = await adminWallet.signMessage(ethers.getBytes(messageHash));

// User deposits
await contract.deposit(
  usdtAddress,
  testAmount,
  botAddress,
  adminSignature
);

// Verify balance
const balance = await contract.getBalance(userAddress, botAddress, usdtAddress);
console.log(`Balance: ${balance}`); // Should be 10000000 (10 USDT)
```

#### 2. Configure Security Limits

```typescript
// Update security limits based on your needs
const maxGasPrice = ethers.parseUnits("200", "gwei");  // 200 gwei max
const maxSwapAmount = 50000n * 10n**6n;                 // 50k USDT max

await contract.setSecurityLimits(maxGasPrice, maxSwapAmount);
```

#### 3. Pause If Needed

```typescript
// In case of emergency or suspicious activity
await contract.pause();

// Resume when ready
await contract.unpause();
```

#### 4. Monitor Events

```typescript
// Listen for deposits
contract.on("Deposited", (user, bot, token, amount) => {
  console.log(`Deposit: ${user} → ${ethers.formatUnits(amount, 6)} USDT`);
});

// Listen for swaps
contract.on("SwapExecuted", (user, bot, router, tokenIn, tokenOut, amountIn, amountOut) => {
  console.log(`Swap: ${ethers.formatUnits(amountIn, 6)} → ${ethers.formatUnits(amountOut, 6)}`);
});

// Listen for emergency pause
contract.on("EmergencyPaused", (by) => {
  console.log(`⚠️ Contract paused by ${by}`);
  // Send alert to team
});
```

---

### 🔄 Transfer Ownership (Optional)

If you want to transfer contract ownership to a multisig or different address:

```typescript
// Transfer ownership
await contract.transferOwnership("0xNEW_OWNER_ADDRESS");

// Verify new owner
const newOwner = await contract.owner();
console.log(`New owner: ${newOwner}`);
```

⚠️ **Warning:** Be extremely careful with ownership transfer. The new owner controls:
- Security limits
- Pause/unpause
- Emergency withdrawals

---

### 📊 Gas Cost Estimates

| Network | Deployment | Deposit | Swap | Withdraw |
|---------|-----------|---------|------|----------|
| Ethereum Mainnet | ~0.03 ETH | ~$8 | ~$20-30 | ~$6 |
| Arbitrum | ~0.001 ETH | ~$0.50 | ~$1-2 | ~$0.30 |
| Optimism | ~0.001 ETH | ~$0.50 | ~$1-2 | ~$0.30 |
| Base | ~0.001 ETH | ~$0.40 | ~$1-2 | ~$0.25 |
| Polygon | ~0.05 MATIC | ~$0.10 | ~$0.30 | ~$0.08 |

*Estimated at moderate gas prices*

---

### 🛠️ Deployment Scripts

Two deployment scripts are provided:

#### 1. `scripts/deploy-local-mainnet-fork.ts`
- **Purpose:** Testing with mainnet fork
- **Features:** Full integration test with real tokens
- **Usage:** `npx hardhat run scripts/deploy-local-mainnet-fork.ts --network localhost`

#### 2. `scripts/deploy-mainnet.ts`
- **Purpose:** Production deployment
- **Features:** Validation, confirmation, safety checks
- **Usage:** `npx hardhat run scripts/deploy-mainnet.ts --network mainnet`

---

### 🚨 Troubleshooting

#### Issue: "Insufficient funds for gas"
```bash
# Check deployer balance
cast balance $DEPLOYER_ADDRESS --rpc-url $MAINNET_RPC_URL

# Need at least 0.05 ETH
```

#### Issue: "Admin signer address not set"
```bash
# Verify .env configuration
cat .env | grep ADMIN_SIGNER_ADDRESS

# Should show: ADMIN_SIGNER_ADDRESS=0x...
```

#### Issue: "Contract verification failed"
```bash
# Wait 1-2 minutes after deployment
sleep 120

# Try verification again
npx hardhat verify --network mainnet 0xCONTRACT_ADDRESS 0xADMIN_SIGNER_ADDRESS
```

#### Issue: "Fork test fails"
```bash
# Ensure you have a good RPC
# Free RPCs often rate-limit, use Alchemy or Infura

# Check RPC connectivity
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $MAINNET_RPC_URL
```

---

### 📝 Deployment Checklist

Before mainnet deployment:

- [ ] All tests pass (`npx hardhat test`)
- [ ] Deployed and tested on Sepolia testnet
- [ ] Admin signer address verified
- [ ] Deployer has sufficient ETH (0.05+)
- [ ] RPC endpoint configured and tested
- [ ] Team notified about deployment
- [ ] Monitoring systems ready
- [ ] Emergency pause plan in place
- [ ] Contract verified on Etherscan
- [ ] Small amount test completed
- [ ] Security limits configured
- [ ] Ownership transferred (if needed)

---

### 🎯 Quick Start Commands

```bash
# Complete deployment workflow

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Compile
npx hardhat compile

# 4. Test
npx hardhat test

# 5. Deploy to testnet (Sepolia)
npx hardhat run scripts/deploy-mainnet.ts --network sepolia

# 6. Verify on testnet
npx hardhat verify --network sepolia 0xCONTRACT_ADDR 0xADMIN_SIGNER

# 7. Test thoroughly on testnet

# 8. Deploy to mainnet
npx hardhat run scripts/deploy-mainnet.ts --network mainnet

# 9. Verify on mainnet
npx hardhat verify --network mainnet 0xCONTRACT_ADDR 0xADMIN_SIGNER

# 10. Test with small amounts

# 11. Go live!
```

---

## 💻 Backend Integration

### Database Schema

Add to `strategy.strategies`:

```sql
ALTER TABLE strategy.strategies 
ADD COLUMN IF NOT EXISTS contract_strategy_id TEXT,
ADD COLUMN IF NOT EXISTS bot_address TEXT,
ADD COLUMN IF NOT EXISTS bot_private_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS on_chain_nonce INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_on_chain_sync TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_strategies_contract_id 
ON strategy.strategies(contract_strategy_id);
```

### Generate contractStrategyId

```go
import (
    "github.com/ethereum/go-ethereum/crypto"
    "github.com/google/uuid"
)

func GenerateContractStrategyID(strategyUUID uuid.UUID) string {
    // Convert UUID to bytes32 using keccak256
    hash := crypto.Keccak256Hash([]byte(strategyUUID.String()))
    return hash.Hex() // Returns "0x..."
}
```

### Strategy Creation Flow

```go
func (s *StrategyService) CreateStrategy(ctx context.Context, req *CreateStrategyRequest) error {
    // 1. Generate bot key pair
    botPrivateKey, err := crypto.GenerateKey()
    if err != nil {
        return err
    }
    botAddress := crypto.PubkeyToAddress(botPrivateKey.PublicKey).Hex()
    
    // 2. Encrypt bot private key with KMS
    encryptedKey, err := s.kms.Encrypt(crypto.FromECDSA(botPrivateKey))
    if err != nil {
        return err
    }
    
    // 3. Create strategy in database
    strategyID := uuid.New()
    contractStrategyID := GenerateContractStrategyID(strategyID)
    
    strategy := &Strategy{
        ID:                    strategyID,
        UserID:                req.UserID,
        ContractStrategyID:    contractStrategyID,
        BotAddress:            botAddress,
        BotPrivateKeyEncrypted: encryptedKey,
        Status:                "ready_to_deploy",
        // ... other fields
    }
    
    if err := s.repo.Create(ctx, strategy); err != nil {
        return err
    }
    
    return nil
}
```

### Deposit Flow (User-Initiated)

```typescript
// Frontend: User initiates deposit
const contractStrategyId = await getContractStrategyId(strategyId);

// User approves
const tx1 = await usdtContract.approve(contractAddress, amount);
await tx1.wait();

// User deposits
const tx2 = await tradingContract.deposit(contractStrategyId, usdtAddress, amount);
await tx2.wait();

// Backend: Listen for Deposited event
// Update live_balance in database
```

### Swap Flow (Bot-Initiated)

```go
func (s *OrderExecutor) ExecuteLiveSwap(ctx context.Context, order *Order) error {
    // 1. Get 1inch quote
    quote, err := s.oneInchClient.GetSwapTransaction(ctx, swapReq)
    if err != nil {
        return err
    }
    
    // 2. Get current nonce
    nonce, err := s.web3Client.GetStrategyNonce(ctx, order.ContractStrategyID)
    if err != nil {
        return err
    }
    
    // 3. Admin signs swap
    signature, err := s.signSwap(
        order.ContractStrategyID,
        quote.Router,
        order.TokenIn,
        order.TokenOut,
        order.AmountIn,
        quote.MinAmountOut,
        nonce,
    )
    if err != nil {
        return err
    }
    
    // 4. Execute swap on-chain
    txHash, err := s.web3Client.ExecuteSwap(ctx, ExecuteSwapParams{
        ContractStrategyID: order.ContractStrategyID,
        Router:            quote.Router,
        TokenIn:           order.TokenIn,
        TokenOut:          order.TokenOut,
        AmountIn:          order.AmountIn,
        MinAmountOut:      quote.MinAmountOut,
        SwapCalldata:      quote.Tx.Data,
        Nonce:             nonce,
        AdminSignature:    signature,
    })
    if err != nil {
        return err
    }
    
    // 5. Wait for confirmation
    receipt, err := s.web3Client.WaitForTransaction(ctx, txHash, 2) // 2 confirmations
    if err != nil {
        return err
    }
    
    // 6. Parse SwapExecuted event and update database
    // ...
    
    return nil
}

func (s *OrderExecutor) signSwap(
    contractStrategyID string,
    router string,
    tokenIn string,
    tokenOut string,
    amountIn *big.Int,
    minAmountOut *big.Int,
    nonce uint64,
) ([]byte, error) {
    // Pack data
    data := append(
        common.HexToHash(contractStrategyID).Bytes(),
        common.HexToAddress(router).Bytes()...,
    )
    data = append(data, common.HexToAddress(tokenIn).Bytes()...)
    data = append(data, common.HexToAddress(tokenOut).Bytes()...)
    data = append(data, common.LeftPadBytes(amountIn.Bytes(), 32)...)
    data = append(data, common.LeftPadBytes(minAmountOut.Bytes(), 32)...)
    data = append(data, common.LeftPadBytes(new(big.Int).SetUint64(nonce).Bytes(), 32)...)
    data = append(data, common.HexToAddress(s.contractAddress).Bytes()...)
    
    // Hash
    hash := crypto.Keccak256Hash(data)
    
    // Sign
    signature, err := crypto.Sign(hash.Bytes(), s.adminPrivateKey)
    if err != nil {
        return nil, err
    }
    
    // Adjust v value for Ethereum
    if signature[64] < 27 {
        signature[64] += 27
    }
    
    return signature, nil
}
```

### Balance Sync

```go
// Periodically sync on-chain balances to database
func (s *StrategyService) SyncOnChainBalance(ctx context.Context, strategyID uuid.UUID) error {
    strategy, err := s.repo.GetByID(ctx, strategyID)
    if err != nil {
        return err
    }
    
    // Get on-chain balance
    balance, err := s.web3Client.GetBalance(
        ctx,
        strategy.ContractStrategyID,
        strategy.UserAddress,
        USDT_ADDRESS,
    )
    if err != nil {
        return err
    }
    
    // Update database
    return s.repo.UpdateLiveBalance(ctx, strategyID, balance.String())
}
```

---

## 🧪 Testing

Run comprehensive test suite:

```bash
npm test
```

Tests cover:
- ✅ Deposit (owner, non-owner, zero amount)
- ✅ Withdrawal (partial, full, exceeding balance)
- ✅ Swap execution (owner, bot signature, invalid signature)
- ✅ Router whitelisting
- ✅ Strategy isolation
- ✅ Replay protection (nonce)
- ✅ Access control

---

## 📊 Gas Costs

Estimated at 50 gwei, ETH @ $2000:

| Operation | Gas | Cost (ETH) | Cost (USD) |
|-----------|-----|-----------|-----------|
| Deposit | ~80k | 0.004 | $8 |
| Withdraw | ~60k | 0.003 | $6 |
| Swap | ~200-300k | 0.01-0.015 | $20-30 |
| Whitelist | ~50k | 0.0025 | $5 |

**Tip**: Deploy on L2 (Arbitrum, Optimism, Base) for 10-100x lower costs.

---

## 🔄 Strategy Lifecycle

```
┌────────────────────────────────────────────────────────────┐
│                    BACKEND (PostgreSQL)                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User creates strategy via UI                           │
│     ├─ Generate contractStrategyId                         │
│     ├─ Store in DB                                         │
│     └─ Status: "ready_to_deploy"                           │
│                                                             │
│  2. User decides to go live                                │
│     ├─ Backend shows deposit instructions                  │
│     └─ User approves + deposits from their wallet          │
│                                                             │
│  3. Backend monitors Deposited event                       │
│     ├─ Update live_balance in DB                           │
│     └─ Status: "active"                                    │
│                                                             │
│  4. Strategy generates signals                             │
│     └─ Backend executes swaps (bot-signed)                 │
│                                                             │
│  5. User pauses strategy (backend only)                    │
│     ├─ Status: "paused"                                    │
│     └─ Backend stops executing swaps                       │
│                                                             │
│  6. User resumes (backend only)                            │
│     └─ Status: "active"                                    │
│                                                             │
│  7. User stops and withdraws                               │
│     ├─ Status: "stopped"                                   │
│     └─ User calls withdraw() from their wallet             │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Key**: Backend manages strategy status, contract only holds funds.

---

## ⚠️ Important Security Notes

### For Production

1. **Admin Private Key**
   - Use AWS KMS or hardware wallet
   - Never commit to git
   - Rotate periodically

2. **Router Whitelisting**
   - Only whitelist audited DEXs (1inch, Uniswap, etc.)
   - Whitelist specific function selectors
   - Review before whitelisting new routers

3. **Transaction Monitoring**
   - Monitor all SwapExecuted events
   - Alert on failed swaps
   - Track gas costs

4. **User Education**
   - Users must understand non-custodial means they control keys
   - Users must approve contract before deposit
   - Users can withdraw anytime

5. **Auditing**
   - Get external security audit before mainnet
   - Test extensively on testnet
   - Consider bug bounty program

---

## 📝 Common Function Selectors

For whitelisting DEX routers:

```javascript
// 1inch v5
const ONEINCH_SWAP = '0x12aa3caf'; // swap()

// Uniswap V2
const UNISWAP_V2_SWAP = '0x38ed1739'; // swapExactTokensForTokens()

// Uniswap V3
const UNISWAP_V3_EXACT_INPUT = '0x414bf389'; // exactInputSingle()
const UNISWAP_V3_EXACT_OUTPUT = '0xdb3e2198'; // exactOutputSingle()
```

---

## 🛠️ Development Scripts

```bash
# Compile contracts
npm run compile

# Run tests
npm test

# Deploy to local network
npm run deploy:local

# Deploy to testnet
npm run deploy:sepolia

# Deploy to mainnet (⚠️ audit first!)
npm run deploy:mainnet

# Verify contract
npm run verify:sepolia -- 0xCONTRACT_ADDR 0xADMIN_SIGNER

# Clean artifacts
npm run clean
```

---

## 📚 File Structure

```
web3/
├── contracts/
│   ├── MangroveStrategyTrading.sol    # Main contract
│   └── mint.sol                        # Test USDT token
├── scripts/
│   ├── deploy-strategy-trading.ts     # Deployment script
│   └── interact-example.ts            # Usage examples
├── test/
│   └── MangroveStrategyTrading.test.ts # Test suite
├── hardhat.config.ts                   # Hardhat config
├── package.json                        # Dependencies
├── tsconfig.json                       # TypeScript config
└── README.md                           # This file
```

---

## ✅ Implementation Complete

### What's Built

- ✅ Production-grade Solidity contract (0.8.20)
- ✅ Minimal design (only deposit/withdraw/swap)
- ✅ Strategy isolation enforced
- ✅ Non-custodial wallet support
- ✅ Bot execution with admin signatures
- ✅ Swap whitelisting
- ✅ Replay protection (nonces)
- ✅ Comprehensive tests
- ✅ Deployment scripts
- ✅ Backend integration examples

### What's NOT Included (By Design)

- ❌ Strategy creation in contract (backend manages this)
- ❌ Strategy status in contract (backend manages this)
- ❌ Bot key storage in contract (backend manages this)
- ❌ Native ETH support (use WETH)
- ❌ Upgradability (immutable contract)

---

## 📞 Next Steps

1. **Review** this implementation
2. **Test** on testnet thoroughly
3. **Integrate** with backend (use examples above)
4. **Audit** before mainnet deployment
5. **Deploy** to testnet → mainnet

---

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with security, simplicity, and user control in mind.**
