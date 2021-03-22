/* globals artifacts */
const { soliditySha3 } = require("web3-utils");

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const Whitelist = artifacts.require("Whitelist");

const WHITELIST = soliditySha3("Whitelist");

module.exports = async function (callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const USER0 = accounts[0];

    console.log("SETTING UP NETWORK");

    const etherRouter = await EtherRouter.deployed();
    const colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await IMetaColony.at(metaColonyAddress);

    await metaColony.installExtension(WHITELIST, 1);
    const whitelistAddress = await colonyNetwork.getExtensionInstallation(WHITELIST, metaColony.address);
    const whitelist = await Whitelist.at(whitelistAddress);

    await whitelist.initialise(true, "");

    console.log("LAUNCH KYC ORACLE:");
    console.log(`node ./packages/kyc-oracle/bin/index.js --userAddress=${USER0} --whitelistAddress=${whitelistAddress} --apiKey=`);

    callback();
  } catch (err) {
    callback(err);
  }
};
