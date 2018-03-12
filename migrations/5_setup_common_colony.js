/* globals artifacts */
/* eslint-disable no-console */

const assert = require("assert");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");
const Token = artifacts.require("./Token");

module.exports = deployer => {
  // Create the common colony
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
      return colonyNetwork.createColony("Common Colony", token.address);
    })
    .then(() => colonyNetwork.getSkillCount.call())
    .then(skillCount => {
      assert.equal(skillCount.toNumber(), 2);
      return colonyNetwork.getColony.call("Common Colony");
    })
    .then(() => colonyNetwork.getColony.call("Common Colony"))
    .then(commonColonyAddress => {
      token.setOwner(commonColonyAddress);
      console.log("### Common Colony created at", commonColonyAddress);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
