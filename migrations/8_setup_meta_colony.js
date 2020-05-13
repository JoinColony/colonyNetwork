/* globals artifacts */

const assert = require("assert");

const Token = artifacts.require("./Token");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");
const ITokenLocking = artifacts.require("./ITokenLocking");
const EtherRouter = artifacts.require("./EtherRouter");
const TokenAuthority = artifacts.require("./TokenAuthority");

const DEFAULT_STAKE = "2000000000000000000000000"; // 1000 * MIN_STAKE

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

  // These commands add MAIN_ACCOUNT as a reputation miner.
  // This is necessary because the first miner must have staked before the mining cycle begins.
  await clnyToken.mint(MAIN_ACCOUNT, DEFAULT_STAKE, { from: TOKEN_OWNER });
  await clnyToken.approve(tokenLockingAddress, DEFAULT_STAKE, { from: MAIN_ACCOUNT });
  const mainAccountBalance = await clnyToken.balanceOf(MAIN_ACCOUNT);
  assert.equal(mainAccountBalance.toString(), DEFAULT_STAKE.toString());
  const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
  await tokenLocking.deposit(clnyToken.address, DEFAULT_STAKE, { from: MAIN_ACCOUNT });
  await colonyNetwork.stakeForMining(DEFAULT_STAKE, { from: MAIN_ACCOUNT });
  await metaColony.addGlobalSkill();

  // Also set up the pinned version (3)... TODO: remove along with the deprecated `createColony`
  const version = await metaColony.version();
  const resolverAddress = await colonyNetwork.getColonyVersionResolver(version);
  await metaColony.addNetworkColonyVersion(3, resolverAddress);

  await colonyNetwork.initialiseReputationMining();
  await colonyNetwork.startNextCycle();

  const skillCount = await colonyNetwork.getSkillCount();
  assert.equal(skillCount.toNumber(), 3);

  console.log("### Meta Colony created at", metaColony.address);
};
