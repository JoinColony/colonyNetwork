/* globals artifacts, hre */
const fs = require("fs");

const EtherRouter = artifacts.require("EtherRouter");
const EtherRouterCreate3 = artifacts.require("EtherRouterCreate3");
const Resolver = artifacts.require("Resolver");
const ContractRecovery = artifacts.require("ContractRecovery");

const Colony = artifacts.require("Colony");
const ColonyDomains = artifacts.require("ColonyDomains");
const ColonyExpenditure = artifacts.require("ColonyExpenditure");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyRewards = artifacts.require("ColonyRewards");
const ColonyRoles = artifacts.require("ColonyRoles");
const ColonyArbitraryTransaction = artifacts.require("ColonyArbitraryTransaction");
const IMetaColony = artifacts.require("IMetaColony");

const ColonyNetworkAuthority = artifacts.require("ColonyNetworkAuthority");
const ColonyNetwork = artifacts.require("ColonyNetwork");
const ColonyNetworkDeployer = artifacts.require("ColonyNetworkDeployer");
const ColonyNetworkMining = artifacts.require("ColonyNetworkMining");
const ColonyNetworkAuction = artifacts.require("ColonyNetworkAuction");
const ColonyNetworkENS = artifacts.require("ColonyNetworkENS");
const ColonyNetworkExtensions = artifacts.require("ColonyNetworkExtensions");
const ColonyNetworkSkills = artifacts.require("ColonyNetworkSkills");
const IColonyNetwork = artifacts.require("IColonyNetwork");

const ENSRegistry = artifacts.require("ENSRegistry");

const ReputationMiningCycle = artifacts.require("ReputationMiningCycle");
const ReputationMiningCycleRespond = artifacts.require("ReputationMiningCycleRespond");
const ReputationMiningCycleBinarySearch = artifacts.require("ReputationMiningCycleBinarySearch");

const Token = artifacts.require("Token");
const TokenAuthority = artifacts.require("contracts/common/TokenAuthority.sol:TokenAuthority");
const TokenLocking = artifacts.require("TokenLocking");
const ITokenLocking = artifacts.require("ITokenLocking");

const Version3 = artifacts.require("Version3");
const Version4 = artifacts.require("Version4");

const CoinMachine = artifacts.require("CoinMachine");
const EvaluatedExpenditure = artifacts.require("EvaluatedExpenditure");
const StakedExpenditure = artifacts.require("StakedExpenditure");
const FundingQueue = artifacts.require("FundingQueue");
const OneTxPayment = artifacts.require("OneTxPayment");
const ReputationBootstrapper = artifacts.require("ReputationBootstrapper");
const StreamingPayments = artifacts.require("StreamingPayments");
const VotingReputation = artifacts.require("VotingReputation");
const VotingReputationStaking = artifacts.require("VotingReputationStaking");
const VotingReputationMisalignedRecovery = artifacts.require("VotingReputationMisalignedRecovery");
const TokenSupplier = artifacts.require("TokenSupplier");
const Whitelist = artifacts.require("Whitelist");
const StagedExpenditure = artifacts.require("StagedExpenditure");

// We `require` the ReputationMiningCycle object to make sure
// it is injected in the `artifacts` variables during test
// preparation. We need this for the eth-gas-reporter.
// See https://github.com/cgewecke/eth-gas-reporter/issues/64
artifacts.require("ReputationMiningCycle");

const { writeFileSync } = require("fs");
const path = require("path");
const assert = require("assert");
const ethers = require("ethers");
const { soliditySha3 } = require("web3-utils");
const truffleContract = require("@truffle/contract");
const createXABI = require("../lib/createx/artifacts/src/ICreateX.sol/ICreateX.json");

let postFixtureSnapshotId;

const {
  setupUpgradableColonyNetwork,
  setupColonyVersionResolver,
  setupUpgradableTokenLocking,
  setupReputationMiningCycleResolver,
  setupENSRegistrar,
  setupEtherRouter,
} = require("../helpers/upgradable-contracts");
const { FORKED_XDAI_CHAINID, XDAI_CHAINID, UINT256_MAX, CREATEX_ADDRESS } = require("../helpers/constants");
const { getChainId, hardhatRevert, hardhatSnapshot } = require("../helpers/test-helper");

module.exports = async () => {
  if (postFixtureSnapshotId) {
    await hardhatRevert(hre.network.provider, postFixtureSnapshotId);
    postFixtureSnapshotId = await hardhatSnapshot(hre.network.provider);
    return;
  }

  await deployContracts();
  await setupColonyNetwork();
  await setupColony();
  await setupTokenLocking();
  await setupMiningCycle();
  await setupEnsRegistry();
  await setupMetaColony();
  await setupExtensions();

  postFixtureSnapshotId = await hardhatSnapshot(hre.network.provider);
};

