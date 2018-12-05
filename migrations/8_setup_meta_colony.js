/* globals artifacts */
/* eslint-disable no-console */

const assert = require("assert");

const Token = artifacts.require("./Token");
const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IMetaColony = artifacts.require("./IMetaColony");
const ITokenLocking = artifacts.require("./ITokenLocking");
const EtherRouter = artifacts.require("./EtherRouter");
const TokenAuthority = artifacts.require("./TokenAuthority");

const DEFAULT_STAKE = "2000000000000000000000000"; // 1000 * MIN_STAKE
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = (deployer, network, accounts) => {
  let colonyNetwork;
  let metaColony;
  let clnyToken;

  deployer
    .then(() => EtherRouter.deployed())
    .then(_etherRouter => IColonyNetwork.at(_etherRouter.address))
    .then(instance => {
      colonyNetwork = instance;
      return Token.new("Colony Network Token", "CLNY", 18);
    })
    .then(async tokenInstance => {
      clnyToken = tokenInstance;
      const tokenLockingAddress = await colonyNetwork.getTokenLocking();

      await colonyNetwork.createMetaColony(clnyToken.address);
      const metaColonyAddress = await colonyNetwork.getMetaColony();
      metaColony = await IMetaColony.at(metaColonyAddress);
      await metaColony.setNetworkFeeInverse(100);
      const reputationMinerTestAccounts = accounts.slice(3, 11);

      // Penultimate parameter is the vesting contract which is not the subject of this integration testing so passing in ZERO_ADDRESS
      const tokenAuthority = await TokenAuthority.new(
        clnyToken.address,
        colonyNetwork.address,
        metaColonyAddress,
        tokenLockingAddress,
        ZERO_ADDRESS,
        reputationMinerTestAccounts
      );
      await clnyToken.setAuthority(tokenAuthority.address);
      await clnyToken.setOwner(accounts[11]);

      // These commands add the account[5] as a reputation miner. This isn't necessary (or wanted!) for a real-world deployment,
      // but is useful when playing around with the network to get reputation mining going.
      await clnyToken.mint(DEFAULT_STAKE, { from: accounts[11] });
      await clnyToken.transfer(accounts[5], DEFAULT_STAKE, { from: accounts[11] });
      await clnyToken.approve(tokenLockingAddress, DEFAULT_STAKE, { from: accounts[5] });
      const account5Balance = await clnyToken.balanceOf(accounts[5]);
      assert.equal(account5Balance.toString(), DEFAULT_STAKE.toString());
      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
      await tokenLocking.deposit(clnyToken.address, DEFAULT_STAKE, { from: accounts[5] });

      await colonyNetwork.initialiseReputationMining();
      await colonyNetwork.startNextCycle();

      return colonyNetwork.getSkillCount();
    })
    .then(async skillCount => {
      assert.equal(skillCount.toNumber(), 3);
    })
    .then(() => console.log("### Meta Colony created at", metaColony.address))
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
