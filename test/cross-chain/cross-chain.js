/* globals artifacts */
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const baseExec = require("child_process").exec;
const path = require("path");

const exec = function (command) {
  return new Promise((resolve, reject) => {
    const execCallback = (error, stdout) => {
      console.log("callback", error, stdout);
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    };
    baseExec(command, execCallback);
  });
};

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const setupBridging = require("../../scripts/setup-bridging-contracts");

const { MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");
const { forwardTime } = require("../../helpers/test-helper");
const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const { TruffleLoader } = require("../../packages/package-utils");

const contractLoader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts"),
});

contract("Cross-chain", (accounts) => {
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

  let web3HomeProvider;

  let client;

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  const TRUFFLE_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
  const OTHER_RPC_PORT = 8546;

  const HOME_PORT = process.env.TRUFFLE_FOREIGN === "true" ? OTHER_RPC_PORT : TRUFFLE_PORT;
  const FOREIGN_PORT = process.env.TRUFFLE_FOREIGN === "true" ? TRUFFLE_PORT : OTHER_RPC_PORT;

  const foreignRpcUrl = `http://127.0.0.1:${FOREIGN_PORT}`;
  const homeRpcUrl = `http://127.0.0.1:${HOME_PORT}`;

  const ethersForeignSigner = new ethers.providers.JsonRpcProvider(foreignRpcUrl).getSigner();
  const ethersHomeSigner = new ethers.providers.JsonRpcProvider(homeRpcUrl).getSigner();
  let etherRouterAddress;

  let getPromiseForNextNBridgedTransactions;

  before(async () => {
    await exec(`PORT=${FOREIGN_PORT} bash ./scripts/setup-foreign-chain.sh`);
    ({ bridgeMonitor, gnosisSafe, zodiacBridge, homeBridge, foreignBridge } = await setupBridging(homeRpcUrl, foreignRpcUrl));

    getPromiseForNextNBridgedTransactions = function (n) {
      return new Promise((resolve, reject) => {
        let count = 0;
        homeBridge.on("RelayedMessage", async (_sender, msgSender, _messageId, success) => {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          count += 1;
          if (!success) {
            console.log("bridged transaction did not succeed");
            await reject(new Error("Bridged transaction did not succeed"));
          }
          if (count >= n) {
            resolve();
          }
        });

        foreignBridge.on("RelayedMessage", async (_sender, msgSender, _messageId, success) => {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          count += 1;
          if (!success) {
            console.log("bridged transaction did not succeed");
            await reject(new Error("Bridged transaction did not succeed"));
          }
          if (count >= n) {
            resolve();
          }
        });
      });
    };

    // If Truffle is not on the home chain, then deploy colonyNetwork to the home chain
    if (process.env.TRUFFLE_FOREIGN === "true") {
      try {
        // await exec(`npm run provision:token:contracts`);
        const output = await exec(`npx hardhat deploy --network development2`);
        [, , , , , , , etherRouterAddress] = output
          .split("\n")
          .filter((x) => x.includes("Colony Network deployed at"))[0]
          .split(" ");
      } catch (err) {
        console.log(err);
        process.exit(1);
      }
    } else {
      etherRouterAddress = (await EtherRouter.deployed()).address;
    }
  });

  beforeEach(async () => {
    // Set up a colony on the home chain. That may or may not be the truffle chain...
    const colonyNetworkEthers = await new ethers.Contract(etherRouterAddress, IColonyNetwork.abi, ethersHomeSigner);

    const foreignMCAddress = await foreignColonyNetwork.getMetaColony();
    const foreignMetacolony = await new ethers.Contract(foreignMCAddress, IMetaColony.abi, ethersForeignSigner);
    const homeMCAddress = await homeColonyNetwork.getMetaColony();
    const homeMetacolony = await new ethers.Contract(homeMCAddress, IMetaColony.abi, ethersHomeSigner);

    let tx = await foreignMetacolony.setBridgeData(
      foreignBridge.address, // bridge address
      `0xdc8601b3000000000000000000000000${homeColonyNetwork.address.slice(
        2,
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000084`, // log before
      "0x00000000000000000000000000000000000000000000000000000000", // log after
      1000000, // gas
      100, // chainid
      `0xdc8601b3000000000000000000000000${homeColonyNetwork.address.slice(
        2,
        // )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000044`, // skill before
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000001e84800000000000000000000000000000000000000000000000000000000000000044`, // skill before //eslint-disable-line max-len
      "0x00000000000000000000000000000000000000000000000000000000", // skill after
      "0x", // root hash before
      "0x", // root hash after
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
      `0xdc8601b3000000000000000000000000${foreignColonyNetwork.address.slice(
        2,
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000044`,
      "0x00000000000000000000000000000000000000000000000000000000", // root hash after
    );
    await tx.wait();

    // Bridge over skills that have been created on the foreign chain

    const count = await foreignColonyNetwork.getSkillCount();
    console.log("count", count.toHexString());
    console.log("calc", ethers.BigNumber.from(foreignChainId).mul(ethers.BigNumber.from(2).pow(128)).add(1));
    for (let i = ethers.BigNumber.from(foreignChainId).mul(ethers.BigNumber.from(2).pow(128)).add(1); i <= count; i = i.add(1)) {
      const p = getPromiseForNextNBridgedTransactions(1);
      tx = await foreignColonyNetwork.bridgeSkill(i);
      await tx.wait();
      await p;
    }

    // Set up mining client
    client = new ReputationMinerTestWrapper({
      loader: contractLoader,
      minerAddress: accounts[5],
      realProviderPort: HOME_PORT,
      useJsTree: true,
    });
    await client.initialise(homeColonyNetwork.address);
    console.log(ethersHomeSigner.provider.connection.url);
    web3HomeProvider = new web3.eth.providers.HttpProvider(ethersHomeSigner.provider.connection.url);

    await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
    await client.addLogContentsToReputationTree();
    await client.submitRootHash();
    await client.confirmNewHash();

    await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
    await client.addLogContentsToReputationTree();
    await client.submitRootHash();
    await client.confirmNewHash();
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

    const p = getPromiseForNextNBridgedTransactions(2);
    foreignColony = await setupColony(foreignColonyNetwork);
    await p;
  });

  after(async () => {
    await bridgeMonitor.close();
  });

  describe.only("when controlling a gnosis wallet on another chain", async () => {
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
      // const t = homeColonyNetwork.interface.encodeFunctionData("addSkillFromBridge", [0x666666, 0x88888888]);
      // console.log(t);
      // const txDataToBeSentToAMB = homeBridge.interface.encodeFunctionData("requireToPassMessage", [homeColonyNetwork.address, t, 1000000]);
      // console.log(txDataToBeSentToAMB);

      // See skills on home chain
      const beforeCount = await homeColonyNetwork.getBridgeSkillCounts("0x0fd5c9ed");

      const p = getPromiseForNextNBridgedTransactions(1);

      // Create a skill on foreign chain
      // await foreignColony.addDomain(1);
      const foreignBeforeCount = await foreignColonyNetwork.getSkillCount();
      const tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();

      const foreignAfterCount = await foreignColonyNetwork.getSkillCount();
      expect(foreignBeforeCount.add(1).toHexString()).to.equal(foreignAfterCount.toHexString());
      await p;

      // Check reflected on home chain
      const afterCount = await homeColonyNetwork.getBridgeSkillCounts("0x0fd5c9ed");
      expect(beforeCount.add(1).toHexString()).to.equal(afterCount.toHexString());
    });
  });

  describe("while earning reputation on another chain", async () => {
    it("reputation awards are ultimately reflected", async () => {
      // const t = homeColonyNetwork.interface.encodeFunctionData("appendReputationUpdateLogFromBridge", [
      //   "0x1471c2dc50d9155d80E4C88187806Df6B1a2e649",
      //   "0x1471c2dc50d9155d80E4C88187806Df6B1a2e649",
      //   0x666666,
      //   0x88888888,
      // ]);
      // console.log(t);
      // const txDataToBeSentToAMB = homeBridge.interface.encodeFunctionData("requireToPassMessage", [homeColonyNetwork.address, t, 1000000]);
      // console.log(txDataToBeSentToAMB);

      // const t = homeColonyNetwork.interface.encodeFunctionData("bridgeSetReputationRootHash", [
      //   "0xb8b89e7cf61d1d39d09e98c0ccbb489561e5e1173445a6b34e469f362ebdb221",
      //   "0xb8b89e7cf61d1d39d09e98c0ccbb489561e5e1173445a6b34e469f362ebdb221"
      // ]);
      // console.log(t);
      // const txDataToBeSentToAMB = homeBridge.interface.encodeFunctionData("requireToPassMessage", [foreignColonyNetwork.address, t, 1000000]);
      // console.log(txDataToBeSentToAMB);

      // process.exit(1)

      let p = getPromiseForNextNBridgedTransactions(1);
      // Emit reputation
      await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1337");
      // See that it's bridged to the inactive log
      await p;
      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);

      const len = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      const entry = await reputationMiningCycleInactive.getReputationUpdateLogEntry(len.sub(1));

      expect(entry.amount.toHexString()).to.equal("0x1337");
      expect(entry.user).to.equal(accounts[0]);
      expect(entry.colony).to.equal(foreignColony.address);
      console.log(foreignChainId);

      const domain = await foreignColony.getDomain(1);
      console.log(domain);

      console.log(domain.skillId);
      console.log(entry.skillId);

      expect(entry.skillId.toHexString()).to.equal(domain.skillId.toHexString());

      // Advance mining cycle twice
      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
      await client.addLogContentsToReputationTree();
      await client.submitRootHash();
      await client.confirmNewHash();

      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
      await client.addLogContentsToReputationTree();
      await client.submitRootHash();
      await client.confirmNewHash();

      // Check in state
      const key = await ReputationMinerTestWrapper.getKey(foreignColony.address, entry.skillId, accounts[0]);
      expect(client.reputations[key]).to.not.equal(undefined);
      expect(ethers.BigNumber.from(client.reputations[key].slice(0, 66)).toHexString()).to.equal("0x1337");

      // Bridge it

      p = getPromiseForNextNBridgedTransactions(1);
      const tx = await homeColonyNetwork.bridgeCurrentRootHash(homeBridge.address);
      await tx.wait();
      await p;

      // Check state bridged to host chain
      const foreignChainRootHash = await foreignColonyNetwork.getReputationRootHash();
      const foreignNLeaves = await foreignColonyNetwork.getReputationRootHashNNodes();
      const homeChainRootHash = await homeColonyNetwork.getReputationRootHash();
      const homeNLeaves = await homeColonyNetwork.getReputationRootHashNNodes();

      expect(foreignChainRootHash).to.equal(homeChainRootHash);
      expect(homeNLeaves.toHexString()).to.equal(foreignNLeaves.toHexString());
    });
  });
});