async function deployContracts() {
  // const etherRouter = await EtherRouter.new();
  // EtherRouter.setAsDeployed(etherRouter);

  const resolver = await Resolver.new();
  Resolver.setAsDeployed(resolver);

  const contractRecovery = await ContractRecovery.new();
  ContractRecovery.setAsDeployed(contractRecovery);

  const colonyNetwork = await ColonyNetwork.new();
  ColonyNetwork.setAsDeployed(colonyNetwork);

  const colonyNetworkDeployer = await ColonyNetworkDeployer.new();
  ColonyNetworkDeployer.setAsDeployed(colonyNetworkDeployer);

  const colonyNetworkMining = await ColonyNetworkMining.new();
  ColonyNetworkMining.setAsDeployed(colonyNetworkMining);

  const colonyNetworkAuction = await ColonyNetworkAuction.new();
  ColonyNetworkAuction.setAsDeployed(colonyNetworkAuction);

  const colonyNetworkENS = await ColonyNetworkENS.new();
  ColonyNetworkENS.setAsDeployed(colonyNetworkENS);

  const colonyNetworkExtensions = await ColonyNetworkExtensions.new();
  ColonyNetworkExtensions.setAsDeployed(colonyNetworkExtensions);

  const colonyNetworkSkills = await ColonyNetworkSkills.new();
  ColonyNetworkSkills.setAsDeployed(colonyNetworkSkills);

  const reputationMiningCycle = await ReputationMiningCycle.new();
  ReputationMiningCycle.setAsDeployed(reputationMiningCycle);

  const reputationMiningCycleRespond = await ReputationMiningCycleRespond.new();
  ReputationMiningCycleRespond.setAsDeployed(reputationMiningCycleRespond);

  const reputationMiningCycleBinarySearch = await ReputationMiningCycleBinarySearch.new();
  ReputationMiningCycleBinarySearch.setAsDeployed(reputationMiningCycleBinarySearch);

  // Deploy CreateX if it's not already deployed
  const createXCode = await web3.eth.getCode(CREATEX_ADDRESS);
  if (createXCode === "0x") {
    const accounts = await web3.eth.getAccounts();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: "0xeD456e05CaAb11d66C4c797dD6c1D6f9A7F352b5",
      value: web3.utils.toWei("0.3", "ether"),
      gasPrice: web3.utils.toWei("1", "gwei"),
      gas: 300000,
    });
    const rawTx = fs
      .readFileSync("lib/createx/scripts/presigned-createx-deployment-transactions/signed_serialised_transaction_gaslimit_3000000_.json", {
        encoding: "utf8",
      })
      .replace(/"/g, "")
      .replace("\n", "");
    await web3.eth.sendSignedTransaction(rawTx);
  }
}

async function setupColonyNetwork() {
  const colonyNetwork = await ColonyNetwork.deployed();
  const colonyNetworkDeployer = await ColonyNetworkDeployer.deployed();
  const colonyNetworkMining = await ColonyNetworkMining.deployed();
  const colonyNetworkAuction = await ColonyNetworkAuction.deployed();
  const colonyNetworkENS = await ColonyNetworkENS.deployed();
  const colonyNetworkExtensions = await ColonyNetworkExtensions.deployed();
  const colonyNetworkSkills = await ColonyNetworkSkills.deployed();
  // const etherRouter = await EtherRouter.deployed();
  const resolver = await Resolver.deployed();
  const contractRecovery = await ContractRecovery.deployed();

  const accounts = await web3.eth.getAccounts();

  // Deploy EtherRouter through CreateX
  const CreateX = truffleContract({ abi: createXABI.abi });
  CreateX.setProvider(web3.currentProvider);
  const createX = await CreateX.at(CREATEX_ADDRESS);

  // This is a fake instance of an etherRouter, just so we can call encodeABI
  const fakeEtherRouter = await EtherRouterCreate3.at(colonyNetwork.address);
  const setOwnerData = fakeEtherRouter.contract.methods.setOwner(accounts[0]).encodeABI();
  const tx = await createX.methods["deployCreate3AndInit(bytes32,bytes,bytes,(uint256,uint256))"](
    // `${accounts[0]}001212121212121212121212`,
    `0xb77d57f4959eafa0339424b83fcfaf9c15407461005e95d52076387600e2c1e9`,
    EtherRouterCreate3.bytecode,
    setOwnerData,
    [0, 0],
    { from: accounts[0] },
  );

  const etherRouter = await EtherRouterCreate3.at(tx.logs.filter((log) => log.event === "ContractCreation")[0].args.newContract);
  EtherRouter.setAsDeployed(etherRouter);

  await setupUpgradableColonyNetwork(
    etherRouter,
    resolver,
    colonyNetwork,
    colonyNetworkDeployer,
    colonyNetworkMining,
    colonyNetworkAuction,
    colonyNetworkENS,
    colonyNetworkExtensions,
    colonyNetworkSkills,
    contractRecovery,
  );

  const networkAuthority = await ColonyNetworkAuthority.new(etherRouter.address);
  await networkAuthority.setOwner(etherRouter.address);
  await etherRouter.setAuthority(networkAuthority.address);

  const routerJson = JSON.stringify({ etherRouterAddress: etherRouter.address });
  writeFileSync(path.resolve(__dirname, "..", "etherrouter-address.json"), routerJson, { encoding: "utf8" });

  console.log(`  => Colony Network deployed at ${etherRouter.address}`);
}

