require("@babel/register");
require("@babel/polyfill");

const HDWalletProvider = require("truffle-hdwallet-provider");
const ProviderWrapper = require("@eth-optimism/ovm-truffle-provider-wrapper");

const keys = [
  "0x0355596cdb5e5242ad082c4fe3f8bbe48c9dba843fe1f99dd8272f487e70efae",
  "0xe9aebe8791ad1ebd33211687e9c53f13fe8cca53b271a6529c7d7ba05eda5ce2",
  "0x6f36842c663f5afc0ef3ac986ec62af9d09caa1bbf59a50cdb7334c9cc880e65",
  "0xf184b7741073fc5983df87815e66425928fa5da317ef18ef23456241019bd9c7",
  "0x7770023bfebe3c8e832b98d6c0874f75580730baba76d7ec05f2780444cc7ed3",
  "0xa9442c0092fe38933fcf2319d5cf9fd58e3be5409a26e2045929f9d2a16fb090",
  "0x06af2c8000ab1b096f2ee31539b1e8f3783236eba5284808c2b17cfb49f0f538",
  "0x7edaec9e5f8088a10b74c1d86108ce879dccded88fa9d4a5e617353d2a88e629",
  "0xe31c452e0631f67a629e88790d3119ea9505fae758b54976d2bf12bd8300ef4a",
  "0x5e383d2f98ac821c555333e5bb6109ca41ae89d613cb84887a2bdb933623c4e3",
  "0x33d2f6f6cc410c1d46d58f17efdd2b53a71527b27eaa7f2edcade351feb87425",
  "0x32400a48ff16119c134eef44e2627502ce6e367bc4810be07642275a9db47bf7",
  "0x2a0f58ae46261b4ec4b635bde4bfabb680245c2a3abff7f54945ae44f7629b1d",
  "0x94fe165ae1db4f7d24fa5506ecbf083dcb934823600cb56e2a191722f0b40903",
  "0xc93aad16dd4aca2fa61316f83307362306ad6b2fc3e4a91801ce9010be7d9b63",
  "0x27f8f0be23a027196c7b8f4c98502b113e3fa1474fc10eda21ef3b5473c1b773",
  "0xb6245e0d2b64a92c0e6359500231087278f499de46fdfa351d4f1e09faf95a47",
  "0xfe6066af949ec3c2c88ac10f47907c6d4e200c37b28b5af49e7d0ffd5c301c5c",
];

process.env.EXECUTION_MANAGER_ADDRESS = process.env.EXECUTION_MANAGER_ADDRESS || "0xA193E42526F1FEA8C99AF609dcEabf30C1c29fAA";

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: "*",
      skipDryRun: true,
      provider: () => {
        return ProviderWrapper.wrapProviderAndStartLocalNode(new HDWalletProvider(keys, "http://127.0.0.1:8545/"));
      },
    },
    integration: {
      host: "localhost",
      port: 8545,
      gasPrice: 0,
      network_id: 1998,
      skipDryRun: true,
    },
    coverage: {
      host: "localhost",
      port: 8555,
      network_id: 1999,
      skipDryRun: true,
    },
    goerliFork: {
      host: "localhost",
      port: 8605,
      gasPrice: 0,
      network_id: "5",
    },
    mainnetFork: {
      host: "localhost",
      port: 8601,
      gasPrice: 0,
      network_id: "1",
    },
    goerli: {
      provider: () => {
        return new HDWalletProvider("replace-with-private-key-when-using", "https://goerli.infura.io/v3/e21146aa267845a2b7b4da025178196d");
      },
      network_id: "5",
    },
    mainnet: {
      provider: () => {
        return new HDWalletProvider("replace-with-private-key-when-using", "https://mainnet.infura.io/v3/e21146aa267845a2b7b4da025178196d");
      },
      network_id: "1",
    },
  },
  mocha: {
    reporter: "mocha-circleci-reporter",
    reporterOptions: {
      currency: "USD",
      gasPrice: 5,
      onlyCalledMethods: true,
      excludeContracts: ["Migrations"],
    },
    slow: 1000,
  },
  compilers: {
    solc: {
      // Add path to the solc-transpiler
      version: "./node_modules/@eth-optimism/solc-transpiler",
    },
  },
  plugins: ["truffle-security", "solidity-coverage"],
};
