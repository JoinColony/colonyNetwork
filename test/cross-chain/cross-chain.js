/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const path = require("path");
const baseExec = require("child_process").exec;

const exec = function (command) {
  return new Promise((resolve, reject) => {
    const execCallback = (error, stdout) => {
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
const ProxyColonyNetwork = artifacts.require("ProxyColonyNetwork");
const ProxyColony = artifacts.require("ProxyColony");
const MetaTxToken = artifacts.require("MetaTxToken");
const OneTxPayment = artifacts.require("OneTxPayment");
const LiFiFacetProxyMock = artifacts.require("LiFiFacetProxyMock");
// const { assert } = require("console");

const { setupBridging, setForeignBridgeData, setHomeBridgeData } = require("../../scripts/setup-bridging-contracts");

const {
  MINING_CYCLE_DURATION,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
  ROOT_ROLE,
  CURR_VERSION,
  CREATEX_ADDRESS,
  NETWORK_ADDRESS,
  HASHZERO,
  LIFI_ADDRESS,
  ARBITRATION_ROLE,
  FUNDING_ROLE,
  ADMINISTRATION_ROLE,
} = require("../../helpers/constants");
const { forwardTime, checkErrorRevertEthers, revert, snapshot, evmChainIdToWormholeChainId, rolesToBytes32 } = require("../../helpers/test-helper");
const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const { TruffleLoader } = require("../../packages/package-utils");
const { getMetaTransactionParameters } = require("../../helpers/test-data-generator");

const UINT256_MAX_ETHERS = ethers.BigNumber.from(2).pow(256).sub(1);

const contractLoader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

contract("Cross-chain", (accounts) => {
  let homeColony;
  let homeColonyNetwork;
  let proxyColony;
  let remoteColonyNetwork;
  let homeBridge;
  let foreignBridge;
  let homeColonyBridge;
  let remoteColonyBridge;
  let gnosisSafe;
  let zodiacBridge;
  let guardianSpy;
  let homeChainId;
  let foreignChainId;
  let wormholeHomeChainId;
  // let wormholeForeignChainId;
  let resetRelayer;

  let homeMetacolony;
  let proxyMetacolony;

  let web3HomeProvider;
  let web3ForeignProvider;

  let client;

  let homeSnapshotId;
  let foreignSnapshotId;

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  const RPC_PORT_1 = 8545;
  const RPC_PORT_2 = 8546;

  const MINER_ADDRESS = accounts[5];

  const HOME_PORT = process.env.HARDHAT_FOREIGN === "true" ? RPC_PORT_2 : RPC_PORT_1;
  const FOREIGN_PORT = process.env.HARDHAT_FOREIGN === "true" ? RPC_PORT_1 : RPC_PORT_2;

  const foreignRpcUrl = `http://127.0.0.1:${FOREIGN_PORT}`;
  const homeRpcUrl = `http://127.0.0.1:${HOME_PORT}`;

  const ethersForeignProvider = new ethers.providers.StaticJsonRpcProvider(foreignRpcUrl);
  const ethersForeignSigner = ethersForeignProvider.getSigner();
  const ethersHomeProvider = new ethers.providers.StaticJsonRpcProvider(homeRpcUrl);
  const ethersHomeSigner = ethersHomeProvider.getSigner();
  // const ethersHomeSigner = new ethers.providers.StaticJsonRpcProvider(homeRpcUrl).getSigner();
  const ethersForeignSigner2 = new ethers.providers.StaticJsonRpcProvider(foreignRpcUrl).getSigner(1);
  const ethersHomeSigner2 = new ethers.providers.StaticJsonRpcProvider(homeRpcUrl).getSigner(1);

  before(async () => {
    homeChainId = await ethersHomeSigner.provider.send("eth_chainId", []);
    homeChainId = ethers.BigNumber.from(homeChainId).toHexString();
    foreignChainId = await ethersForeignSigner.provider.send("eth_chainId", []);
    foreignChainId = ethers.BigNumber.from(foreignChainId).toHexString();

    // We need to deploy the network to the other chain
    try {
      await exec(
        `CHAIN_ID=${
          process.env.HARDHAT_FOREIGN === "true" ? parseInt(homeChainId, 16) : parseInt(foreignChainId, 16)
        } npx hardhat deploy --network development2`,
      );
    } catch (err) {
      console.log(err);
      process.exit(1);
    }

    await exec(`PORT=${FOREIGN_PORT} bash ./scripts/setup-foreign-chain.sh`);
    ({ guardianSpy, resetRelayer, gnosisSafe, zodiacBridge, homeBridge, foreignBridge, remoteColonyBridge, homeColonyBridge } = await setupBridging(
      homeRpcUrl,
      [foreignRpcUrl],
    ));

    // Add bridge to the foreign colony network
    // const homeNetworkId = await ethersHomeSigner.provider.send("net_version", []);
    // Due to limitations, for local testing, our wormhole chainIDs have to be 'real' wormhole chainids.
    // So I've decreed that for chainId 256669100, we use 10003 (which is really arbitrum sepolia)
    // and for chainId 256669101, we use 10002 (which is really sepolia).
    // This isn't ideal, but it's the best solution I have for now
    homeChainId = await ethersHomeSigner.provider.send("eth_chainId", []);
    wormholeHomeChainId = evmChainIdToWormholeChainId(homeChainId);

    // const foreignNetworkId = await ethersForeignSigner.provider.send("net_version", []);
    // foreignChainId = await ethersForeignSigner.provider.send("eth_chainId", []);
    // wormholeForeignChainId = evmChainIdToWormholeChainId(foreignChainId);

    // Deploy shell colonyNetwork to whichever chain truffle hasn't already deployed to.
    // try {
    //   if (process.env.HARDHAT_FOREIGN === "true") {
    //     await exec(`CHAIN_ID=${parseInt(foreignChainId, 16)} npx hardhat ensureCreateXDeployed --network development`);
    //   } else {
    //     await exec(`CHAIN_ID=${parseInt(foreignChainId, 16)} npx hardhat ensureCreateXDeployed --network development2`);
    //   }

    //   const createX = await new ethers.Contract(CREATEX_ADDRESS, ICreateX.abi, ethersForeignSigner);

    //   // This is a fake instance of an etherRouter, just so we can call encodeABs
    //   const fakeEtherRouter = await EtherRouterCreate3.at(CREATEX_ADDRESS);
    //   const setOwnerData = fakeEtherRouter.contract.methods.setOwner(accounts[0]).encodeABI();

    //   const tx = await createX["deployCreate3AndInit(bytes32,bytes,bytes,(uint256,uint256))"](
    //     `0xb77d57f4959eafa0339424b83fcfaf9c15407461005e95d52076387600e2c1e9`,
    //     EtherRouterCreate3.bytecode,
    //     setOwnerData,
    //     [0, 0],
    //     { from: accounts[0] },
    //   );

    //   const receipt = await tx.wait();

    //   const etherRouter = await new ethers.Contract(
    //     receipt.events.filter((log) => log.event === "ContractCreation")[0].args.newContract,
    //     EtherRouter.abi,
    //     ethersForeignSigner,
    //   );
    //   let resolver = await new ethers.ContractFactory(Resolver.abi, Resolver.bytecode, ethersForeignSigner).deploy();
    //   const proxyColonyNetworkImplementation = await new ethers.ContractFactory(
    //     ProxyColonyNetwork.abi,
    //     ProxyColonyNetwork.bytecode,
    //     ethersForeignSigner,
    //   ).deploy();

    //   await setupProxyColonyNetwork(etherRouter, proxyColonyNetworkImplementation, resolver);
    //   console.log("**** shell colony network set up");

    //   // Set up the resolver for shell colonies
    //   resolver = await new ethers.ContractFactory(Resolver.abi, Resolver.bytecode, ethersForeignSigner).deploy();
    //   const proxyColonyImplementation = await new ethers.ContractFactory(ProxyColony.abi, ProxyColony.bytecode, ethersForeignSigner).deploy();

    //   await setupEtherRouter("bridging", "ProxyColony", { ProxyColony: proxyColonyImplementation.address }, resolver);
    //   const proxyColonyNetwork = new ethers.Contract(etherRouter.address, ProxyColonyNetwork.abi, ethersForeignSigner);

    //   await proxyColonyNetwork.setProxyColonyResolverAddress(resolver.address);
    // } catch (err) {
    //   console.log(err);
    //   process.exit(1);
    // }

    // 0x539 is the chain id used by truffle by default (regardless of networkid), and if
    // we see it in our tests that's the coverage chain, which builds the contract artifacts
    // in to a different location. If we see another chain id, we assume it's non-coverage
    // truffle and look for the build artifacts in the normal place.

    // const homeEtherRouterAddress = (await EtherRouter.deployed()).address;
    homeColonyNetwork = await new ethers.Contract(NETWORK_ADDRESS, IColonyNetwork.abi, ethersHomeSigner);

    // const foreignEtherRouterAddress = homeEtherRouterAddress;
    remoteColonyNetwork = await new ethers.Contract(NETWORK_ADDRESS, ProxyColonyNetwork.abi, ethersForeignSigner);
  });

  beforeEach(async () => {
    web3HomeProvider = new web3.eth.providers.HttpProvider(ethersHomeSigner.provider.connection.url);
    web3ForeignProvider = new web3.eth.providers.HttpProvider(ethersForeignSigner.provider.connection.url);

    homeSnapshotId = await snapshot(web3HomeProvider);
    foreignSnapshotId = await snapshot(web3ForeignProvider);
    guardianSpy.reset();

    let tx = await foreignBridge.setBridgeEnabled(true);
    await tx.wait();
    tx = await homeBridge.setBridgeEnabled(true);
    await tx.wait();

    const proxyMCAddress = await homeColonyNetwork.getMetaColony(); // Not a mistake - they have the same address, and .getMetaColony doesn't exist on ProxyColonyNetwork
    proxyMetacolony = await new ethers.Contract(proxyMCAddress, IMetaColony.abi, ethersForeignSigner);

    const homeMCAddress = await homeColonyNetwork.getMetaColony();
    homeMetacolony = await new ethers.Contract(homeMCAddress, IMetaColony.abi, ethersHomeSigner);

    await setForeignBridgeData(homeColonyBridge.address, remoteColonyBridge.address, ethersHomeSigner, ethersForeignSigner);
    await setHomeBridgeData(homeColonyBridge.address, remoteColonyBridge.address, ethersHomeSigner, ethersForeignSigner);
    // Bridge over skills that have been created on the foreign chain

    // const latestSkillId = await remoteColonyNetwork.getSkillCount();
    // const alreadyBridged = await homeColonyNetwork.getBridgedSkillCounts(foreignChainId);
    // for (let i = alreadyBridged.add(1); i <= latestSkillId; i = i.add(1)) {
    //   const p = guardianSpy.getPromiseForNextBridgedTransaction();
    //   tx = await remoteColonyNetwork.bridgeSkillIfNotMiningChain(i);
    //   await tx.wait();
    //   await p;
    // }
    console.log("setting up mining client ");
    // Set up mining client
    client = new ReputationMinerTestWrapper({
      loader: contractLoader,
      minerAddress: MINER_ADDRESS,
      realProviderPort: HOME_PORT,
      useJsTree: true,
    });

    await client.initialise(homeColonyNetwork.address);

    console.log("initialised");

    await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
    await client.addLogContentsToReputationTree();
    await client.submitRootHash();
    await client.confirmNewHash();

    await forwardTime(MINING_CYCLE_DURATION + CHALLENGE_RESPONSE_WINDOW_DURATION, undefined, web3HomeProvider);
    await client.addLogContentsToReputationTree();
    await client.submitRootHash();
    await client.confirmNewHash();

    // Set up a colony on the home chain. That may or may not be the truffle chain...
    homeColony = await setupColony(homeColonyNetwork);

    // const p = guardianSpy.getPromiseForNextBridgedTransaction(2);
    // remoteColony = await setupColony(remoteColonyNetwork);
    // await p;
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

  afterEach(async () => {
    await revert(web3HomeProvider, homeSnapshotId);
    await revert(web3ForeignProvider, foreignSnapshotId);
    await resetRelayer();
  });

  after(async () => {
    await guardianSpy.close();
  });

  describe("administrating cross-network bridges", async () => {
    it("colonyNetwork should have the same address on each chain", async () => {
      expect(homeColonyNetwork.address).to.equal(remoteColonyNetwork.address);
      // Check we have colony Network there - this equality is expected because of how we set up the addresses
      const homeVersionResolver = await homeColonyNetwork.getColonyVersionResolver(CURR_VERSION);
      const proxyColonyResolver = await remoteColonyNetwork.proxyColonyResolverAddress();

      expect(homeVersionResolver).to.not.equal(ADDRESS_ZERO);
      expect(proxyColonyResolver).to.not.equal(ADDRESS_ZERO);
    });

    it("colonies deployed on different chains can have same address", async () => {
      // Deploy a colony only on one chain, so that normal contract creations wouldn't have the same address
      await setupColony(homeColonyNetwork);

      let tx = await homeColonyNetwork.deployTokenViaNetwork("Test", "TST", 18);
      let res = await tx.wait();
      const { tokenAddress: homeTokenAddress } = res.events.filter((x) => x.event === "TokenDeployed")[0].args;

      tx = await homeColonyNetwork["createColony(address,uint256,string)"](homeTokenAddress, 0, "");
      res = await tx.wait();

      const { colonyAddress } = res.events.filter((x) => x.event === "ColonyAdded")[0].args;

      const coder = new ethers.utils.AbiCoder();
      const createXDeployEvent = res.events.filter((x) => x.address === CREATEX_ADDRESS)[1];
      const createdAddress = coder.decode(["address"], createXDeployEvent.topics[1])[0];

      // Check that the colony address is the same as the address that CreateX emitted an event for
      expect(createdAddress).to.equal(colonyAddress);

      const colonyCreationSalt = await homeColonyNetwork.getColonyCreationSalt({ blockTag: createXDeployEvent.blockNumber });
      console.log("colony creation salt", colonyCreationSalt);

      // Now have the colony request a deployment of a shell on the other chain.

      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const deployedColony = new ethers.Contract(colonyAddress, IColony.abi, ethersHomeSigner);

      tx = await deployedColony.createProxyColony(foreignChainId, colonyCreationSalt, { gasLimit: 1000000 });

      let receipt = await tx.wait();
      const proxyRequestEvent = receipt.events.filter((e) => e.address === homeColonyNetwork.address)[0];
      let parsed = homeColonyNetwork.interface.parseLog(proxyRequestEvent);
      expect(parsed.name).to.equal("ProxyColonyRequested");
      expect(parsed.args.destinationChainId.toHexString()).to.equal(foreignChainId);
      expect(parsed.args.salt).to.equal(colonyCreationSalt);
      receipt = await p;

      const proxyDeployedEvent = receipt.logs.filter((e) => e.address === remoteColonyNetwork.address)[0];
      parsed = remoteColonyNetwork.interface.parseLog(proxyDeployedEvent);
      expect(parsed.name).to.equal("ProxyColonyDeployed");
      expect(parsed.args.proxyColony).to.equal(deployedColony.address);

      // Did we deploy a shell colony on the foreign chain at the right address? Should have EtherRouter code...
      const code = await ethersForeignProvider.getCode(deployedColony.address);
      const codeExpected = await ethersHomeProvider.getCode(deployedColony.address);
      expect(code).to.equal(codeExpected);

      const colonyAsEtherRouter = new ethers.Contract(deployedColony.address, EtherRouter.abi, ethersForeignSigner);
      const resolverAddress = await colonyAsEtherRouter.resolver();

      const expectedResolver = await remoteColonyNetwork.proxyColonyResolverAddress();

      expect(resolverAddress).to.equal(expectedResolver);
    });

    it("colonies can't deploy proxies that aren't for themselves", async () => {
      const colony = await setupColony(homeColonyNetwork);

      const deployedColony = new ethers.Contract(colony.address, IColony.abi, ethersHomeSigner);

      const tx = await deployedColony.createProxyColony(foreignChainId, ethers.constants.HashZero, { gasLimit: 1000000 });
      checkErrorRevertEthers(tx.wait(), "colony-network-wrong-salt");
    });

    it("bridge data can be queried", async () => {
      const bridgeAddress = await homeColonyNetwork.getColonyBridgeAddress();
      expect(bridgeAddress).to.equal(homeColonyBridge.address);

      const networkAddress = await homeColonyBridge.colonyNetwork();
      expect(networkAddress).to.equal(homeColonyNetwork.address);

      const remoteColonyBridgeAddress = await homeColonyBridge.getColonyBridgeAddress(foreignChainId);
      expect(remoteColonyBridgeAddress).to.equal(remoteColonyBridge.address);
    });

    it("setColonyBridgeAddress on proxy Network can be called directly by the owner (and not a random address)", async () => {
      const owner = await remoteColonyNetwork.owner();
      expect(await remoteColonyNetwork.signer.getAddress()).to.equal(owner);
      let tx = await remoteColonyNetwork.setColonyBridgeAddress(remoteColonyBridge.address, { gasLimit: 1000000 });
      await tx.wait();

      const remoteColonyNetwork2 = new ethers.Contract(remoteColonyNetwork.address, IColonyNetwork.abi, ethersForeignSigner2);
      expect(await remoteColonyNetwork2.signer.getAddress()).to.not.equal(owner);
      tx = await remoteColonyNetwork2.setColonyBridgeAddress(remoteColonyBridge.address, { gasLimit: 1000000, from: accounts[1] });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-owner-or-bridge");
    });

    it("setColonyBridgeAddress on Home Network can only be called by the meta colony", async () => {
      const tx = await homeColonyNetwork.setColonyBridgeAddress(homeColonyBridge.address, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-caller-must-be-meta-colony");
    });

    it("callProxyNetwork can only be called through the metacolony", async () => {
      const payload = homeColonyNetwork.interface.encodeFunctionData("setColonyBridgeAddress", [ADDRESS_ZERO]);
      let tx = await homeColonyNetwork.createColonyForFrontend(ADDRESS_ZERO, "A", "A", 18, CURR_VERSION, "", "");
      await tx.wait();

      const colonyCount = await homeColonyNetwork.getColonyCount();
      const colonyAddress = await homeColonyNetwork.getColony(colonyCount);
      const fakeMetaColony = new ethers.Contract(colonyAddress, IMetaColony.abi, ethersHomeSigner);

      tx = await fakeMetaColony.callProxyNetwork(foreignChainId, [payload], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-caller-must-be-meta-colony");
    });

    it("callProxyNetwork can only be called by root permissions on the metacolony", async () => {
      const payload = remoteColonyNetwork.interface.encodeFunctionData("setColonyBridgeAddress", [ADDRESS_ZERO]);
      const homeMetacolony2 = new ethers.Contract(homeMetacolony.address, IMetaColony.abi, ethersHomeSigner2);
      let tx = await homeMetacolony2.callProxyNetwork(foreignChainId, [payload], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      // Add root permissions
      tx = await homeMetacolony.setUserRoles(
        1,
        UINT256_MAX_ETHERS,
        accounts[1],
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(ethers.BigNumber.from(2).pow(ROOT_ROLE)).toHexString(), 32),
      );

      await tx.wait();

      // Can now call
      const p = guardianSpy.getPromiseForNextBridgedTransaction();
      const tx3 = await homeMetacolony2.callProxyNetwork(foreignChainId, [payload]);
      await tx3.wait();
      await p;

      // Check call was successful
      const bridgeAddressAfter = await remoteColonyNetwork.colonyBridgeAddress();
      expect(bridgeAddressAfter).to.equal(ADDRESS_ZERO);

      // Reset permissions
      tx = await homeMetacolony.setUserRoles(1, UINT256_MAX_ETHERS, accounts[1], 1, ethers.utils.hexZeroPad("0x00", 32));
      await tx.wait();
    });

    it("setColonyBridgeAddress on Proxy Network can be used across the bridge", async () => {
      const bridgeAddress = await remoteColonyNetwork.colonyBridgeAddress();
      const payload = remoteColonyNetwork.interface.encodeFunctionData("setColonyBridgeAddress", [ADDRESS_ZERO]);
      const p = guardianSpy.getPromiseForNextBridgedTransaction();
      const tx = await homeMetacolony.callProxyNetwork(foreignChainId, [payload]);
      await tx.wait();
      await p;
      const bridgeAddressAfter = await remoteColonyNetwork.colonyBridgeAddress();
      expect(bridgeAddressAfter).to.not.equal(bridgeAddress);
    });

    it("setColonyBridgeAddress on Metacolony can't be called by an address without root permissions", async () => {
      const homeMetacolony2 = new ethers.Contract(proxyMetacolony.address, IColonyNetwork.abi, ethersHomeSigner2);

      let tx = await homeMetacolony2.setColonyBridgeAddress(ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      // Add root permissions
      tx = await homeMetacolony.setUserRoles(
        1,
        UINT256_MAX_ETHERS,
        accounts[1],
        1,
        ethers.utils.hexZeroPad(ethers.BigNumber.from(ethers.BigNumber.from(2).pow(ROOT_ROLE)).toHexString(), 32),
      );
      await tx.wait();

      // Can now call
      tx = await homeMetacolony2.setColonyBridgeAddress(ADDRESS_ZERO, {
        gasLimit: 1000000,
      });
      await tx.wait();

      // Reset permissions
      tx = await proxyMetacolony.setUserRoles(1, UINT256_MAX_ETHERS, accounts[1], 1, ethers.utils.hexZeroPad("0x00", 32));
      await tx.wait();
    });

    it("setColonyNetworkAddress can only set information for bridges where assumptions we've made about chainid are not broken", async () => {
      const tx = await homeColonyBridge.setColonyBridgeAddress(UINT256_MAX_ETHERS, ADDRESS_ZERO, {
        gasLimit: 1000000,
      });
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-chainid-too-large");
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
      const p = guardianSpy.getPromiseForNextBridgedTransaction();

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

  describe("collecting and paying out tokens on another chain", async () => {
    let foreignToken;
    let colony;
    beforeEach(async () => {
      colony = await setupColony(homeColonyNetwork);

      const events = await homeColonyNetwork.queryFilter(homeColonyNetwork.filters.ColonyAdded());
      // homeColonyNetwork.fil
      // Deploy a proxy colony on the foreign network

      const colonyCreationSalt = await homeColonyNetwork.getColonyCreationSalt({ blockTag: events[events.length - 1].blockNumber });

      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const tx = await colony.createProxyColony(foreignChainId, colonyCreationSalt, { gasLimit: 1000000 });
      await tx.wait();

      await p;
      proxyColony = new ethers.Contract(colony.address, ProxyColony.abi, ethersForeignSigner);
      // Deploy a token on the foreign network

      const tokenFactory = new ethers.ContractFactory(MetaTxToken.abi, MetaTxToken.bytecode, ethersForeignSigner);
      foreignToken = await tokenFactory.deploy("Test Token", "TT", 18);
      await (await foreignToken.unlock()).wait();

      await (await colony.setArbitrationRole(1, UINT256_MAX_ETHERS, accounts[0], 1, true)).wait();
      await (await colony.setFundingRole(1, UINT256_MAX_ETHERS, accounts[0], 1, true)).wait();
    });

    it("Can track tokens received on the foreign chain", async () => {
      const tokenAmount = ethers.utils.parseEther("100");

      let tx = await foreignToken["mint(address,uint256)"](proxyColony.address, tokenAmount);
      await tx.wait();

      // Claim on the foreign chain

      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      tx = await proxyColony.claimTokens(foreignToken.address);
      await tx.wait();

      const receipt = await p;
      expect(receipt.status).to.equal(1);

      // Check bookkeeping on the home chain

      const balance = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      expect(balance.toHexString()).to.equal(tokenAmount.toHexString());
    });

    it("Can claim tokens received on foreign chain via cross-chain request", async () => {
      const tokenAmount = ethers.utils.parseEther("100");

      let tx = await foreignToken["mint(address,uint256)"](proxyColony.address, tokenAmount);
      await tx.wait();

      // Claim on the foreign chain
      const p = guardianSpy.getPromiseForNextBridgedTransaction(2);
      // One bridged transaction will be the request across, one will be reporting what was claimed back

      const payload = proxyColony.interface.encodeFunctionData("claimTokens", [foreignToken.address]);
      tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [proxyColony.address], [payload]);
      await tx.wait();
      await p;

      // Check bookkeeping on the home chain

      const balance = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      expect(balance.toHexString()).to.equal(tokenAmount.toHexString());
    });

    it("Can claim tokens received on foreign chain via metatransaction", async () => {
      const tokenAmount = ethers.utils.parseEther("100");

      let tx = await foreignToken["mint(address,uint256)"](proxyColony.address, tokenAmount);
      await tx.wait();

      const metatransactionNonceBefore = await proxyColony.getMetatransactionNonce(accounts[1]);

      // Claim on the foreign chain via metatransaction
      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const payload = proxyColony.interface.encodeFunctionData("claimTokens", [foreignToken.address]);

      const { r, s, v } = await getMetaTransactionParameters(payload, accounts[1], proxyColony.address, foreignChainId);

      tx = await proxyColony.executeMetaTransaction(accounts[1], payload, r, s, v, { from: accounts[0] });
      await tx.wait();
      await p;

      // Check bookkeeping on the home chain
      const balance = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      expect(balance.toHexString()).to.equal(tokenAmount.toHexString());

      // Check nonce incremented
      const metatransactionNonceAfter = await proxyColony.getMetatransactionNonce(accounts[1]);
      expect(metatransactionNonceAfter.toHexString()).to.equal(metatransactionNonceBefore.add(1).toHexString());
    });

    it("Can track native tokens received on foreign chains", async () => {
      const tokenAmount = ethers.utils.parseEther("1");

      await ethersForeignSigner.sendTransaction({
        to: proxyColony.address,
        value: tokenAmount,
      });

      // Claim on foreign chain
      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const tx = await proxyColony.claimTokens(ADDRESS_ZERO);
      await tx.wait();

      const receipt = await p;
      expect(receipt.status).to.equal(1);

      // Check bookkeeping on the home chain

      const balance = await colony.getFundingPotProxyBalance(1, foreignChainId, ADDRESS_ZERO);
      expect(balance.toHexString()).to.equal(tokenAmount.toHexString());
    });

    it("Can track tokens sent on the foreign chain", async () => {
      const tokenAmount = ethers.utils.parseEther("100");

      let tx = await foreignToken["mint(address,uint256)"](proxyColony.address, tokenAmount);
      await tx.wait();

      // Claim on the foreign chain
      let p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await proxyColony.claimTokens(foreignToken.address);
      await tx.wait();
      await p;

      // Make a payment that pays out 30

      const paymentAmount = ethers.utils.parseEther("30");
      tx = await colony.makeExpenditure(1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      const expenditureId = await colony.getExpenditureCount();

      tx = await colony.setExpenditureRecipient(expenditureId, 1, accounts[0]);
      await tx.wait();

      tx = await colony["setExpenditurePayout(uint256,uint256,uint256,uint256,uint256,address,uint256)"](
        1,
        UINT256_MAX_ETHERS,
        expenditureId,
        1,
        foreignChainId,
        foreignToken.address,
        paymentAmount,
      );
      await tx.wait();

      const domain1 = await colony.getDomain(1);
      const expenditure = await colony.getExpenditure(expenditureId);

      tx = await colony["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX_ETHERS,
        1,
        UINT256_MAX_ETHERS,
        UINT256_MAX_ETHERS,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        paymentAmount,
        foreignChainId,
        foreignToken.address,
      );
      await tx.wait();
      tx = await colony.finalizeExpenditure(expenditureId);
      await tx.wait();

      p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await colony["claimExpenditurePayout(uint256,uint256,uint256,address)"](expenditureId, 1, foreignChainId, foreignToken.address);
      await tx.wait();
      await p;
      // Check bookkeeping on the home chain

      const balance1 = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      expect(balance1.toHexString()).to.equal(ethers.utils.parseEther("70").toHexString());

      // Check actually paid on foreign chain
      const colonyBalance = await foreignToken.balanceOf(proxyColony.address);
      const recipientBalance = await foreignToken.balanceOf(accounts[0]);

      expect(colonyBalance.toHexString()).to.equal(ethers.utils.parseEther("70").toHexString());
      expect(recipientBalance.toHexString()).to.equal(ethers.utils.parseEther("30").toHexString());
    });

    it("Can track native tokens sent on the foreign chain", async () => {
      const tokenAmount = ethers.utils.parseEther("1");

      let tx = await ethersForeignSigner.sendTransaction({
        to: proxyColony.address,
        value: tokenAmount,
      });
      await tx.wait();

      // Claim on the foreign chain
      let p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await proxyColony.claimTokens(ADDRESS_ZERO);
      await tx.wait();
      await p;

      // Make a payment that pays out 0.3

      const paymentAmount = ethers.utils.parseEther("0.3");
      tx = await colony.makeExpenditure(1, UINT256_MAX_ETHERS, 1);
      await tx.wait();
      const expenditureId = await colony.getExpenditureCount();

      tx = await colony.setExpenditureRecipient(expenditureId, 1, accounts[0]);
      await tx.wait();

      tx = await colony["setExpenditurePayout(uint256,uint256,uint256,uint256,uint256,address,uint256)"](
        1,
        UINT256_MAX_ETHERS,
        expenditureId,
        1,
        foreignChainId,
        ADDRESS_ZERO,
        paymentAmount,
      );
      await tx.wait();

      const domain1 = await colony.getDomain(1);
      const expenditure = await colony.getExpenditure(expenditureId);

      tx = await colony["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX_ETHERS,
        1,
        UINT256_MAX_ETHERS,
        UINT256_MAX_ETHERS,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        paymentAmount,
        foreignChainId,
        ADDRESS_ZERO,
      );
      await tx.wait();
      tx = await colony.finalizeExpenditure(expenditureId);
      await tx.wait();

      const receipientBalanceBefore = await ethersForeignProvider.getBalance(accounts[0]);

      p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await colony["claimExpenditurePayout(uint256,uint256,uint256,address)"](expenditureId, 1, foreignChainId, ADDRESS_ZERO);
      await tx.wait();
      await p;
      // Check bookkeeping on the home chain

      const balance1 = await colony.getFundingPotProxyBalance(1, foreignChainId, ADDRESS_ZERO);
      expect(balance1.toHexString()).to.equal(ethers.utils.parseEther("0.7").toHexString());

      // Check actually paid on foreign chain
      const colonyBalance = await ethersForeignProvider.getBalance(proxyColony.address);
      const recipientBalanceAfter = await ethersForeignProvider.getBalance(accounts[0]);

      expect(colonyBalance.toHexString()).to.equal(ethers.utils.parseEther("0.7").toHexString());
      expect(recipientBalanceAfter.sub(receipientBalanceBefore).toHexString()).to.equal(ethers.utils.parseEther("0.3").toHexString());
    });

    it("a bookkeeping error will mean that tokens can no longer be claimed until tokens are returned", async () => {
      const tokenAmount = ethers.utils.parseEther("100");

      let tx = await foreignToken["mint(address,uint256)"](proxyColony.address, tokenAmount);
      await tx.wait();

      // Claim on the foreign chain
      const p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await proxyColony.claimTokens(foreignToken.address);
      await tx.wait();
      await p;

      // Now remove the tokens
      const balanceSlot = ethers.utils.keccak256(
        ethers.utils.concat([ethers.utils.hexZeroPad(proxyColony.address, 32), ethers.utils.hexZeroPad(1, 32)]),
      );

      await ethersForeignProvider.send("hardhat_setStorageAt", [
        foreignToken.address,
        balanceSlot,
        ethers.utils.hexZeroPad(ethers.utils.parseEther("30").toHexString(), 32),
      ]);

      tx = await proxyColony.claimTokens(foreignToken.address, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-shell-token-bookkeeping-error");

      // Now return the tokens
      await ethersForeignProvider.send("hardhat_setStorageAt", [
        foreignToken.address,
        balanceSlot,
        ethers.utils.hexZeroPad(ethers.utils.parseEther("100").toHexString(), 32),
      ]);

      // Mint some more tokens
      tx = await foreignToken["mint(address,uint256)"](proxyColony.address, ethers.utils.parseEther("100"));
      await tx.wait();

      // Can now claim
      const p2 = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await proxyColony.claimTokens(foreignToken.address);
      await tx.wait();
      await p2;
    });

    it("can exchange tokens in a domain on one chain for tokens in a domain on another chain via LiFi", async () => {
      const homeTokenFactory = new ethers.ContractFactory(MetaTxToken.abi, MetaTxToken.bytecode, ethersHomeSigner);
      const homeToken = await homeTokenFactory.deploy("Test Token", "TT", 18);

      expect(homeToken.address).to.not.equal(foreignToken.address);
      await (await homeToken.unlock()).wait();
      await (await foreignToken.unlock()).wait();

      await homeToken["mint(address,uint256)"](homeColony.address, ethers.utils.parseEther("100"));
      await homeColony.claimColonyFunds(homeToken.address);
      await homeColony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      const domain1 = await homeColony.getDomain(1);
      const domain2 = await homeColony.getDomain(2);

      let tx = await homeColony["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX_ETHERS,
        1,
        UINT256_MAX_ETHERS,
        0,
        domain1.fundingPotId,
        domain2.fundingPotId,
        ethers.utils.parseEther("50"),
        homeChainId,
        homeToken.address,
      );
      await tx.wait();

      const domain2ReceiverAddress = await homeColonyNetwork.getDomainTokenReceiverAddress(proxyColony.address, 2);

      const lifi = new ethers.Contract(LIFI_ADDRESS, LiFiFacetProxyMock.abi, ethersHomeSigner);

      const txdata = lifi.interface.encodeFunctionData("swapTokensMock(uint256,address,uint256,address,address,uint256)", [
        homeChainId,
        homeToken.address,
        foreignChainId,
        foreignToken.address,
        domain2ReceiverAddress,
        ethers.utils.parseEther("50"),
      ]);

      tx = await homeColony.exchangeTokensViaLiFi(1, 0, 2, txdata, 0, homeToken.address, ethers.utils.parseEther("50"));

      const receipt = await tx.wait();
      const swapEvent = receipt.events
        .filter((e) => e.address === LIFI_ADDRESS)
        .map((e) => lifi.interface.parseLog(e))
        .filter((e) => e.name === "SwapTokens")[0];
      expect(swapEvent).to.not.be.undefined;

      // Okay, so we saw the SwapTokens event. Let's do vaguely what it said for the test,
      // but in practise this would be the responsibility of whatever entity we've paid to do it
      // through LiFi.
      await foreignToken["mint(address,uint256)"](swapEvent.args._toAddress, swapEvent.args._amount); // Implicit 1:1 exchange rate

      // Now claim the tokens on the foreign chain
      const p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await proxyColony.claimTokensForDomain(foreignToken.address, 2, { gasLimit: 1000000 });
      await tx.wait();
      await p;

      // See if bookkeeping was tracked correctly
      const domain = await colony.getDomain(2);
      const balance = await colony.getFundingPotProxyBalance(domain.fundingPotId, foreignChainId, foreignToken.address);
      expect(balance.toHexString()).to.equal(ethers.utils.parseEther("50").toHexString());
    });

    it("can exchange tokens in a domain held by the proxy to different tokens also on the proxy", async () => {
      const foreignTokenFactory = new ethers.ContractFactory(MetaTxToken.abi, MetaTxToken.bytecode, ethersForeignSigner);
      const foreignToken2 = await foreignTokenFactory.deploy("TT2", "TT2", 18);
      await (await foreignToken2.unlock()).wait();
      await (await foreignToken.unlock()).wait();

      let tx = await foreignToken["mint(address,uint256)"](proxyColony.address, ethers.utils.parseEther("100"));
      await tx.wait();
      let p = guardianSpy.getPromiseForNextBridgedTransaction();

      tx = await proxyColony.claimTokens(foreignToken.address);
      await tx.wait();
      await p;

      // Check bookkeeping on the home chain
      const balance = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      expect(balance.toHexString()).to.equal(ethers.utils.parseEther("100").toHexString());

      // Move tokens from domain 1 to domain 2
      tx = await colony["addDomain(uint256,uint256,uint256)"](1, UINT256_MAX_ETHERS, 1);
      await tx.wait();

      const domain1 = await colony.getDomain(1);
      const domain2 = await colony.getDomain(2);
      console.log(domain2);
      const fundingPot = await colony.getFundingPot(domain2.fundingPotId);
      console.log(fundingPot);

      tx = await colony["moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"](
        1,
        UINT256_MAX_ETHERS,
        1,
        UINT256_MAX_ETHERS,
        0,
        domain1.fundingPotId,
        domain2.fundingPotId,
        ethers.utils.parseEther("70"),
        foreignChainId,
        foreignToken.address,
      );
      await tx.wait();
      console.log("moved");
      // Exchange tokens
      const domain2ReceiverAddress = await homeColonyNetwork.getDomainTokenReceiverAddress(colony.address, 2);

      const lifi = new ethers.Contract(LIFI_ADDRESS, LiFiFacetProxyMock.abi, ethersForeignSigner); // Signer doesn't really matter,
      // we're just calling encodeFunctionData

      const txdata = lifi.interface.encodeFunctionData("swapTokensMock(uint256,address,uint256,address,address,uint256)", [
        foreignChainId,
        foreignToken.address,
        foreignChainId,
        foreignToken2.address,
        domain2ReceiverAddress,
        ethers.utils.parseEther("70"),
      ]);

      p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await colony.exchangeProxyHeldTokensViaLiFi(1, 0, 2, txdata, 0, foreignChainId, foreignToken.address, ethers.utils.parseEther("70"));
      await tx.wait();

      const receipt = await p;
      const swapEvent = receipt.logs
        .filter((e) => e.address === LIFI_ADDRESS)
        .map((e) => lifi.interface.parseLog(e))
        .filter((e) => e.name === "SwapTokens")[0];
      expect(swapEvent).to.not.be.undefined;

      // Okay, so we saw the SwapTokens event. Let's do vaguely what it said for the test,
      // but in practise this would be the responsibility of whatever entity we've paid to do it
      // through LiFi.
      await foreignToken2["mint(address,uint256)"](swapEvent.args._toAddress, swapEvent.args._amount); // Implicit 1:1 exchange rate

      // Sweep token in to the proxy
      p = guardianSpy.getPromiseForNextBridgedTransaction();
      tx = await proxyColony.claimTokensForDomain(foreignToken2.address, 2, { gasLimit: 1000000 });
      await tx.wait();

      // Wait for the sweep to be bridged
      await p;

      // Check bookkeeping on the home chain
      const balance1 = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      const balance2 = await colony.getFundingPotProxyBalance(2, foreignChainId, foreignToken2.address);
      expect(balance1.toHexString()).to.equal(ethers.utils.parseEther("30").toHexString());
      expect(balance2.toHexString()).to.equal(ethers.utils.parseEther("70").toHexString());

      // And check balances of the proxy with the tokens
      const balance3 = await foreignToken.balanceOf(proxyColony.address);
      const balance4 = await foreignToken2.balanceOf(proxyColony.address);
      expect(balance3.toHexString()).to.equal(ethers.utils.parseEther("30").toHexString());
      expect(balance4.toHexString()).to.equal(ethers.utils.parseEther("70").toHexString());
    });
  });

  describe("making arbitrary transactions on another chain", async () => {
    let colony;
    let foreignToken;
    beforeEach(async () => {
      colony = await setupColony(homeColonyNetwork);

      const events = await homeColonyNetwork.queryFilter(homeColonyNetwork.filters.ColonyAdded());
      // Deploy a proxy colony on the foreign network

      const colonyCreationSalt = await homeColonyNetwork.getColonyCreationSalt({ blockTag: events[events.length - 1].blockNumber });

      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const tx = await colony.createProxyColony(foreignChainId, colonyCreationSalt, { gasLimit: 1000000 });
      await tx.wait();

      await p;
      proxyColony = new ethers.Contract(colony.address, ProxyColony.abi, ethersForeignSigner);
      // Deploy a token on the foreign network

      const tokenFactory = new ethers.ContractFactory(MetaTxToken.abi, MetaTxToken.bytecode, ethersForeignSigner);
      foreignToken = await tokenFactory.deploy("Test Token", "TT", 18);
      await (await foreignToken.unlock()).wait();
      await (await foreignToken.setOwner(proxyColony.address)).wait();
    });

    it("can make arbitrary transactions on the foreign chain", async () => {
      const balanceBefore = await foreignToken.balanceOf(proxyColony.address);
      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const payload = foreignToken.interface.encodeFunctionData("mint(address,uint256)", [proxyColony.address, ethers.utils.parseEther("100")]);

      const tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [foreignToken.address], [payload]);
      await tx.wait();
      await p;

      const balanceAfter = await foreignToken.balanceOf(proxyColony.address);
      expect(balanceAfter.sub(balanceBefore).toHexString()).to.equal(ethers.utils.parseEther("100").toHexString());
    });

    it("root permissions are required for makeProxyArbitraryTransactions", async () => {
      const p = guardianSpy.getPromiseForNextBridgedTransaction();
      let tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [foreignToken.address], ["0x00000000"]);
      await tx.wait();
      await p;

      await colony.setUserRoles(1, UINT256_MAX_ETHERS, accounts[0], 1, ethers.utils.hexZeroPad("0x00", 32));
      tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [foreignToken.address], ["0x00000000"], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");
    });

    it("arbitrary transactions on the foreign chain must go to contracts", async () => {
      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const payload = foreignToken.interface.encodeFunctionData("mint(address,uint256)", [proxyColony.address, ethers.utils.parseEther("100")]);

      const tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [accounts[0]], [payload]);
      await tx.wait();
      await p;

      await checkErrorRevertEthers(p, "require-execute-call-target-not-contract");
    });

    it("can make multiple arbitrary transactions on the foreign chain in one go", async () => {
      const shellBalanceBefore = await foreignToken.balanceOf(proxyColony.address);
      const colonyBalanceBefore = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);

      const p = guardianSpy.getPromiseForNextBridgedTransaction(2);

      const payload1 = foreignToken.interface.encodeFunctionData("mint(address,uint256)", [proxyColony.address, ethers.utils.parseEther("100")]);
      const payload2 = proxyColony.interface.encodeFunctionData("claimTokens(address)", [foreignToken.address]);

      const tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [foreignToken.address, proxyColony.address], [payload1, payload2]);
      await tx.wait();
      await p;

      const shellBalanceAfter = await foreignToken.balanceOf(proxyColony.address);
      expect(shellBalanceAfter.sub(shellBalanceBefore).toHexString()).to.equal(ethers.utils.parseEther("100").toHexString());

      // Check that the second transaction was successful

      const colonyBalanceAfter = await colony.getFundingPotProxyBalance(1, foreignChainId, foreignToken.address);
      expect(colonyBalanceAfter.sub(colonyBalanceBefore).toHexString()).to.equal(ethers.utils.parseEther("100").toHexString());
    });

    it("invalid cross-chain arbitrary transactions are rejected", async () => {
      let p = guardianSpy.getPromiseForNextBridgedTransaction();

      const tx = await colony.makeProxyArbitraryTransactions(foreignChainId, [foreignToken.address], ["0x00000000", "0x00000000"]);
      await tx.wait();

      await checkErrorRevertEthers(p, "colony-targets-and-payloads-length-mismatch");

      // Check can't target Network
      p = guardianSpy.getPromiseForNextBridgedTransaction();
      const tx2 = await colony.makeProxyArbitraryTransactions(foreignChainId, [remoteColonyNetwork.address], ["0x00000000"]);
      await tx2.wait();

      await checkErrorRevertEthers(p, "colony-cannot-target-network");

      // Check can't target the bridge
      p = guardianSpy.getPromiseForNextBridgedTransaction();
      const tx3 = await colony.makeProxyArbitraryTransactions(foreignChainId, [remoteColonyBridge.address], ["0x00000000"]);
      await tx3.wait();

      await checkErrorRevertEthers(p, "colony-cannot-target-bridge");

      // Otherwise valid transaction, it just fails
      p = guardianSpy.getPromiseForNextBridgedTransaction();
      const tx4 = await colony.makeProxyArbitraryTransactions(foreignChainId, [foreignToken.address], ["0x00000000"]);
      await tx4.wait();

      await checkErrorRevertEthers(p, "require-execute-call-reverted-with-no-error");
    });
  });

  describe("bridge functions are secure", async () => {
    it("only the configured colonyNetwork can call `sendMessage`", async () => {
      const tx = await remoteColonyBridge.sendMessage(1, ADDRESS_ZERO, "0x00000000", { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "wormhole-bridge-only-colony-network");
    });

    it("an invalid VM is respected", async () => {
      await homeBridge.setVerifyVMResult(false, "some-good-reason");
      const vaa = await guardianSpy.encodeMockVAA(
        homeColonyBridge.address,
        0,
        0,
        remoteColonyNetwork.interface.encodeFunctionData("setProxyColonyResolverAddress", [ADDRESS_ZERO]),
        100,
        wormholeHomeChainId,
      );
      const tx = await homeColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "some-good-reason");
      await homeBridge.setVerifyVMResult(true, "");
    });
  });

  describe("ProxyColony functions are secure", async () => {
    let colony;
    beforeEach(async () => {
      colony = await setupColony(homeColonyNetwork);

      const events = await homeColonyNetwork.queryFilter(homeColonyNetwork.filters.ColonyAdded());
      // Deploy a proxy colony on the foreign network
      const colonyCreationSalt = await homeColonyNetwork.getColonyCreationSalt({ blockTag: events[events.length - 1].blockNumber });

      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const tx = await colony.createProxyColony(foreignChainId, colonyCreationSalt, { gasLimit: 1000000 });
      await tx.wait();

      await p;
      proxyColony = new ethers.Contract(colony.address, ProxyColony.abi, ethersForeignSigner);
    });

    it("a non-bridge address cannot call transferFromBridge", async () => {
      const tx = await proxyColony.transferFromBridge(ADDRESS_ZERO, ADDRESS_ZERO, 0, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-only-bridge");
    });

    it("a non-bridge address cannot call makeArbitraryTransactions", async () => {
      const tx = await proxyColony.makeArbitraryTransactions([], [], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-only-bridge");
    });
  });

  describe("ProxyColonyNetwork functions are secure", async () => {
    let proxyColonyNetwork2;
    before(async () => {
      proxyColonyNetwork2 = await new ethers.Contract(NETWORK_ADDRESS, ProxyColonyNetwork.abi, ethersForeignSigner2);
    });

    it("only authed accounts can call setProxyColonyResolverAddress", async () => {
      let tx = await proxyColonyNetwork2.setProxyColonyResolverAddress(ADDRESS_ZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");

      await remoteColonyNetwork.setOwner(accounts[1]);
      tx = await proxyColonyNetwork2.setProxyColonyResolverAddress(ADDRESS_ZERO, { gasLimit: 1000000 });
      await tx.wait();
    });

    it("a non-authed account cannot call setHomeChainId", async () => {
      let tx = await proxyColonyNetwork2.setHomeChainId(1, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "ds-auth-unauthorized");
      await remoteColonyNetwork.setOwner(accounts[1]);

      tx = await proxyColonyNetwork2.setHomeChainId(1, { gasLimit: 1000000 });
      await tx.wait();
    });

    it("a non-bridge address cannot call createProxyColonyFromBridge", async () => {
      const tx = await remoteColonyNetwork.createProxyColonyFromBridge(HASHZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-colony-bridge");
    });

    it("a non-proxy-colony address cannot call bridgeMessage", async () => {
      const tx = await remoteColonyNetwork.bridgeMessage(HASHZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-network-caller-must-be-proxy-colony");
    });
  });

  describe("ColonyNetwork functions are secure", async () => {
    it("a non-colony address cannot call bridgeMessage", async () => {
      const tx = await homeColonyNetwork.bridgeMessage(1, HASHZERO, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-caller-must-be-colony");
    });
  });

  describe("Invalid interactions with bridging system are handled appropriately", async () => {
    it("Can't bridge to a chain that's not supported", async () => {
      const tx = await homeColony.makeProxyArbitraryTransactions(111, [ADDRESS_ZERO], ["0x00000000"], { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-not-known-chain");
    });

    it("Valid VAAs that aren't from a colony bridge are rejected", async () => {
      const vaa = await guardianSpy.encodeMockVAA(
        homeColonyBridge.address,
        0,
        0,
        remoteColonyNetwork.interface.encodeFunctionData("setProxyColonyResolverAddress", [ADDRESS_ZERO]),
        100,
        1,
      );
      const tx = await remoteColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-bridged-tx-only-from-colony-bridge");
    });

    it("Valid VAAs that aren't for the right chain are rejected", async () => {
      const vaa = await guardianSpy.encodeMockVAA(
        homeColonyBridge.address,
        0,
        0,
        new ethers.utils.AbiCoder().encode(
          ["uint256", "address", "bytes"],
          [7777, ADDRESS_ZERO, remoteColonyNetwork.interface.encodeFunctionData("setProxyColonyResolverAddress", [ADDRESS_ZERO])],
        ),
        100,
        wormholeHomeChainId,
      );
      const tx = await remoteColonyBridge.receiveMessage(vaa, { gasLimit: 1000000 });
      // await tx.wait();
      await checkErrorRevertEthers(tx.wait(), "colony-bridge-destination-chain-id-mismatch");
    });
  });

  describe("OneTxPayment", async () => {
    let version;
    before(async () => {
      const oneTxPaymentFactory = new ethers.ContractFactory(OneTxPayment.abi, OneTxPayment.bytecode, ethersHomeSigner);
      const extension = await oneTxPaymentFactory.deploy();
      version = await extension.version();
    });

    beforeEach(async () => {
      const events = await homeColonyNetwork.queryFilter(homeColonyNetwork.filters.ColonyAdded());
      // homeColonyNetwork.fil
      // Deploy a proxy colony on the foreign network

      const colonyCreationSalt = await homeColonyNetwork.getColonyCreationSalt({ blockTag: events[events.length - 1].blockNumber });

      const p = guardianSpy.getPromiseForNextBridgedTransaction();

      const tx = await homeColony.createProxyColony(foreignChainId, colonyCreationSalt, { gasLimit: 1000000 });
      await tx.wait();

      await p;
      proxyColony = new ethers.Contract(homeColony.address, ProxyColony.abi, ethersForeignSigner);
      // Deploy a token on the foreign network
    });

    it("Can make a OneTxPayment cross-chain", async () => {
      const tokenFactory = new ethers.ContractFactory(MetaTxToken.abi, MetaTxToken.bytecode, ethersForeignSigner);
      const foreignToken = await tokenFactory.deploy("Test Token", "TT", 18);
      await (await foreignToken.unlock()).wait();

      const tokenAmount = ethers.utils.parseEther("100");
      await foreignToken["mint(address,uint256)"](proxyColony.address, tokenAmount);

      let p = guardianSpy.getPromiseForNextBridgedTransaction();

      let tx = await proxyColony.claimTokens(foreignToken.address);
      await tx.wait();

      await p;

      const paymentAmount = ethers.utils.parseEther("30");
      const ONE_TX_PAYMENT = ethers.utils.id("OneTxPayment");
      await homeColony.installExtension(ONE_TX_PAYMENT, version);

      const oneTxPaymentAddress = await homeColonyNetwork.getExtensionInstallation(ONE_TX_PAYMENT, homeColony.address);
      const oneTxPayment = await new ethers.Contract(oneTxPaymentAddress, OneTxPayment.abi, ethersHomeSigner);

      const ROLES = rolesToBytes32([ARBITRATION_ROLE, FUNDING_ROLE, ADMINISTRATION_ROLE]);
      await homeColony.setUserRoles(1, UINT256_MAX_ETHERS, oneTxPayment.address, 1, ROLES);

      const balanceBefore = await foreignToken.balanceOf(accounts[0]);

      p = guardianSpy.getPromiseForNextBridgedTransaction();
      console.log("amkepayment");
      tx = await oneTxPayment["makePayment(uint256,uint256,uint256,uint256,address[],uint256[],address[],uint256[],uint256,uint256)"](
        1,
        UINT256_MAX_ETHERS,
        1,
        UINT256_MAX_ETHERS,
        [accounts[0]],
        [foreignChainId],
        [foreignToken.address],
        [paymentAmount],
        1,
        0,
      );
      await tx.wait();
      await p;

      const balanceAfter = await foreignToken.balanceOf(accounts[0]);
      expect(balanceAfter.sub(balanceBefore).toHexString()).to.equal(paymentAmount.toHexString());
    });
  });
});
