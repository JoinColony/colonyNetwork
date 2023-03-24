/* globals artifacts */
const fs = require("fs");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const Promise = require("bluebird");

const exec = Promise.promisify(require("child_process").exec);

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");

const setupBridging = require("../../scripts/setup-bridging-contracts");

contract("Cross-chain", () => {
  let homeColony;
  let foreignColony;
  let homeColonyNetwork;
  let foreignColonyNetwork;
  let homeBridge;
  let foreignBridge;
  let gnosisSafe;
  let zodiacBridge;
  let bridgeMonitor;
  let foreignChainId;

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  const TRUFFLE_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
  const OTHER_RPC_PORT = 8546;

  const HOME_PORT = process.env.TRUFFLE_FOREIGN === "true" ? OTHER_RPC_PORT : TRUFFLE_PORT;
  const FOREIGN_PORT = process.env.TRUFFLE_FOREIGN === "true" ? TRUFFLE_PORT : OTHER_RPC_PORT;

  const foreignRpcUrl = `http://127.0.0.1:${FOREIGN_PORT}`;
  const homeRpcUrl = `http://127.0.0.1:${HOME_PORT}`;

  const ethersForeignSigner = new ethers.providers.JsonRpcProvider(foreignRpcUrl).getSigner();
  const ethersHomeSigner = new ethers.providers.JsonRpcProvider(homeRpcUrl).getSigner();

  before(async () => {
    await exec(`PORT=${FOREIGN_PORT} bash ./scripts/setup-foreign-chain.sh`);

    ({ bridgeMonitor, gnosisSafe, zodiacBridge, homeBridge, foreignBridge } = await setupBridging(homeRpcUrl, foreignRpcUrl));

    // Deploy colonyNetwork to whichever chain truffle hasn't already deployed to.
    try {
      await exec(`SOLIDITY_COVERAGE="" npx truffle compile --all`);
      await exec(`SOLIDITY_COVERAGE="" npm run provision:token:contracts`);
      await exec(`SOLIDITY_COVERAGE="" npm run provision:safe:contracts`);
      await exec(`npx truffle migrate --network development2`);
    } catch (err) {
      console.log(err);

      process.exit();
    }

    // Add bridge to the foreign colony network
    const homeNetworkId = await ethersHomeSigner.provider.send("net_version", []);
    // const homeChainId = await ethersHomeSigner.provider.send("eth_chainId", []);

    const foreignNetworkId = await ethersForeignSigner.provider.send("net_version", []);
    foreignChainId = await ethersForeignSigner.provider.send("eth_chainId", []);

    let etherRouterInfo;
    // 0x539 is the chain id used by truffle by default (regardless of networkid), and if
    // we see it in our tests that's the coverage chain, which builds the contract artifacts
    // in to a different location. If we see another chain id, we assume it's non-coverage
    // truffle and look for the build artifacts in the normal place.
    if (process.env.SOLIDITY_COVERAGE && process.env.TRUFFLE_FOREIGN === "false") {
      etherRouterInfo = JSON.parse(fs.readFileSync("./build-coverage/contracts/EtherRouter.json"));
    } else {
      etherRouterInfo = JSON.parse(fs.readFileSync("./build/contracts/EtherRouter.json"));
    }
    const homeEtherRouterAddress = etherRouterInfo.networks[homeNetworkId.toString()].address;
    homeColonyNetwork = await new ethers.Contract(homeEtherRouterAddress, IColonyNetwork.abi, ethersHomeSigner);

    if (process.env.SOLIDITY_COVERAGE && process.env.TRUFFLE_FOREIGN === "true") {
      etherRouterInfo = JSON.parse(fs.readFileSync("./build-coverage/contracts/EtherRouter.json"));
    } else {
      etherRouterInfo = JSON.parse(fs.readFileSync("./build/contracts/EtherRouter.json"));
    }
    const foreignEtherRouterAddress = etherRouterInfo.networks[foreignNetworkId.toString()].address;
    foreignColonyNetwork = await new ethers.Contract(foreignEtherRouterAddress, IColonyNetwork.abi, ethersForeignSigner);

    console.log("foreign colony network", foreignColonyNetwork.address);

    const foreignMCAddress = await foreignColonyNetwork.getMetaColony();
    const foreignMetacolony = await new ethers.Contract(foreignMCAddress, IMetaColony.abi, ethersForeignSigner);
    const homeMCAddress = await homeColonyNetwork.getMetaColony();
    const homeMetacolony = await new ethers.Contract(homeMCAddress, IMetaColony.abi, ethersHomeSigner);

    let tx = await foreignMetacolony.setBridgeData(
      foreignBridge.address, // bridge address
      "0x", // log before
      "0x", // log after
      1000000, // gas
      100, // chainid
      `0xdc8601b3000000000000000000000000${homeColonyNetwork.address.slice(
        2
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000044`, // skill before
      // )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000004c4b400000000000000000000000000000000000000000000000000000000000000044`, // skill before //eslint-disable-line max-len
      "0x00000000000000000000000000000000000000000000000000000000", // skill after
      "0x", // root hash before
      "0x" // root hash after
    );

    await tx.wait();

    tx = await homeMetacolony.setBridgeData(
      homeBridge.address, // bridge address
      "0x", // log before
      "0x", // log after
      1000000, // gas
      foreignChainId, // chainid
      `0x`, // skill before
      "0x", // skill after
      "0x", // root hash before
      "0x" // root hash after
    );

    await tx.wait();
  });

  async function setupColony(colonyNetworkEthers) {
    let tx = await colonyNetworkEthers.deployTokenViaNetwork("Test", "TST", 18);
    let res = await tx.wait();

    console.log(res);
    const { tokenAddress } = res.events.filter((x) => x.event === "TokenDeployed")[0].args;
    // token = await new ethers.Contract(tokenAddress, Token.abi, ethersHomeSigner);

    tx = await colonyNetworkEthers["createColony(address,uint256,string,string)"](tokenAddress, 0, "", "");
    res = await tx.wait();

    const { colonyAddress } = res.events.filter((x) => x.event === "ColonyAdded")[0].args;

    const colony = await new ethers.Contract(colonyAddress, IColony.abi, colonyNetworkEthers.signer);
    return colony;
  }

  beforeEach(async () => {
    // Set up a colony on the home chain. That may or may not be the truffle chain...
    homeColony = await setupColony(homeColonyNetwork);

    foreignColony = await setupColony(foreignColonyNetwork);
  });

  after(async () => {
    await bridgeMonitor.close();
  });

  describe("when controlling a gnosis wallet on another chain", async () => {
    it("can send tokens out of the gnosis safe", async () => {
      // Create token contract on foreign chain

      const tokenFactory = new ethers.ContractFactory(Token.abi, Token.bytecode, ethersForeignSigner);
      const fToken = await tokenFactory.deploy("Test", "TST", 18);
      await fToken.deployTransaction.wait();
      await fToken.unlock();
      // Send some to safe
      // console.log(fToken);
      await fToken["mint(address,uint256)"](gnosisSafe.address, 100);

      // We want the safe to execute this transaction...
      const txDataToExecuteFromSafe = await fToken.interface.encodeFunctionData("transfer", [ADDRESS_ZERO, 10]);
      // Which we trigger by sending a transaction to the module...
      const txDataToBeSentToZodiacModule = zodiacBridge.interface.encodeFunctionData("executeTransaction", [
        fToken.address,
        0,
        txDataToExecuteFromSafe,
        0,
      ]);
      // Which we trigger by sending a transaction to the module...

      // So what's the tx data for what we want the colony to call on the amb?
      const txDataToBeSentToAMB = homeBridge.interface.encodeFunctionData("requireToPassMessage", [
        zodiacBridge.address,
        txDataToBeSentToZodiacModule,
        1000000,
      ]);
      // Which we trigger by sending a transaction to the module...

      // Set up promise that will see it bridged across
      const p = new Promise((resolve) => {
        foreignBridge.on("RelayedMessage", async (_sender, msgSender, _messageId, success) => {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          resolve();
        });
      });

      // So 'just' call that on the colony...

      console.log("tx to home bridge address:", homeBridge.address);
      const tx = await homeColony.makeArbitraryTransaction(homeBridge.address, txDataToBeSentToAMB);
      await tx.wait();
      await p;
      // Check balances
      const b1 = await fToken.balanceOf(gnosisSafe.address);
      expect(b1.toNumber()).to.equal(90);
      const b2 = await fToken.balanceOf(ADDRESS_ZERO);
      expect(b2.toNumber()).to.equal(10);
    });
  });

  describe("when adding skills on another chain", async () => {
    it("can create a skill on another chain and it's reflected on the home chain", async () => {
      const t = homeColonyNetwork.interface.encodeFunctionData("addSkillFromBridge", [0x666666, 0x88888888]);
      console.log(t);
      const txDataToBeSentToAMB = homeBridge.interface.encodeFunctionData("requireToPassMessage", [homeColonyNetwork.address, t, 1000000]);
      console.log(txDataToBeSentToAMB);

      // See skills on home chain
      const beforeCount = await homeColonyNetwork.getSkillCount();

      const p = new Promise((resolve, reject) => {
        homeBridge.on("RelayedMessage", async (_sender, msgSender, _messageId, success) => {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          if (!success) {
            console.log("bridged transaction did not succeed");
            await reject(new Error("Bridged transaction did not succeed"));
          }
          resolve();
        });
      });

      // Create a skill on foreign chain
      // await foreignColony.addDomain(1);
      const foreignBeforeCount = await foreignColonyNetwork.getSkillCount();
      const tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      console.log(tx);
      const res = await tx.wait();
      console.log(res);

      const foreignAfterCount = await foreignColonyNetwork.getSkillCount();
      console.log(foreignBeforeCount, foreignAfterCount);
      await p;

      // Check reflected on home chain
      const afterCount = await homeColonyNetwork.getSkillCount();
      console.log(beforeCount, afterCount);

      const pendingParent = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignAfterCount);
      console.log(pendingParent);
      // expect(beforeCount.toNumber() + 1).to.equal(afterCount.toNumber());
      expect(pendingParent.toNumber()).to.not.equal(0);
    });
  });
});
