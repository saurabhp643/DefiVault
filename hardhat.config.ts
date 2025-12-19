import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800, // Runtime-optimized (good for production)
      },

      viaIR: true, // Enables IR-based optimizer (important for caching cases)

      // 🔽 IMPORTANT ADDITIONS (compile-time insight)
      outputSelection: {
        '*': {
          '*': [
            'abi',
            'evm.bytecode',
            'evm.deployedBytecode',
            'evm.assembly',        // 👈 inspect SLOAD/MLOAD
            'evm.methodIdentifiers',
            'storageLayout',       // 👈 slot + packing analysis
            'ir',                  // 👈 Yul IR
            'irOptimized'
          ],
        },
      },
    },
  },

  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
      timeout: 120000,
      gasPrice: 'auto',
      gas: 'auto',
    },

    hardhat: {
      forking: {
        url: "https://eth-mainnet.g.alchemy.com/v2/ipt6875EFYV7HNNFMycMQ",
        blockNumber: 20000000,
      },
      allowUnlimitedContractSize: true,
      gasPrice: 50000000000, // 50 gwei
      blockGasLimit: 15000000,
      gas: 12000000,
    },

    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 11155111,
      gasPrice: 'auto',
      timeout: 120000,
    },

    goerli: {
      url: process.env.GOERLI_RPC_URL || 'https://rpc.ankr.com/eth_goerli',
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 5,
    },

    mainnet: {
      url:
        process.env.MAINNET_RPC_URL ||
        `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 1,
    },

    polygon: {
      url:
        process.env.POLYGON_RPC_URL ||
        `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 137,
    },

    arbitrum: {
      url:
        process.env.ARBITRUM_RPC_URL ||
        `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 42161,
    },

    optimism: {
      url:
        process.env.OPTIMISM_RPC_URL ||
        `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 10,
    },

    base: {
      url:
        process.env.BASE_RPC_URL ||
        `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 8453,
    },
  },

  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || '',
      sepolia: process.env.ETHERSCAN_API_KEY || '',
      goerli: process.env.ETHERSCAN_API_KEY || '',
      polygon: process.env.POLYGONSCAN_API_KEY || '',
      arbitrumOne: process.env.ARBISCAN_API_KEY || '',
      optimisticEthereum: process.env.OPTIMISM_API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
    },
  },

  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },

  mocha: {
    timeout: 40000,
  },
};

export default config;
