/* globals artifacts */
const fs = require("fs");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const path = require("path");

const Promise = require("bluebird");

const exec = Promise.promisify(require("child_process").exec);

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const setupBridging = require("../../scripts/setup-bridging-contracts");

const { MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");
const { forwardTime, checkErrorRevertEthers } = require("../../helpers/test-helper");
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

  let getPromiseForNextBridgedTransaction;

  before(async () => {
    await exec(`PORT=${FOREIGN_PORT} bash ./scripts/setup-foreign-chain.sh`);

    ({ bridgeMonitor, gnosisSafe, zodiacBridge, homeBridge, foreignBridge } = await setupBridging(homeRpcUrl, foreignRpcUrl));

    getPromiseForNextBridgedTransaction = function () {
      return new Promise((resolve, reject) => {
        const listener = async function (_sender, msgSender, _messageId, success) {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          if (!success) {
            console.log("bridged transaction did not succeed");
            await reject(new Error("Bridged transaction did not succeed"));
          }
          homeBridge.off("RelayedMessage", listener);
          foreignBridge.off("RelayedMessage", listener);
          resolve();
        };

        homeBridge.on("RelayedMessage", listener);
        foreignBridge.on("RelayedMessage", listener);
      });
    };

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
    console.log("home colony network", homeColonyNetwork.address);

    const foreignMCAddress = await foreignColonyNetwork.getMetaColony();
    const foreignMetacolony = await new ethers.Contract(foreignMCAddress, IMetaColony.abi, ethersForeignSigner);
    const homeMCAddress = await homeColonyNetwork.getMetaColony();
    const homeMetacolony = await new ethers.Contract(homeMCAddress, IMetaColony.abi, ethersHomeSigner);

    let tx = await foreignMetacolony.setBridgeData(
      foreignBridge.address, // bridge address
      `0xdc8601b3000000000000000000000000${homeColonyNetwork.address.slice(
        2
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000084`, // log before
      "0x00000000000000000000000000000000000000000000000000000000", // log after
      1000000, // gas
      100, // chainid
      `0xdc8601b3000000000000000000000000${homeColonyNetwork.address.slice(
        2
        // )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000044`, // skill before
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000001e84800000000000000000000000000000000000000000000000000000000000000044`, // skill before //eslint-disable-line max-len
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
      `0xdc8601b3000000000000000000000000${foreignColonyNetwork.address.slice(
        2
        // eslint-disable-next-line max-len
      )}000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000044`,
      "0x00000000000000000000000000000000000000000000000000000000" // root hash after
    );
    await tx.wait();

    // Bridge over skills that have been created on the foreign chain

    const latestSkillId = await foreignColonyNetwork.getSkillCount();
    const skillId = ethers.BigNumber.from(foreignChainId).mul(ethers.BigNumber.from(2).pow(128)).add(1);
    for (let i = skillId; i <= latestSkillId; i = i.add(1)) {
      const p = getPromiseForNextBridgedTransaction();
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

    const p = getPromiseForNextBridgedTransaction();
    foreignColony = await setupColony(foreignColonyNetwork);
    await p;

    bridgeMonitor.skipCount = 0;
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
      const p = getPromiseForNextBridgedTransaction();

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

      const p = getPromiseForNextBridgedTransaction();

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

    it("if a skill is bridged out-of-order, it's added to the pending mapping", async () => {
      bridgeMonitor.skipCount = 1;
      // Create a skill on the foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();
      const foreignDomain = await foreignColony.getDomain(1);

      let p = getPromiseForNextBridgedTransaction();

      // Create another skill on the foreign chain
      // Bridge the latter without bridging the former
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();
      const foreignSkillCount = await foreignColonyNetwork.getSkillCount();

      await p;

      // Check it's pending
      const pendingAddition = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignSkillCount);

      expect(pendingAddition.toHexString()).to.equal(foreignDomain.skillId.toHexString());

      // Need to clean up
      p = getPromiseForNextBridgedTransaction();
      await foreignColonyNetwork.bridgeSkill(foreignSkillCount.sub(1));
      await p;
      tx = await homeColonyNetwork.addPendingSkillFromBridge(homeBridge.address, foreignSkillCount, { gasLimit: 1000000 });
      await tx.wait();
    });

    it("if a skill is bridged out-of-order, it can be added once the earlier skills are bridged ", async () => {
      bridgeMonitor.skipCount = 1;
      // Create a skill on the foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();

      let p = getPromiseForNextBridgedTransaction();
      // Create another skill on the foreign chain
      // Bridge the latter without bridging the former
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();
      const foreignSkillCount = await foreignColonyNetwork.getSkillCount();
      await p;

      // Try to add
      tx = await homeColonyNetwork.addPendingSkillFromBridge(homeBridge.address, foreignSkillCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-bridged-skill");

      // Bridge the next skill
      p = getPromiseForNextBridgedTransaction();
      await foreignColonyNetwork.bridgeSkill(foreignSkillCount.sub(1));
      await p;

      // Add the pending skill
      tx = await homeColonyNetwork.addPendingSkillFromBridge(homeBridge.address, foreignSkillCount, { gasLimit: 1000000 });
      await tx.wait();

      // Check it was added
      const homeSkillCount = await homeColonyNetwork.getBridgeSkillCounts(foreignChainId);
      expect(homeSkillCount.toHexString()).to.equal(foreignSkillCount.toHexString());

      // And removed from pending
      const pendingAddition = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignSkillCount);
      expect(pendingAddition.toHexString()).to.equal("0x00");
    });

    it("if a skill that was pending is repeatedly bridged, the resuling transaction fails after the first time", async () => {
      bridgeMonitor.skipCount = 1;
      // Create a skill on the foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();

      let p = getPromiseForNextBridgedTransaction();
      // Create another skill on the foreign chain
      // Bridge the latter without bridging the former
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, ethers.BigNumber.from(2).pow(256).sub(1), 1);
      await tx.wait();
      const foreignSkillCount = await foreignColonyNetwork.getSkillCount();
      await p;

      // Try to add
      tx = await homeColonyNetwork.addPendingSkillFromBridge(homeBridge.address, foreignSkillCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-bridged-skill");

      // Bridge the next skill
      p = getPromiseForNextBridgedTransaction();
      await foreignColonyNetwork.bridgeSkill(foreignSkillCount.sub(1));
      await p;

      // Add the pending skill
      tx = await homeColonyNetwork.addPendingSkillFromBridge(homeBridge.address, foreignSkillCount, { gasLimit: 1000000 });
      await tx.wait();

      // Adding again doesn't work
      tx = await homeColonyNetwork.addPendingSkillFromBridge(homeBridge.address, foreignSkillCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-bridged-skill");

      // And bridging again doesn't work
      p = getPromiseForNextBridgedTransaction();
      await foreignColonyNetwork.bridgeSkill(foreignSkillCount);
      await p;

      const pendingAddition = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignSkillCount);
      expect(pendingAddition.toHexString()).to.equal("0x00");

      const homeSkillCount = await homeColonyNetwork.getBridgeSkillCounts(foreignChainId);
      expect(homeSkillCount.toHexString()).to.equal(foreignSkillCount.toHexString());
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

      let p = getPromiseForNextBridgedTransaction();
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

      const domain = await foreignColony.getDomain(1);

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

      p = getPromiseForNextBridgedTransaction();
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