async function setupColony() {
  // Create a new Colony (version) and setup a new Resolver for it
  const colony = await Colony.new();
  const colonyDomains = await ColonyDomains.new();
  const colonyExpenditure = await ColonyExpenditure.new();
  const colonyFunding = await ColonyFunding.new();
  const colonyRewards = await ColonyRewards.new();
  const colonyRoles = await ColonyRoles.new();
  const colonyArbitraryTransaction = await ColonyArbitraryTransaction.new();
  const contractRecovery = await ContractRecovery.new();
  const resolver = await Resolver.new();

  // Register the new Colony contract version with the newly setup Resolver
  await setupColonyVersionResolver(
    colony,
    colonyDomains,
    colonyExpenditure,
    colonyFunding,
    colonyRewards,
    colonyRoles,
    contractRecovery,
    colonyArbitraryTransaction,
    resolver,
  );

  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);
  const version = await colony.version();
  await colonyNetwork.initialise(resolver.address, version);
}

async function setupTokenLocking() {
  const resolver = await Resolver.new();
  const etherRouter = await EtherRouter.new();
  const tokenLockingContract = await TokenLocking.new();

  await setupUpgradableTokenLocking(etherRouter, resolver, tokenLockingContract);

  const colonyNetworkRouter = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(colonyNetworkRouter.address);
  await colonyNetwork.setTokenLocking(etherRouter.address);

  const tokenLocking = await TokenLocking.at(etherRouter.address);
  await tokenLocking.setColonyNetwork(colonyNetwork.address);
}

async function setupMiningCycle() {
  const reputationMiningCycle = await ReputationMiningCycle.deployed();
  const reputationMiningCycleRespond = await ReputationMiningCycleRespond.deployed();
  const reputationMiningCycleBinarySearch = await ReputationMiningCycleBinarySearch.deployed();
  const resolver = await Resolver.new();

  const colonyNetworkRouter = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(colonyNetworkRouter.address);

  // Register a new Resolver for ReputationMining instance and set it on the Network
  await setupReputationMiningCycleResolver(
    reputationMiningCycle,
    reputationMiningCycleRespond,
    reputationMiningCycleBinarySearch,
    resolver,
    colonyNetwork,
  );
}

async function setupEnsRegistry() {
  const accounts = await web3.eth.getAccounts();

  const colonyNetworkRouter = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(colonyNetworkRouter.address);

  const ensRegistry = await ENSRegistry.new();
  await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);
}

