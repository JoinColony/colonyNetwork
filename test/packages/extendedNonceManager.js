/* globals artifacts, hre */

const { describe, it } = require("mocha");
const { ethers } = require("hardhat");
const { ExtendedNonceManager, RetryProvider } = require("../../packages/package-utils");
const { stopMining, mineBlock, startMining } = require("../../helpers/test-helper");

const MetaTxToken = artifacts.require("MetaTxToken");

describe("ExtendedNonceManager", () => {
  let nonceManager;
  const provider = new RetryProvider("http://localhost:8545");
  const wallet = new ethers.Wallet(hre.config.networks.hardhat.accounts[0].privateKey, provider);

  beforeEach(() => {
    nonceManager = new ExtendedNonceManager(wallet);
  });

  afterEach(async () => {
    nonceManager = null;
    await startMining();
  });

  it("should rebroadcast transactions correctly", async () => {
    // Deploy a contract we'll call
    const tokenFactory = new ethers.ContractFactory(MetaTxToken.abi, MetaTxToken.bytecode, nonceManager);
    const token = await tokenFactory.deploy("Test Token", "TT", 18);
    await stopMining();
    const res = await token["mint(uint256)"](1);
    const res2 = await token["mint(uint256)"](1);
    await provider.send("hardhat_dropTransaction", [res2.hash]);
    await startMining();
    await mineBlock();
    await res.wait();
    // This will only pass if it was rebroadcast
    await res2.wait();
  });
});
