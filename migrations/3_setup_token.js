/* eslint-disable no-undef, no-unused-vars-rest/no-unused-vars, no-var */
require('babel-register');
const assert = require('assert');
const upgradableContracts = require('../helpers/upgradable-contracts');
const EtherRouter = artifacts.require('./EtherRouter.sol');
const Token = artifacts.require('./Token.sol');
const Resolver = artifacts.require('./Resolver.sol');
const MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet.sol');

module.exports = async function (deployer, network, accounts) {
  var resolverDeployed;
  var tokenDeployed;
  var etherRouterDeployed;
  var routerOwnerMultiSig;
  var COINBASE_ACCOUNT = accounts[0];

  tokenDeployed = await Token.deployed();
  resolverDeployed = await Resolver.deployed();
  console.log('Resolver', resolverDeployed.address);
  etherRouterDeployed = await EtherRouter.deployed();

  await upgradableContracts.setupUpgradableToken(tokenDeployed, resolverDeployed, etherRouterDeployed);
  routerOwnerMultiSig = await MultiSigWallet.new([COINBASE_ACCOUNT], 1);
  await etherRouterDeployed.setOwner(routerOwnerMultiSig.address);
  const routerOwner = await etherRouterDeployed.owner.call();
  assert.equal(routerOwner, routerOwnerMultiSig.address);

  console.log('### EtherRouter owner set to MultiSig', routerOwnerMultiSig.address);
};
