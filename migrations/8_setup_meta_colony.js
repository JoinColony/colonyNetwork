/* globals artifacts */

const assert = require("assert");
const { UINT256_MAX, FORKED_XDAI_CHAINID, XDAI_CHAINID } = require("../helpers/constants");

const Token = artifacts.require("./Token");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");
const ITokenLocking = artifacts.require("./ITokenLocking");
const TokenAuthority = artifacts.require("./TokenAuthority");
const MultiChain = artifacts.require("./MultiChain");

const Resolver = artifacts.require("./Resolver");
const EtherRouter = artifacts.require("./EtherRouter");

const Version3 = artifacts.require("./Version3");
const Version4 = artifacts.require("./Version4");
const { setupColonyVersionResolver } = require("../helpers/upgradable-contracts");

const DEFAULT_STAKE = "2000000000000000000000000"; // DEFAULT_STAKE

// eslint-disable-next-line no-unused-vars
module.exports = async function (deployer, network, accounts) {
  const MAIN_ACCOUNT = accounts[5];
  const TOKEN_OWNER = accounts[11];

  const etherRouterDeployed = await EtherRouter.deployed();
  const colonyNetwork = await IColonyNetwork.at(etherRouterDeployed.address);

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

  // Check chain id
  // If not a mining chain, then skip setting up mining
  const multichain = await MultiChain.new();
  const chainId = await multichain.getChainId();

  if (chainId.toNumber() === FORKED_XDAI_CHAINID || chainId.toNumber() === XDAI_CHAINID) {
    // These commands add MAIN_ACCOUNT as a reputation miner.
    // This is necessary because the first miner must have staked before the mining cycle begins.
    await clnyToken.mint(MAIN_ACCOUNT, DEFAULT_STAKE, { from: TOKEN_OWNER });
    await clnyToken.approve(tokenLockingAddress, DEFAULT_STAKE, { from: MAIN_ACCOUNT });
    const mainAccountBalance = await clnyToken.balanceOf(MAIN_ACCOUNT);
    assert.equal(mainAccountBalance.toString(), DEFAULT_STAKE.toString());
    const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    await tokenLocking.methods["deposit(address,uint256,bool)"](clnyToken.address, DEFAULT_STAKE, true, { from: MAIN_ACCOUNT });
    await colonyNetwork.stakeForMining(DEFAULT_STAKE, { from: MAIN_ACCOUNT });
  }

  // Set up functional resolvers that identify correctly as previous versions.
  const Colony = artifacts.require("./Colony");
  const ColonyDomains = artifacts.require("./ColonyDomains");
  const ColonyExpenditure = artifacts.require("./ColonyExpenditure");
  const ColonyFunding = artifacts.require("./ColonyFunding");
  const ColonyRewards = artifacts.require("./ColonyRewards");
  const ColonyRoles = artifacts.require("./ColonyRoles");
  const ContractRecovery = artifacts.require("./ContractRecovery");
  const ColonyArbitraryTransaction = artifacts.require("./ColonyArbitraryTransaction");

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

  if (chainId.toNumber() === FORKED_XDAI_CHAINID || chainId.toNumber() === XDAI_CHAINID) {
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    const skillCount = await colonyNetwork.getSkillCount();
    assert.equal(skillCount.toNumber(), 4);
  } else {
    const skillCount = await colonyNetwork.getSkillCount();
    assert.equal(skillCount.shln(128).mod(UINT256_MAX).shrn(128).toNumber(), 2);
  }

  console.log("### Meta Colony created at", metaColony.address);
};