async function setupMetaColony() {
  const accounts = await web3.eth.getAccounts();

  const DEFAULT_STAKE = "2000000000000000000000000";

  const MAIN_ACCOUNT = accounts[5];
  const TOKEN_OWNER = accounts[11];

  const colonyNetworkRouter = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(colonyNetworkRouter.address);

  const clnyToken = await Token.new("Colony Network Token", "CLNY", 18);
  await colonyNetwork.createMetaColony(clnyToken.address);

  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);
  await metaColony.setNetworkFeeInverse(100);

  const tokenLockingAddress = await colonyNetwork.getTokenLocking();
  const reputationMinerTestAccounts = accounts.slice(3, 11);

  // Penultimate parameter is the vesting contract which is not the subject of this integration testing so passing in ZERO_ADDRESS
  const tokenAuthority = await TokenAuthority.new(clnyToken.address, metaColonyAddress, [
    colonyNetwork.address,
    tokenLockingAddress,
    ...reputationMinerTestAccounts,
  ]);
  await clnyToken.setAuthority(tokenAuthority.address);
  await clnyToken.setOwner(TOKEN_OWNER);

  // These commands add MAIN_ACCOUNT as a reputation miner.
  // This is necessary because the first miner must have staked before the mining cycle begins.
  await clnyToken.mint(MAIN_ACCOUNT, DEFAULT_STAKE, { from: TOKEN_OWNER });
  await clnyToken.approve(tokenLockingAddress, DEFAULT_STAKE, { from: MAIN_ACCOUNT });
  const mainAccountBalance = await clnyToken.balanceOf(MAIN_ACCOUNT);
  assert.equal(mainAccountBalance.toString(), DEFAULT_STAKE.toString());

  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  await tokenLocking.methods["deposit(address,uint256,bool)"](clnyToken.address, DEFAULT_STAKE, true, { from: MAIN_ACCOUNT });
  await colonyNetwork.stakeForMining(DEFAULT_STAKE, { from: MAIN_ACCOUNT });

  const colony = await Colony.new();
  const colonyDomains = await ColonyDomains.new();
  const colonyExpenditure = await ColonyExpenditure.new();
  const colonyFunding = await ColonyFunding.new();
  const colonyRewards = await ColonyRewards.new();
  const colonyRoles = await ColonyRoles.new();
  const contractRecovery = await ContractRecovery.deployed();
  const colonyArbitraryTransaction = await ColonyArbitraryTransaction.new();
  const resolver3 = await Resolver.new();

  await setupColonyVersionResolver(
    colony,
    colonyDomains,
    colonyExpenditure,
    colonyFunding,
    colonyRewards,
    colonyRoles,
    contractRecovery,
    colonyArbitraryTransaction,
    resolver3,
  );

  const v3responder = await Version3.new();
  await resolver3.register("version()", v3responder.address);
  await metaColony.addNetworkColonyVersion(3, resolver3.address);

  const resolver4 = await Resolver.new();
  await setupColonyVersionResolver(
    colony,
    colonyDomains,
    colonyExpenditure,
    colonyFunding,
    colonyRewards,
    colonyRoles,
    contractRecovery,
    colonyArbitraryTransaction,
    resolver4,
  );

  const v4responder = await Version4.new();
  await resolver4.register("version()", v4responder.address);
  await metaColony.addNetworkColonyVersion(4, resolver4.address);
  const chainId = await getChainId();
  const miningChainId = parseInt(process.env.MINING_CHAIN_ID, 10) || chainId;

  await metaColony.initialiseReputationMining(miningChainId, ethers.constants.HashZero, 0);
  // await colonyNetwork.startNextCycle();

  const skillCount = await colonyNetwork.getSkillCount();
  if (chainId === miningChainId) {
    if (chainId === XDAI_CHAINID || chainId === FORKED_XDAI_CHAINID) {
      assert.equal(skillCount.toNumber(), 3); // Root domain, root local skill, mining skill
    } else {
      assert.equal(skillCount.shln(128).mod(UINT256_MAX).shrn(128).toNumber(), 3);
    }
  } else {
    assert.equal(skillCount.shln(128).mod(UINT256_MAX).shrn(128).toNumber(), 2);
  }
}

async function setupExtensions() {
  const colonyNetworkRouter = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(colonyNetworkRouter.address);

  const metaColonyAddress = await colonyNetwork.getMetaColony();
  const metaColony = await IMetaColony.at(metaColonyAddress);

  async function addExtension(contractDir, interfaceName, extensionName, implementations) {
    const NAME_HASH = soliditySha3(extensionName);
    const deployments = [];

    for (let i = 0; i < implementations.length; i += 1) {
      const implementation = implementations[i];
      const deployment = await implementation.new();
      deployments.push(deployment);
    }

    const resolver = await Resolver.new();

    const deployedImplementations = {};
    for (let idx = 0; idx < implementations.length; idx += 1) {
      deployedImplementations[implementations[idx].contractName] = deployments[idx].address;
    }
    await setupEtherRouter(contractDir, interfaceName, deployedImplementations, resolver);
    await metaColony.addExtensionToNetwork(NAME_HASH, resolver.address);
  }

  await addExtension("extensions", "CoinMachine", "CoinMachine", [CoinMachine]);
  await addExtension("extensions", "EvaluatedExpenditure", "EvaluatedExpenditure", [EvaluatedExpenditure]);
  await addExtension("extensions", "FundingQueue", "FundingQueue", [FundingQueue]);
  await addExtension("extensions", "OneTxPayment", "OneTxPayment", [OneTxPayment]);
  await addExtension("extensions", "ReputationBootstrapper", "ReputationBootstrapper", [ReputationBootstrapper]);
  await addExtension("extensions", "StakedExpenditure", "StakedExpenditure", [StakedExpenditure]);
  await addExtension("extensions", "StreamingPayments", "StreamingPayments", [StreamingPayments]);
  await addExtension("extensions", "TokenSupplier", "TokenSupplier", [TokenSupplier]);
  await addExtension("extensions/votingReputation", "IVotingReputation", "VotingReputation", [
    VotingReputation,
    VotingReputationStaking,
    VotingReputationMisalignedRecovery,
  ]);
  await addExtension("extensions", "Whitelist", "Whitelist", [Whitelist]);
  await addExtension("extensions", "StagedExpenditure", "StagedExpenditure", [StagedExpenditure]);
}
