/* globals artifacts */
/* eslint-disable no-console */

const assert = require("assert");

const IColonyNetwork = artifacts.require("./IColonyNetwork");
const EtherRouter = artifacts.require("./EtherRouter");

module.exports = deployer => {
  // Create the common colony
  let colonyNetwork;
  deployer
    .then(() => EtherRouter.deployed())
    .then(_etherRouter => IColonyNetwork.at(_etherRouter.address))
    .then(instance => {
      colonyNetwork = instance;
      return colonyNetwork.createColony("Common Colony", "Colony Network Token", "CLNY", 18);
    })
    .then(() => colonyNetwork.getSkillCount.call())
    .then(skillCount => {
      assert.equal(skillCount.toNumber(), 2);
      return colonyNetwork.getColony.call("Common Colony");
    })
    .then(commonColonyAddress => {
      console.log("### Common Colony created at", commonColonyAddress);
    })
    .catch(err => {
      console.log("### Error occurred ", err);
    });
};
