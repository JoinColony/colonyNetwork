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

module.exports = deployer => {
  // Create the meta colony
  let colonyNetwork;
  let tokenLockingAddress;
  let clnyToken;
  let metaColony;
  let metaColonyAddress;

  deployer
    .then(() => EtherRouter.deployed())
    .then(_etherRouter => IColonyNetwork.at(_etherRouter.address))
    .then(instance => {
      colonyNetwork = instance;
      return Token.new("Colony Network Token", "CLNY", 18);
    })
    .then(tokenInstance => {
      clnyToken = tokenInstance;
      return colonyNetwork.createMetaColony(clnyToken.address);
    })
    // These commands add the first address as a reputation miner. This isn't necessary (or wanted!) for a real-world deployment,
    // but is useful when playing around with the network to get reputation mining going.
    .then(() => colonyNetwork.getMetaColony())
    .then(_metaColonyAddress => {
      metaColonyAddress = _metaColonyAddress;
      return colonyNetwork.getTokenLocking();
    })
    .then(address => {
      tokenLockingAddress = address;
      return TokenAuthority.new(clnyToken.address, 0x0, metaColonyAddress, tokenLockingAddress);
    })
    .then(() => ITokenLocking.at(tokenLocking))
    .then(tokenAuthority => clnyToken.setAuthority(tokenAuthority.address))
    .then(() => clnyToken.mint(DEFAULT_STAKE))
    .then(() => clnyToken.approve(tokenLockingAddress, DEFAULT_STAKE))
    .then(() => ITokenLocking.at(tokenLockingAddress))
    .then(iTokenLocking => iTokenLocking.deposit(clnyToken.address, DEFAULT_STAKE))
    .then(() => colonyNetwork.initialiseReputationMining())
    .then(() => colonyNetwork.startNextCycle())
    .then(() => colonyNetwork.getSkillCount())
    .then(async skillCount => {
      assert.equal(skillCount.toNumber(), 3);
      return colonyNetwork.getMetaColony();
    })
    .then(async metaColonyAddress => {
      metaColony = await IMetaColony.at(metaColonyAddress);
      // Doing an async / await here because we need this promise to resolve (i.e. tx to mine) and we also want
      // to log the address. It's either do this, or do `return colonyNetwork.getMetaColony()` twice. I'm easy on
      // which we use.
      await clnyToken.setOwner(accounts[11]);
    })
    .then(() => metaColony.setNetworkFeeInverse(100))
    .then(() => console.log("### Meta Colony created at", metaColony.address))
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
