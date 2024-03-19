/* globals artifacts */
const fs = require("fs");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers, BigNumber } = require("ethers");
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
const WormholeBridgeForColony = artifacts.require("WormholeBridgeForColony");
const { setupBridging, deployBridge } = require("../../scripts/setup-bridging-contracts");

const { MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION, ROOT_ROLE } = require("../../helpers/constants");
const { forwardTime, checkErrorRevertEthers, snapshot, revert } = require("../../helpers/test-helper");
const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const { TruffleLoader } = require("../../packages/package-utils");

const UINT256_MAX_ETHERS = ethers.BigNumber.from(2).pow(256).sub(1);

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
  let homeColonyBridge;
  let foreignColonyBridge;
  let gnosisSafe;
  let zodiacBridge;
  let bridgeMonitor;
  let homeChainId;
  let foreignChainId;
  let wormholeHomeChainId;
  let wormholeForeignChainId;

  let homeMetacolony;
  let foreignMetacolony;

  let web3HomeProvider;
  let web3ForeignProvider;

  let client;

  let homeSnapshotId;
  let foreignSnapshotId;

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  const TRUFFLE_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
  const OTHER_RPC_PORT = 8546;

  const MINER_ADDRESS = accounts[5];

  const HOME_PORT = process.env.TRUFFLE_FOREIGN === "true" ? OTHER_RPC_PORT : TRUFFLE_PORT;
  const FOREIGN_PORT = process.env.TRUFFLE_FOREIGN === "true" ? TRUFFLE_PORT : OTHER_RPC_PORT;

  const foreignRpcUrl = `http://127.0.0.1:${FOREIGN_PORT}`;
  const homeRpcUrl = `http://127.0.0.1:${HOME_PORT}`;

  const ethersForeignSigner = new ethers.providers.JsonRpcProvider(foreignRpcUrl).getSigner();
  const ethersHomeSigner = new ethers.providers.JsonRpcProvider(homeRpcUrl).getSigner();
  const ethersForeignSigner2 = new ethers.providers.JsonRpcProvider(foreignRpcUrl).getSigner(1);
  const ethersHomeSigner2 = new ethers.providers.JsonRpcProvider(homeRpcUrl).getSigner(1);

  async function setForeignBridgeData(foreignColonyBridgeForColony) {
    const bridge = new ethers.Contract(foreignColonyBridge.address, WormholeBridgeForColony.abi, ethersForeignSigner);

    let tx = await bridge.setColonyBridgeAddress(foreignChainId, foreignColonyBridge.address);
    await tx.wait();
    tx = await bridge.setColonyBridgeAddress(homeChainId, homeColonyBridge.address);
    await tx.wait();

    tx = await bridge.setColonyNetworkAddress(foreignColonyNetwork.address);
    await tx.wait();

    tx = await foreignMetacolony.setColonyBridgeAddress(foreignColonyBridgeForColony);
    await tx.wait();
  }

  async function setHomeBridgeData(homeColonyBridgeAddressForColony) {
    const bridge = new ethers.Contract(homeColonyBridge.address, WormholeBridgeForColony.abi, ethersHomeSigner);

    let tx = await bridge.setColonyBridgeAddress(foreignChainId, foreignColonyBridge.address);
    await tx.wait();
    tx = await bridge.setColonyBridgeAddress(homeChainId, homeColonyBridge.address);
    await tx.wait();

    tx = await bridge.setColonyNetworkAddress(homeColonyNetwork.address);
    await tx.wait();

    tx = await homeMetacolony.setColonyBridgeAddress(homeColonyBridgeAddressForColony);
    await tx.wait();
  }

  before(async () => {
    await exec(`PORT=${FOREIGN_PORT} bash ./scripts/setup-foreign-chain.sh`);

    ({ bridgeMonitor, gnosisSafe, zodiacBridge, homeBridge, foreignBridge, foreignColonyBridge, homeColonyBridge } = await setupBridging(
      homeRpcUrl,
      foreignRpcUrl,
    ));

    // Deploy colonyNetwork to whichever chain truffle hasn't already deployed to.
    try {
      await exec(`SOLIDITY_COVERAGE="" npx truffle compile --all`);
      await exec(`SOLIDITY_COVERAGE="" npm run provision:token:contracts`);
      await exec(`SOLIDITY_COVERAGE="" npm run provision:safe:contracts`);
      await exec(`npx truffle migrate --network development2`);
    } catch (err) {
      console.log(err);

      process.exit(1);
    }
    // Add bridge to the foreign colony network
    const homeNetworkId = await ethersHomeSigner.provider.send("net_version", []);
    homeChainId = await ethersHomeSigner.provider.send("eth_chainId", []);
    wormholeHomeChainId = BigNumber.from(homeChainId).mod(265669).mul(2);

    const foreignNetworkId = await ethersForeignSigner.provider.send("net_version", []);
    foreignChainId = await ethersForeignSigner.provider.send("eth_chainId", []);
    wormholeForeignChainId = BigNumber.from(foreignChainId).mod(265669).mul(2);

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
    foreignMetacolony = await new ethers.Contract(foreignMCAddress, IMetaColony.abi, ethersForeignSigner);
    const homeMCAddress = await homeColonyNetwork.getMetaColony();
    homeMetacolony = await new ethers.Contract(homeMCAddress, IMetaColony.abi, ethersHomeSigner);

    await setForeignBridgeData(foreignColonyBridge.address);
    await setHomeBridgeData(homeColonyBridge.address);

    // Bridge over skills that have been created on the foreign chain

    const latestSkillId = await foreignColonyNetwork.getSkillCount();
    const skillId = ethers.BigNumber.from(foreignChainId).mul(ethers.BigNumber.from(2).pow(128)).add(1);
    for (let i = skillId; i <= latestSkillId; i = i.add(1)) {
      const p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      const tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(i);
      await tx.wait();
      await p;
      // process.exit(1);
    }

    // Set up mining client
    client = new ReputationMinerTestWrapper({
      loader: contractLoader,
      minerAddress: MINER_ADDRESS,
      realProviderPort: HOME_PORT,
      useJsTree: true,
    });

    await client.initialise(homeColonyNetwork.address);
    web3HomeProvider = new web3.eth.providers.HttpProvider(ethersHomeSigner.provider.connection.url);
    web3ForeignProvider = new web3.eth.providers.HttpProvider(ethersForeignSigner.provider.connection.url);

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
    homeSnapshotId = await snapshot(web3HomeProvider);
    foreignSnapshotId = await snapshot(web3ForeignProvider);
    bridgeMonitor.reset();

    let tx = await foreignBridge.setBridgeEnabled(true);
    await tx.wait();
    tx = await homeBridge.setBridgeEnabled(true);
    await tx.wait();
    // Set up a colony on the home chain. That may or may not be the truffle chain...
    homeColony = await setupColony(homeColonyNetwork);

    const p = bridgeMonitor.getPromiseForNextBridgedTransaction(2);
    foreignColony = await setupColony(foreignColonyNetwork);
    await p;
  });

  afterEach(async () => {
    await revert(web3HomeProvider, homeSnapshotId);
    await revert(web3ForeignProvider, foreignSnapshotId);
  });

  after(async () => {
    await bridgeMonitor.close();
  });

  describe("administrating cross-network bridges", async () => {
    it("bridge data can be queried", async () => {
      const bridgeAddress = await homeColonyNetwork.getColonyBridgeAddress();
      expect(bridgeAddress).to.equal(homeColonyBridge.address);

      const networkAddress = await homeColonyBridge.getColonyNetworkAddress();
      expect(networkAddress).to.equal(homeColonyNetwork.address);

      const foreignColonyBridgeAddress = await homeColonyBridge.getColonyBridgeAddress(foreignChainId);
      expect(foreignColonyBridgeAddress).to.equal(foreignColonyBridge.address);
    });

    it("setColonyBridgeAddress on Network can only be called by the metacolony", async () => {
      const tx = await foreignColonyNetwork.setColonyBridgeAddress(foreignColonyBridge.address, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-caller-must-be-meta-colony");
    });

    it("setColonyBridgeAddress on Metacolony can't be called by an address without root permissions", async () => {
      const foreignMetacolony2 = new ethers.Contract(foreignMetacolony.address, IColonyNetwork.abi, ethersForeignSigner2);

      let tx = await foreignMetacolony2.setColonyBridgeAddress(ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      // Add root permissions
      tx = await foreignMetacolony.setUserRoles(
        1,
        UINT256_MAX_ETHERS,
        accounts[1],
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(ethers.BigNumber.from(2).pow(ROOT_ROLE)).toHexString(), 32),
      );
      await tx.wait();

      // Can now call
      tx = await foreignMetacolony2.setColonyBridgeAddress(ADDRESS_ZERO, {
        gasLimit: 1000000,
      });
      await tx.wait();

      // Reset permissions
      tx = await foreignMetacolony.setUserRoles(1, UINT256_MAX_ETHERS, accounts[1], 1, ethers.utils.hexZeroPad("0x00", 32));
      await tx.wait();
    });

    it("setColonyNetworkAddress can only set information for bridges where assumptions we've made about chainid are not broken", async () => {
      const tx = await homeColonyBridge.setColonyBridgeAddress(UINT256_MAX_ETHERS, ADDRESS_ZERO, {
        gasLimit: 1000000,
      });
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-chainid-too-large");
    });

    it("updating the bridge for a chain does not reset the bridged skill count", async () => {
      const countBefore = await homeColonyNetwork.getBridgedSkillCounts(foreignChainId);
      const tx = await homeMetacolony.setColonyBridgeAddress(ADDRESS_ZERO);
      await tx.wait();

      const countAfter = await homeColonyNetwork.getBridgedSkillCounts(foreignChainId);
      expect(countAfter).to.not.equal(0);
      expect(countAfter.sub(countBefore).toNumber()).to.equal(0);
    });

    it("the bridged skill count has a sensible default", async () => {
      const unsetChainId = ethers.BigNumber.from(123456789);
      const count = await homeColonyNetwork.getBridgedSkillCounts(unsetChainId);
      expect(count.toString()).to.equal(unsetChainId.shl(128).toString());
    });

    it("only owners can set properties on the ColonyBridge", async () => {
      let tx = await homeColonyBridge.connect(ethersHomeSigner2).setColonyNetworkAddress(ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      tx = await homeColonyBridge.connect(ethersHomeSigner2).setColonyBridgeAddress(1, ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      tx = await homeColonyBridge.connect(ethersHomeSigner2).setWormholeAddress(ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      tx = await homeColonyBridge.connect(ethersHomeSigner2).setChainIdMapping([1], [2], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");
    });

    it("setChainIdMapping can only be called with sane arguments", async () => {
      const tx = await homeColonyBridge.setChainIdMapping([1, 3], [2], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-chainid-mapping-length-mismatch");
    });
  });

  describe.skip("when controlling a gnosis wallet on another chain", async () => {
    // No longer required
    it("can send tokens out of the gnosis safe", async () => {
      // Create token contract on foreign chain

      const tokenFactory = new ethers.ContractFactory(Token.abi, Token.bytecode, ethersForeignSigner);
      const fToken = await tokenFactory.deploy("Test", "TST", 18);
      await fToken.deployTransaction.wait();
      await fToken.unlock();
      // Send some to safe
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
      const txDataToBeSentToAMB = homeColonyBridge.interface.encodeFunctionData("sendMessage", [
        zodiacBridge.address,
        txDataToBeSentToZodiacModule,
        1000000,
      ]);
      // Which we trigger by sending a transaction to the module...

      // Set up promise that will see it bridged across
      const p = bridgeMonitor.getPromiseForNextBridgedTransaction();

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
      // See skills on home chain
      const beforeCount = await homeColonyNetwork.getBridgedSkillCounts("0x0fd5c9ed");

      const p = bridgeMonitor.getPromiseForNextBridgedTransaction();

      // Create a skill on foreign chain
      // await foreignColony.addDomain(1);
      const foreignBeforeCount = await foreignColonyNetwork.getSkillCount();
      const tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();

      const foreignAfterCount = await foreignColonyNetwork.getSkillCount();
      expect(foreignBeforeCount.add(1).toHexString()).to.equal(foreignAfterCount.toHexString());
      await p;

      // Check reflected on home chain
      const afterCount = await homeColonyNetwork.getBridgedSkillCounts("0x0fd5c9ed");
      expect(beforeCount.add(1).toHexString()).to.equal(afterCount.toHexString());
    });

    it("addSkillFromBridge cannot be called by a non-bridge address", async () => {
      const tx = await homeColonyNetwork.addSkillFromBridge(0, 0, {
        gasLimit: 1000000,
      });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-colony-bridge");
    });

    it("addPendingSkill doesn't create skills that haven't been bridged", async () => {
      const homeSkillCount = await homeColonyNetwork.getBridgedSkillCounts(foreignChainId);
      const tx = await homeColonyNetwork.addPendingSkill(homeSkillCount.add(1), { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-no-such-bridged-skill");
    });

    it("if a skill is bridged out-of-order, it's added to the pending mapping", async () => {
      bridgeMonitor.skipCount = 1;
      // Create a skill on the foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();

      await bridgeMonitor.waitUntilSkipped();

      const foreignDomain = await foreignColony.getDomain(1);

      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();

      // Create another skill on the foreign chain
      // Bridge the latter without bridging the former
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      const foreignSkillCount = await foreignColonyNetwork.getSkillCount();

      await p;

      // Check it's pending
      const pendingAddition = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignSkillCount);

      expect(pendingAddition.toHexString()).to.equal(foreignDomain.skillId.toHexString());

      // Need to clean up
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(foreignSkillCount.sub(1));
      await tx.wait();
      await p;
      tx = await homeColonyNetwork.addPendingSkill(foreignSkillCount, { gasLimit: 1000000 });
      await tx.wait();
    });

    it("if a skill is bridged out-of-order, it can be added once the earlier skills are bridged ", async () => {
      bridgeMonitor.skipCount = 1;
      // Create a skill on the foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      await bridgeMonitor.waitUntilSkipped();

      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      // Create another skill on the foreign chain
      // Bridge the latter without bridging the former
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      const foreignSkillCount = await foreignColonyNetwork.getSkillCount();
      await p;

      // Try to add
      tx = await homeColonyNetwork.addPendingSkill(foreignSkillCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-bridged-skill");

      // Bridge the next skill
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(foreignSkillCount.sub(1));
      await tx.wait();
      await p;

      // Add the pending skill
      tx = await homeColonyNetwork.addPendingSkill(foreignSkillCount, { gasLimit: 1000000 });
      await tx.wait();

      // Check it was added
      const homeSkillCount = await homeColonyNetwork.getBridgedSkillCounts(foreignChainId);
      expect(homeSkillCount.toHexString()).to.equal(foreignSkillCount.toHexString());

      // And removed from pending
      const pendingAddition = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignSkillCount);
      expect(pendingAddition.toHexString()).to.equal("0x00");
    });

    it("if a skill that was pending is repeatedly bridged, the resuling transaction fails after the first time", async () => {
      bridgeMonitor.skipCount = 1;
      // Create a skill on the foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      await bridgeMonitor.waitUntilSkipped();

      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      // Create another skill on the foreign chain
      // Bridge the latter without bridging the former
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      const foreignSkillCount = await foreignColonyNetwork.getSkillCount();
      await p;

      // Try to add
      tx = await homeColonyNetwork.addPendingSkill(foreignSkillCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-bridged-skill");

      // Bridge the next skill
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(foreignSkillCount.sub(1));
      await tx.wait();
      await p;

      // Add the pending skill
      tx = await homeColonyNetwork.addPendingSkill(foreignSkillCount, { gasLimit: 1000000 });
      await tx.wait();

      // Adding again doesn't work
      tx = await homeColonyNetwork.addPendingSkill(foreignSkillCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-bridged-skill");

      // And bridging again doesn't work
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(foreignSkillCount);
      await tx.wait();
      await p;

      const pendingAddition = await homeColonyNetwork.getPendingSkillAddition(foreignChainId, foreignSkillCount);
      expect(pendingAddition.toHexString()).to.equal("0x00");

      const homeSkillCount = await homeColonyNetwork.getBridgedSkillCounts(foreignChainId);
      expect(homeSkillCount.toHexString()).to.equal(foreignSkillCount.toHexString());
    });

    it("can't bridge a skill that doesn't exist", async () => {
      const skillCount = await foreignColonyNetwork.getSkillCount();
      const nonExistentSkillId = skillCount.add(10000000);
      const tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(nonExistentSkillId, {
        gasLimit: 1000000,
      });
      await checkErrorRevertEthers(tx.wait(), "colony-invalid-skill-id");
    });

    it("if bridge is broken, bridging skill transaction doesn't revert (allowing e.g. domains to be created)", async () => {
      let tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();
      const skillCount = await foreignColonyNetwork.getSkillCount();

      tx = await foreignColonyNetwork.bridgeSkillIfNotMiningChain(skillCount, {
        gasLimit: 1000000,
      });
      let receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      receipt = await tx.wait();

      let events = receipt.logs.map(function (log) {
        try {
          return foreignColonyNetwork.interface.parseLog(log);
        } catch (e) {
          // Return nothing
        }
        return null;
      });
      events = events.filter((x) => x != null && x.eventFragment.name === "SkillCreationStored");
      expect(events.length).to.equal(1);
      const event = events[0];
      expect(event.args[0].toString()).to.equal(skillCount.add(1).toString());
    });

    it("colony root local skill structures end up the same on both chains", async () => {
      const homeColonyRootLocalSkillId = await homeColony.getRootLocalSkill();
      let homeColonyRootLocalSkill = await homeColonyNetwork.getSkill(homeColonyRootLocalSkillId);

      const foreignColonyRootLocalSkillId = await foreignColony.getRootLocalSkill();
      let foreignColonyRootLocalSkill = await foreignColonyNetwork.getSkill(foreignColonyRootLocalSkillId);

      expect(homeColonyRootLocalSkill.nParents.toString()).to.equal(foreignColonyRootLocalSkill.nParents.toString());
      expect(homeColonyRootLocalSkill.nChildren.toString()).to.equal(foreignColonyRootLocalSkill.nChildren.toString());

      let tx = await homeColony.addLocalSkill();
      await tx.wait();

      const p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColony.addLocalSkill();
      await tx.wait();
      await p;
      homeColonyRootLocalSkill = await homeColonyNetwork.getSkill(homeColonyRootLocalSkillId);
      foreignColonyRootLocalSkill = await foreignColonyNetwork.getSkill(foreignColonyRootLocalSkillId);

      expect(homeColonyRootLocalSkill.nParents.toString()).to.equal(foreignColonyRootLocalSkill.nParents.toString());
      expect(homeColonyRootLocalSkill.nChildren.toString()).to.equal(foreignColonyRootLocalSkill.nChildren.toString());

      let zeroSkill = await foreignColonyNetwork.getSkill(ethers.BigNumber.from(foreignChainId).mul(ethers.BigNumber.from(2).pow(128)));
      expect(zeroSkill.nChildren.toNumber()).to.equal(0);

      zeroSkill = await homeColonyNetwork.getSkill(ethers.BigNumber.from(foreignChainId).mul(ethers.BigNumber.from(2).pow(128)));
      expect(zeroSkill.nChildren.toNumber()).to.equal(0);

      zeroSkill = await homeColonyNetwork.getSkill(0);
      expect(zeroSkill.nChildren.toNumber()).to.equal(0);
    });
  });

  describe("while earning reputation on another chain", async () => {
    it("reputation awards are ultimately reflected", async () => {
      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      // Emit reputation
      await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1337");
      // See that it's bridged to the inactive log
      await p;
      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);

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

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      const tx = await homeColonyNetwork.bridgeCurrentRootHash(foreignChainId);
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

    it("if bridge disabled, reputation emissions are stored to be reemitted later", async () => {
      let tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();
      const bridgedReputationUpdateCountBefore = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1337");
      await tx.wait();

      // See it was stored for later
      const bridgedReputationUpdateCountAfter = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);
      expect(bridgedReputationUpdateCountAfter.sub(bridgedReputationUpdateCountBefore).toNumber()).to.equal(1);
    });

    it("if bridge disabled, cannot bridge current state", async () => {
      let tx = await homeBridge.setBridgeEnabled(false);
      await tx.wait();
      tx = await homeColonyNetwork.bridgeCurrentRootHash(foreignChainId, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-mining-bridge-call-failed");
    });

    it("if bridge not set, cannot bridge current state", async () => {
      let tx = await homeMetacolony.setColonyBridgeAddress(ADDRESS_ZERO);
      await tx.wait();
      tx = await homeColonyNetwork.bridgeCurrentRootHash(foreignChainId, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-bridge-not-set");
    });

    it("if bridge unknown, cannot bridge current state", async () => {
      const tx = await homeColonyNetwork.bridgeCurrentRootHash(ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-not-known-chain");
    });

    it("stored reputation emissions can be emitted later", async () => {
      let tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();

      const bridgedReputationUpdateCount = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);

      tx = await foreignBridge.setBridgeEnabled(true);
      await tx.wait();
      const p = bridgeMonitor.getPromiseForNextBridgedTransaction();

      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount);
      await tx.wait();

      await p;

      // See that it's bridged to the inactive log
      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);

      const len = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      const entry = await reputationMiningCycleInactive.getReputationUpdateLogEntry(len.sub(1));

      expect(entry.amount.toHexString()).to.equal("0x1338");
      expect(entry.user).to.equal(accounts[0]);
      expect(entry.colony).to.equal(foreignColony.address);

      const domain = await foreignColony.getDomain(1);

      expect(entry.skillId.toHexString()).to.equal(domain.skillId.toHexString());
    });

    it("stored reputation emissions on the foreign chain can be bridged later, and are decayed if required", async () => {
      let tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();

      const bridgedReputationUpdateCount = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);

      tx = await foreignBridge.setBridgeEnabled(true);
      await tx.wait();

      await forwardTime(MINING_CYCLE_DURATION * 10, undefined, web3HomeProvider);
      await forwardTime(MINING_CYCLE_DURATION * 10, undefined, web3ForeignProvider);

      const p = bridgeMonitor.getPromiseForNextBridgedTransaction();

      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount);
      await tx.wait();

      await p;

      // See that it's bridged to the inactive log
      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);

      const len = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      const entry = await reputationMiningCycleInactive.getReputationUpdateLogEntry(len.sub(1));

      expect(entry.amount.toHexString()).to.equal("0x1327"); // Decayed
      expect(entry.user).to.equal(accounts[0]);
      expect(entry.colony).to.equal(foreignColony.address);

      const domain = await foreignColony.getDomain(1);

      expect(entry.skillId.toHexString()).to.equal(domain.skillId.toHexString());
    });

    it("stored reputation emissions have to be emitted in order, but only per-colony", async () => {
      let p = bridgeMonitor.getPromiseForNextBridgedTransaction(2);
      const foreignColony2 = await setupColony(foreignColonyNetwork);
      await p;

      let tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1339");
      await tx.wait();
      tx = await foreignColony2.emitDomainReputationReward(1, accounts[0], "0x1340");
      await tx.wait();

      tx = await foreignBridge.setBridgeEnabled(true);
      await tx.wait();
      const bridgedReputationUpdateCountColony1 = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);

      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);
      const logLengthBefore = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      // We cannot emit the second bridged
      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCountColony1, {
        gasLimit: 1000000,
      });
      await checkErrorRevertEthers(tx.wait(), "colony-network-not-next-pending-update");

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      // We can emit the third (which was another colony)
      const bridgedReputationUpdateCountColony2 = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony2.address);
      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony2.address, bridgedReputationUpdateCountColony2);
      await tx.wait();
      await p;

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      // We can emit the first
      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCountColony1.sub(1));
      await tx.wait();
      await p;

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      // And now we can emit the second
      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCountColony1);
      await tx.wait();
      await p;

      const logLengthAfter = await reputationMiningCycleInactive.getReputationUpdateLogLength();
      expect(logLengthAfter.sub(logLengthBefore).toNumber()).to.equal(3);
    });

    it("if a bridged reputation emission isn't the next one, it's stored on the mining chain to be added to the log later", async () => {
      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);
      const logLengthBefore = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      let p = bridgeMonitor.getPromiseForNextBridgedTransaction(2);
      const foreignColony2 = await setupColony(foreignColonyNetwork);
      await p;

      bridgeMonitor.skipCount = 1;

      // Bridge skills

      // This one is skipped
      let tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();
      await bridgeMonitor.waitUntilSkipped();

      // These are bridged and added to the pending log
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1339");
      await tx.wait();
      await p;

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1340");
      await tx.wait();
      await p;

      // This gets added to the log after being bridged, as it is another colony
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColony2.emitDomainReputationReward(1, accounts[0], "0x1341");
      await tx.wait();
      await p;

      // The log entry for foreignColony2 has been added to the reputation mining cycle contract
      const logLengthAfterBridging = await reputationMiningCycleInactive.getReputationUpdateLogLength();
      expect(logLengthAfterBridging.sub(logLengthBefore).toNumber()).to.equal(1);

      // The two log entries have been added to the pending log
      let count = await homeColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);
      let pending1 = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony.address, count.add(2));
      expect(pending1.amount.toHexString()).to.equal("0x1339");
      expect(pending1.user).to.equal(accounts[0]);
      expect(pending1.colony).to.equal(foreignColony.address);

      let pending2 = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony.address, count.add(3));
      expect(pending2.amount.toHexString()).to.equal("0x1340");
      expect(pending2.user).to.equal(accounts[0]);
      expect(pending2.colony).to.equal(foreignColony.address);

      // We can't emit those yet because we still haven't bridged the one that was skipped
      tx = await homeColonyNetwork.addPendingReputationUpdate(foreignChainId, foreignColony.address, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-next-update-does-not-exist");

      // If we bridge over the original one that was skipped, then we can emit the two pending ones
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      await p;
      count = await homeColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);

      tx = await homeColonyNetwork.addPendingReputationUpdate(foreignChainId, foreignColony.address);
      await tx.wait();
      tx = await homeColonyNetwork.addPendingReputationUpdate(foreignChainId, foreignColony.address);
      await tx.wait();

      // And now they're on the pending log
      const logLengthAfterAdditionalBridging = await reputationMiningCycleInactive.getReputationUpdateLogLength();
      expect(logLengthAfterAdditionalBridging.sub(logLengthAfterBridging).toNumber()).to.equal(3);

      // And removed from the colony network

      pending1 = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony.address, count.add(2));
      expect(pending1.amount.toHexString()).to.equal("0x00");
      expect(pending1.user).to.equal(ADDRESS_ZERO);
      expect(pending1.colony).to.equal(ADDRESS_ZERO);

      pending2 = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony.address, count.add(3));
      expect(pending2.amount.toHexString()).to.equal("0x00");
      expect(pending2.user).to.equal(ADDRESS_ZERO);
      expect(pending2.colony).to.equal(ADDRESS_ZERO);
    });

    it(`if a bridged reputation emission isn't the next one, it's stored on the mining chain to be added to the log later
      and decayed if required`, async () => {
      let tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();

      const bridgedReputationUpdateCount = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);

      tx = await foreignBridge.setBridgeEnabled(true);
      await tx.wait();

      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1339");
      await p;

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount);
      await tx.wait();
      await p;

      const pending1 = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony.address, bridgedReputationUpdateCount.add(1));
      expect(pending1.amount.toHexString()).to.equal("0x1339");
      expect(pending1.user).to.equal(accounts[0]);
      expect(pending1.colony).to.equal(foreignColony.address);

      await forwardTime(MINING_CYCLE_DURATION * 10, undefined, web3HomeProvider);
      await forwardTime(MINING_CYCLE_DURATION * 10, undefined, web3ForeignProvider);
      tx = await homeColonyNetwork.addPendingReputationUpdate(foreignChainId, foreignColony.address);
      await tx;

      // See that it's bridged to the pending log, but decayed

      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);

      const len = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      const entry = await reputationMiningCycleInactive.getReputationUpdateLogEntry(len.sub(1));

      expect(entry.amount.toHexString()).to.equal("0x1328");
      expect(entry.user).to.equal(accounts[0]);
      expect(entry.colony).to.equal(foreignColony.address);

      const domain = await foreignColony.getDomain(1);

      expect(entry.skillId.toHexString()).to.equal(domain.skillId.toHexString());
    });

    it(`if a bridged reputation emission is for a skill that hasn't been bridged,
         it's stored on the mining chain to be added to the log later`, async () => {
      const logAddress = await homeColonyNetwork.getReputationMiningCycle(false);
      const reputationMiningCycleInactive = await new ethers.Contract(logAddress, IReputationMiningCycle.abi, ethersHomeSigner);

      bridgeMonitor.skipCount = 2;
      const foreignColony2 = await setupColony(foreignColonyNetwork);
      await bridgeMonitor.waitUntilSkipped();

      // Bridge skills
      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      let tx = await foreignColony2.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();
      await p;

      // A log entries have been added to the pending log
      const count = await homeColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony2.address);
      let pending = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony2.address, count.add(1));
      expect(pending.amount.toHexString()).to.equal("0x1338");
      expect(pending.user).to.equal(accounts[0]);
      expect(pending.colony).to.equal(foreignColony2.address);

      // We can't emit it yet, because the skill still hasn't been bridged
      tx = await homeColonyNetwork.addPendingReputationUpdate(foreignChainId, foreignColony2.address, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-invalid-skill-id");

      const logLength1 = await reputationMiningCycleInactive.getReputationUpdateLogLength();

      // Bridge over the skill creation
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      await p;
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      await p;

      // Now try to emit the pending reputation emission
      tx = await homeColonyNetwork.addPendingReputationUpdate(foreignChainId, foreignColony2.address);
      await tx.wait();

      // And now it's on the mining cycle contract
      const logLength2 = await reputationMiningCycleInactive.getReputationUpdateLogLength();
      expect(logLength2.sub(logLength1).toNumber()).to.equal(1);

      // And removed from the colony network

      pending = await homeColonyNetwork.getPendingReputationUpdate(foreignChainId, foreignColony2.address, count.add(1));
      expect(pending.amount.toHexString()).to.equal("0x00");
      expect(pending.user).to.equal(ADDRESS_ZERO);
      expect(pending.colony).to.equal(ADDRESS_ZERO);
    });

    it("addReputationUpdateLogFromBridge cannot be called by a non-bridge address", async () => {
      const tx = await homeColonyNetwork.addReputationUpdateLogFromBridge(ADDRESS_ZERO, ADDRESS_ZERO, 0, 0, 0, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-colony-bridge");
    });

    it("bridgePendingReputationUpdate can only be called if the bridge is set", async () => {
      // Set bridge to an address that's not a contract, causing the reputation update we subsequently emit to be stored
      await setForeignBridgeData(accounts[0]);
      let tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");

      const bridgedReputationUpdateCount = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);

      await setForeignBridgeData(ADDRESS_ZERO);

      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-foreign-bridge-not-set");
      await setForeignBridgeData(foreignColonyBridge.address);
    });

    it("bridgePendingReputationUpdate can only bridge an update that exists", async () => {
      const tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, 1000, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-update-does-not-exist");
    });

    it("bridgePendingReputationUpdate can be called again if the bridging transaction fails, or the bridge isn't a contract", async () => {
      // Set bridge to an address that's not a contract, causing the reputation update we subsequently emit to be stored
      await setForeignBridgeData(accounts[0]);
      let tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1338");
      await tx.wait();

      const bridgedReputationUpdateCount = await foreignColonyNetwork.getBridgedReputationUpdateCount(foreignChainId, foreignColony.address);
      // Bridge isn't a contract
      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-bridging-tx-unsuccessful");
      await setForeignBridgeData(foreignColonyBridge.address);

      // Bridge is now right address, but disable it.
      tx = await foreignBridge.setBridgeEnabled(false);
      await tx.wait();

      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-bridging-tx-unsuccessful");

      tx = await foreignBridge.setBridgeEnabled(true);
      await tx.wait();

      tx = await foreignColonyNetwork.bridgePendingReputationUpdate(foreignColony.address, bridgedReputationUpdateCount, { gasLimit: 1000000 });
      await tx.wait();
    });
  });

  describe("bridge functions are secure", async () => {
    it("only the configured colonyNetwork can call `sendMessage`", async () => {
      const tx = await foreignColonyBridge.sendMessage(1, "0x00000000", { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "wormhole-bridge-only-colony-network");
    });

    it("setReputationRootHashFromBridge can only be called by the colonyBridge contract", async () => {
      const [, unknownColonyBridge] = await deployBridge(ethersForeignSigner);
      await unknownColonyBridge.setColonyNetworkAddress(foreignColonyNetwork.address);
      await unknownColonyBridge.setColonyBridgeAddress(homeChainId, homeColonyBridge.address);
      const vaa = await bridgeMonitor.encodeMockVAA(
        homeColonyBridge.address,
        0,
        0,
        foreignColonyNetwork.interface.encodeFunctionData("setReputationRootHashFromBridge", [ethers.utils.hexZeroPad("0xdeadbeef", 32), 0, 1]),
        100,
        wormholeHomeChainId,
      );
      const tx = await unknownColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-colony-bridge");
    });

    it("setReputationRootHashFromBridge reverts if bridged transaction did not originate from colonyBridge", async () => {
      const vaa = await bridgeMonitor.encodeMockVAA(
        ADDRESS_ZERO,
        0,
        0,
        foreignColonyNetwork.interface.encodeFunctionData("setReputationRootHashFromBridge", [ethers.utils.hexZeroPad("0xdeadbeef", 32), 0, 1]),
        100,
        wormholeForeignChainId,
      );

      const tx = await foreignColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });

      await checkErrorRevertEthers(tx.wait(), "colony-bridge-bridged-tx-only-from-colony-bridge");

      const hash = await foreignColonyNetwork.getReputationRootHash();
      expect(hash).to.not.equal(ethers.utils.hexZeroPad("0xdeadbeef", 32));
    });

    it("setReputationRootHashFromBridge does not allow transactions to be replayed (if not enforced by bridge)", async () => {
      await homeColony.emitDomainReputationReward(1, accounts[0], "0x1337");

      // Advance mining cycle twice
      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
      await client.addLogContentsToReputationTree();
      await client.submitRootHash();
      await client.confirmNewHash();

      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
      await client.addLogContentsToReputationTree();
      await client.submitRootHash();
      await client.confirmNewHash();

      const homeRootHash1 = await homeColonyNetwork.getReputationRootHash();

      bridgeMonitor.skipCount = 1;
      // Bridge root hash
      let tx = await homeColonyNetwork.bridgeCurrentRootHash(foreignChainId);
      await tx.wait();
      await bridgeMonitor.waitUntilSkipped();

      const skippedTx = bridgeMonitor.skipped[0];

      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      await p;

      const foreignRootHash1 = await foreignColonyNetwork.getReputationRootHash();

      expect(homeRootHash1).to.equal(foreignRootHash1);

      // Advance mining cycle twice
      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
      await client.addLogContentsToReputationTree();
      await client.submitRootHash();
      await client.confirmNewHash();

      await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
      await client.addLogContentsToReputationTree();
      await client.submitRootHash();
      await client.confirmNewHash();

      const homeRootHash2 = await homeColonyNetwork.getReputationRootHash();

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      tx = await homeColonyNetwork.bridgeCurrentRootHash(foreignChainId);
      await tx.wait();
      await p;

      const foreignRootHash2 = await foreignColonyNetwork.getReputationRootHash();
      expect(foreignRootHash2).to.equal(homeRootHash2);

      // Try and replay
      bridgeMonitor.skipped = [skippedTx];

      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      const bridgingTx = await p;
      await checkErrorRevertEthers(bridgingTx.wait(), "colony-mining-bridge-invalid-nonce");

      // Had no effect

      const foreignRootHash3 = await foreignColonyNetwork.getReputationRootHash();

      expect(foreignRootHash3).to.equal(foreignRootHash2);
      expect(foreignRootHash3).to.not.equal(foreignRootHash1);
    });

    it("addSkillFromBridge can only be called by the colonyBridge contract", async () => {
      const skillCountBefore = await homeColonyNetwork.getSkillCount();

      const [, unknownColonyBridge] = await deployBridge(ethersHomeSigner);
      await unknownColonyBridge.setColonyBridgeAddress(foreignChainId, foreignColonyBridge.address);
      await unknownColonyBridge.setColonyNetworkAddress(homeColonyNetwork.address);
      const vaa = await bridgeMonitor.encodeMockVAA(
        foreignColonyBridge.address,
        0,
        0,
        homeColonyNetwork.interface.encodeFunctionData("addSkillFromBridge", [1, 2]),
        100,
        wormholeForeignChainId,
      );
      const tx = await unknownColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-colony-bridge");

      const skillCountAfter = await homeColonyNetwork.getSkillCount();
      expect(skillCountAfter.toHexString()).to.be.equal(skillCountBefore.toHexString());
    });

    it("addSkillFromBridge reverts if bridged transaction did not originate from colonyNetwork", async () => {
      const skillCountBefore = await homeColonyNetwork.getSkillCount();

      const vaa = await bridgeMonitor.encodeMockVAA(
        ADDRESS_ZERO,
        0,
        0,
        foreignColonyNetwork.interface.encodeFunctionData("setReputationRootHashFromBridge", [ethers.utils.hexZeroPad("0xdeadbeef", 32), 0, 1]),
        100,
        wormholeForeignChainId,
      );

      const tx = await foreignColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });

      await checkErrorRevertEthers(tx.wait(), "colony-bridge-bridged-tx-only-from-colony-bridge");

      const skillCountAfter = await homeColonyNetwork.getSkillCount();
      expect(skillCountAfter.toHexString()).to.be.equal(skillCountBefore.toHexString());
    });

    it("addSkillFromBridge does not allow transactions to be replayed (if not enforced by bridge)", async () => {
      bridgeMonitor.skipCount = 2;

      // Create a skill on foreign chain
      let tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();

      // Create another
      tx = await foreignColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      await bridgeMonitor.waitUntilSkipped();
      const skippedTx1 = bridgeMonitor.skipped[0];
      const skippedTx2 = bridgeMonitor.skipped[1];

      // Bridge out of order
      bridgeMonitor.skipped = [skippedTx2];
      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      let bridgingTx = await p;
      await bridgingTx.wait();

      // Replay
      bridgeMonitor.skipped = [skippedTx2];
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      bridgingTx = await p;
      await checkErrorRevertEthers(bridgingTx.wait(), "colony-network-skill-already-pending");

      // Bridge first tx
      bridgeMonitor.skipped = [skippedTx1];
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      bridgingTx = await p;
      await bridgingTx.wait();

      // Replay first tx
      bridgeMonitor.skipped = [skippedTx1];
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      bridgingTx = await p;
      await checkErrorRevertEthers(bridgingTx.wait(), "colony-network-skill-already-added");
    });

    // addReputationUpdateLogFromBridge
    it("addReputationUpdateLogFromBridge can only be called by the colonyBridge contract", async () => {
      const [, unknownColonyBridge] = await deployBridge(ethersHomeSigner);
      await unknownColonyBridge.setColonyNetworkAddress(homeColonyNetwork.address);
      await unknownColonyBridge.setColonyBridgeAddress(foreignChainId, foreignColonyBridge.address);
      const vaa = await bridgeMonitor.encodeMockVAA(
        foreignColonyBridge.address,
        0,
        0,
        homeColonyNetwork.interface.encodeFunctionData("addReputationUpdateLogFromBridge", [ADDRESS_ZERO, ADDRESS_ZERO, 0, 0, 0]),
        100,
        wormholeForeignChainId,
      );
      const tx = await unknownColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-colony-bridge");

      // const tx = await homeColonyNetwork.addReputationUpdateLogFromBridge(ADDRESS_ZERO, ADDRESS_ZERO, 0, 0, 0, { gasLimit: 1000000 });
      // await checkErrorRevertEthers(tx.wait(), "colony-network-not-known-bridge");
    });

    it("addReputationUpdateLogFromBridge reverts if bridged transaction did not originate from colonyNetwork", async () => {
      const vaa = await bridgeMonitor.encodeMockVAA(
        ADDRESS_ZERO,
        0,
        0,
        foreignColonyNetwork.interface.encodeFunctionData("addReputationUpdateLogFromBridge", [ADDRESS_ZERO, ADDRESS_ZERO, 0, 0, 0]),
        100,
        wormholeForeignChainId,
      );

      const tx = await foreignColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });

      await checkErrorRevertEthers(tx.wait(), "colony-bridge-bridged-tx-only-from-colony-bridge");
    });

    it("addReputationUpdateLogFromBridge does not allow transactions to be replayed (if not enforced by bridge)", async () => {
      bridgeMonitor.skipCount = 2;

      // Emit reputation on foreign chain
      let tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1337");
      await tx.wait();

      // Emit more reputation
      tx = await foreignColony.emitDomainReputationReward(1, accounts[0], "0x1337");
      await tx.wait();
      await bridgeMonitor.waitUntilSkipped();
      const skippedTx1 = bridgeMonitor.skipped[0];
      const skippedTx2 = bridgeMonitor.skipped[1];

      // Bridge out of order
      bridgeMonitor.skipped = [skippedTx2];
      let p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      let bridgingTx = await p;
      await bridgingTx.wait();

      // Replay
      bridgeMonitor.skipped = [skippedTx2];
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      bridgingTx = await p;
      await checkErrorRevertEthers(bridgingTx.wait(), "colony-network-update-already-pending");

      // Bridge first tx
      bridgeMonitor.skipped = [skippedTx1];
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      bridgingTx = await p;
      await bridgingTx.wait();

      // Replay first tx
      bridgeMonitor.skipped = [skippedTx1];
      p = bridgeMonitor.getPromiseForNextBridgedTransaction();
      await bridgeMonitor.bridgeSkipped();
      bridgingTx = await p;
      await checkErrorRevertEthers(bridgingTx.wait(), "colony-network-update-already-added");
    });

    it("an invalid VM is respected", async () => {
      await homeBridge.setVerifyVMResult(false, "some-good-reason");
      const vaa = await bridgeMonitor.encodeMockVAA(
        homeColonyBridge.address,
        0,
        0,
        foreignColonyNetwork.interface.encodeFunctionData("setReputationRootHashFromBridge", [ethers.utils.hexZeroPad("0xdeadbeef", 32), 0, 1]),
        100,
        wormholeHomeChainId,
      );
      const tx = await homeColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "some-good-reason");
      await homeBridge.setVerifyVMResult(true, "");
    });
  });
});
