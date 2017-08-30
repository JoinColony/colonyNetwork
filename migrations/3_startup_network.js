/* eslint-disable no-undef, no-unused-vars-rest/no-unused-vars, no-var */
const assert = require('assert');

const ColonyNetwork = artifacts.require('./ColonyNetwork.sol');

module.exports = function (deployer) {

  deployer.then(function () {
    console.log('### Network contracts registered successfully ###');
  });
};
