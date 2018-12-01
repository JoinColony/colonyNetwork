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

      // Second parameter is the vesting contract which is not the subject of this integration testing so passing in 0x0
      const tokenAuthority = await TokenAuthority.new(clnyToken.address, colonyNetwork.address, metaColonyAddress, tokenLockingAddress, 0x0, [
        accounts[1],
        accounts[2]
      ]);
      await clnyToken.setAuthority(tokenAuthority.address);

      // These commands add the first address as a reputation miner. This isn't necessary (or wanted!) for a real-world deployment,
      // but is useful when playing around with the network to get reputation mining going.
      // TODO: Perhaps it's a good idea to switch the owner to be the accounts[11] which is used in all other setup instances as the CLNY owner
      // This is not to accidentally confuse the coinbase account with token owner account
      // await clnyToken.setOwner(accounts[0]);
      await clnyToken.mint(DEFAULT_STAKE, { from: accounts[0] });
      await clnyToken.approve(tokenLockingAddress, DEFAULT_STAKE, { from: accounts[0] });

      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
      await tokenLocking.deposit(clnyToken.address, DEFAULT_STAKE, { from: accounts[0] });

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
