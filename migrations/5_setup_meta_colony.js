/* globals artifacts */
/* eslint-disable no-console */

const assert = require("assert");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");
const Token = artifacts.require("./Token");

module.exports = deployer => {
  // Create the meta colony
  let colonyNetwork;
  let token;
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
    .then(() => token.approve(colonyNetwork.address, "10000000000000000"))
    .then(() => colonyNetwork.deposit("10000000000000000"))
    .then(() => colonyNetwork.startNextCycle())
    .then(() => colonyNetwork.getSkillCount.call())
    .then(skillCount => {
      assert.equal(skillCount.toNumber(), 3);
      return colonyNetwork.getMetaColony.call();
    })
    .then(metaColonyAddress => {
      token.setOwner(metaColonyAddress);
      console.log("### Meta Colony created at", metaColonyAddress);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
