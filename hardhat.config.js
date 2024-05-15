/* global hre, config, task, runSuper */

const fs = require("fs");
const path = require("path");

const express = require("express");
const bodyParser = require("body-parser");
const ethers = require("ethers");

const { FORKED_XDAI_CHAINID } = require("./helpers/constants");
require("@nomiclabs/hardhat-truffle5");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-ethers");
require("solidity-coverage");

task("compile", "Compile Colony contracts with pinned Token").setAction(async () => {
  await runSuper();

  const pinnedArtifacts = ["Token", "TokenAuthority", "MultiSigWallet"];
  const artifactSrc = path.resolve(__dirname, "lib/colonyToken/build/contracts");
  for (let i = 0; i < pinnedArtifacts.length; i += 1) {
    const artifact = pinnedArtifacts[i];
    const artifactDst = `${config.paths.artifacts}/colonyToken/${artifact}.sol`;

    if (!fs.existsSync(artifactDst)) {
      fs.mkdirSync(artifactDst, { recursive: true });
    }
    fs.copyFileSync(`${artifactSrc}/Pinned${artifact}.json`, `${artifactDst}/${artifact}.json`);
  }
});

task("node", "Run a node, and output ganache-accounts.json for backwards-compatability").setAction(async () => {
  console.log(config.networks.hardhat.accounts);
  console.log(ethers);
  const ganacheAccounts = { addresses: {}, private_keys: {} };
  // eslint-disable-next-line no-restricted-syntax
  for (const account of config.networks.hardhat.accounts) {
    const { privateKey } = account;
    const publicAddress = ethers.utils.computeAddress(privateKey);
    ganacheAccounts.addresses[publicAddress] = publicAddress;
    ganacheAccounts.private_keys[publicAddress] = privateKey;
  }

  fs.writeFileSync("ganache-accounts.json", JSON.stringify(ganacheAccounts, null, 2));

  await runSuper();
});

task("deploy", "Deploy Colony Network as per truffle-fixture.js").setAction(async () => {
  const deployNetwork = require("./test/truffle-fixture"); // eslint-disable-line global-require

  await deployNetwork();
});

task("coverage", "Run coverage with an open port").setAction(async () => {
  const app = express();
  const port = 8555;

  app.use(bodyParser.json());
  app.post("/", async function (req, res) {
    try {
      const response = await hre.network.provider.request(req.body);
      res.send({ jsonrpc: "2.0", result: response, id: req.body.id });
    } catch (error) {
      res.send({ jsonrpc: "2.0", error, id: req.body.id });
    }
  });
  app.listen(port, function () {
    console.log(`Exposing the provider on port ${port}!`);
  });

  await runSuper();
});

module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.25",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 100000000,
  },
  contractSizer: {
    strict: true,
  },
  networks: {
    development: {
      url: "http://localhost:8545",
      chainId: Number(process.env.CHAIN_ID) || 265669100,
      throwOnCallFailures: false,
      throwOnTransactionFailures: false,
      allowBlocksWithSameTimestamp: true,
      gas: 6721975,
      blockGasLimit: 6721975,
    },
    development2: {
      url: "http://localhost:8546",
      chainId: Number(process.env.CHAIN_ID) || 265669101,
      throwOnCallFailures: false,
      throwOnTransactionFailures: false,
      allowBlocksWithSameTimestamp: true,
      gas: 6721975 * 2,
      blockGasLimit: 6721975,
    },
    integration: {
      url: "http://localhost:8545",
      chainId: 265669100,
      throwOnCallFailures: false,
      throwOnTransactionFailures: false,
      allowBlocksWithSameTimestamp: true,
      gas: 6721975,
      blockGasLimit: 6721975,
    },
    hardhat: {
      chainId: Number(process.env.CHAIN_ID) || FORKED_XDAI_CHAINID, // Supports chainId tests
      throwOnCallFailures: false,
      throwOnTransactionFailures: false,
      allowBlocksWithSameTimestamp: true,
      allowUnlimitedContractSize: true,
      blockGasLimit: 6721975 * 2,
      hardfork: "shanghai",
      accounts: [
        { privateKey: "0x0355596cdb5e5242ad082c4fe3f8bbe48c9dba843fe1f99dd8272f487e70efae", balance: "100000000000000000000" },
        { privateKey: "0xe9aebe8791ad1ebd33211687e9c53f13fe8cca53b271a6529c7d7ba05eda5ce2", balance: "100000000000000000000" },
        { privateKey: "0x6f36842c663f5afc0ef3ac986ec62af9d09caa1bbf59a50cdb7334c9cc880e65", balance: "100000000000000000000" },
        { privateKey: "0xf184b7741073fc5983df87815e66425928fa5da317ef18ef23456241019bd9c7", balance: "100000000000000000000" },
        { privateKey: "0x7770023bfebe3c8e832b98d6c0874f75580730baba76d7ec05f2780444cc7ed3", balance: "100000000000000000000" },
        { privateKey: "0xa9442c0092fe38933fcf2319d5cf9fd58e3be5409a26e2045929f9d2a16fb090", balance: "100000000000000000000" },
        { privateKey: "0x06af2c8000ab1b096f2ee31539b1e8f3783236eba5284808c2b17cfb49f0f538", balance: "100000000000000000000" },
        { privateKey: "0x7edaec9e5f8088a10b74c1d86108ce879dccded88fa9d4a5e617353d2a88e629", balance: "100000000000000000000" },
        { privateKey: "0xe31c452e0631f67a629e88790d3119ea9505fae758b54976d2bf12bd8300ef4a", balance: "100000000000000000000" },
        { privateKey: "0x5e383d2f98ac821c555333e5bb6109ca41ae89d613cb84887a2bdb933623c4e3", balance: "100000000000000000000" },
        { privateKey: "0x33d2f6f6cc410c1d46d58f17efdd2b53a71527b27eaa7f2edcade351feb87425", balance: "100000000000000000000" },
        { privateKey: "0x32400a48ff16119c134eef44e2627502ce6e367bc4810be07642275a9db47bf7", balance: "100000000000000000000" },
        { privateKey: "0x2a0f58ae46261b4ec4b635bde4bfabb680245c2a3abff7f54945ae44f7629b1d", balance: "100000000000000000000" },
        { privateKey: "0x94fe165ae1db4f7d24fa5506ecbf083dcb934823600cb56e2a191722f0b40903", balance: "100000000000000000000" },
        { privateKey: "0xc93aad16dd4aca2fa61316f83307362306ad6b2fc3e4a91801ce9010be7d9b63", balance: "100000000000000000000" },
        { privateKey: "0x27f8f0be23a027196c7b8f4c98502b113e3fa1474fc10eda21ef3b5473c1b773", balance: "100000000000000000000" },
        { privateKey: "0xb6245e0d2b64a92c0e6359500231087278f499de46fdfa351d4f1e09faf95a47", balance: "100000000000000000000" },
        { privateKey: "0xfe6066af949ec3c2c88ac10f47907c6d4e200c37b28b5af49e7d0ffd5c301c5c", balance: "100000000000000000000" },
      ],
    },
  },
};
