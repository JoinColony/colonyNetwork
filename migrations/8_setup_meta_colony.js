/* globals artifacts */
/* eslint-disable no-console */

const assert = require("assert");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const IColony = artifacts.require("./IColony");
const ITokenLocking = artifacts.require("./ITokenLocking");
const EtherRouter = artifacts.require("./EtherRouter");
const Token = artifacts.require("./Token");

module.exports = deployer => {
  // Create the meta colony
  let colonyNetwork;
  let tokenLocking;
  let token;
  let metaColony;

  deployer
    .then(() => EtherRouter.deployed())
    .then(_etherRouter => IColonyNetwork.at(_etherRouter.address))
    .then(instance => {
      colonyNetwork = instance;
      return Token.new("Colony Network Token", "CLNY", 18);
    })
    .then(tokenInstance => {
      token = tokenInstance;
      return token.mint("10000000000000000");
    })
    // These commands add the first address as a reputation miner. This isn't necessary (or wanted!) for a real-world deployment,
    // but is useful when playing around with the network to get reputation mining going.
    .then(() => colonyNetwork.createMetaColony(token.address))
    .then(() => colonyNetwork.getTokenLocking())
    .then(address => {
      tokenLocking = address;
      return token.approve(tokenLocking, "10000000000000000");
    })
    .then(() => ITokenLocking.at(tokenLocking))
    .then(iTokenLocking => iTokenLocking.deposit(token.address, "10000000000000000"))
    .then(() => colonyNetwork.initialiseReputationMining())
    .then(() => colonyNetwork.startNextCycle())
    .then(() => colonyNetwork.getSkillCount())
    .then(skillCount => {
      assert.equal(skillCount.toNumber(), 3);
      return colonyNetwork.getMetaColony();
    })
    .then(async metaColonyAddress => {
      metaColony = await IColony.at(metaColonyAddress);
      // Doing an async / await here because we need this promise to resolve (i.e. tx to mine) and we also want
      // to log the address. It's either do this, or do `return colonyNetwork.getMetaColony()` twice. I'm easy on
      // which we use.
      await token.setOwner(metaColonyAddress);
    })
    .then(() => metaColony.setNetworkFeeInverse(100))
    .then(() => console.log("### Meta Colony created at", metaColony.address))
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
