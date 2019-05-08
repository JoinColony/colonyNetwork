/* globals artifacts */
const { WAD, MINING_CYCLE_DURATION } = require("../../../helpers/constants");

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const Token = artifacts.require("Token");

async function forwardTime(seconds) {
  const p = new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [seconds],
        id: 0
      },
      err => {
        if (err) {
          return reject(err);
        }
        return web3.currentProvider.send(
          {
            jsonrpc: "2.0",
            method: "evm_mine",
            params: [],
            id: 0
          },
          (err2, res) => {
            if (err2) {
              return reject(err2);
            }
            return resolve(res);
          }
        );
      }
    );
  });
  return p;
}

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const MINER = accounts[5];

    console.log("*".repeat(20));
    console.log("SETTING UP NETWORK");

    const etherRouter = await EtherRouter.deployed();
    const colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metaColony = await IMetaColony.at(metaColonyAddress);
    const clnyTokenAddress = await metaColony.getToken();
    const clnyToken = await Token.at(clnyTokenAddress);

    console.log("*".repeat(20));
    console.log("CREATING TASKS");

    await metaColony.mintTokens(WAD.muln(1000));
    await metaColony.claimColonyFunds(clnyToken.address);

    // eslint-disable no-plusplus
    for (let i = 1; i <= 10; i += 1) {
      const user = accounts[i % 10];
      const amount = WAD.muln((i % 5) + 1);
      const paymentId = i;
      const potId = i + 1;

      await metaColony.addPayment(1, 0, user, clnyToken.address, amount, 1, 0);
      await metaColony.moveFundsBetweenPots(1, 0, 0, 1, potId, amount, clnyToken.address);
      await metaColony.finalizePayment(1, 0, paymentId);
    }

    // Advance mining cycle.
    // Recall that the miner account is staked during the migrations.
    let addr = await colonyNetwork.getReputationMiningCycle(true);
    let repCycle = await IReputationMiningCycle.at(addr);

    await forwardTime(MINING_CYCLE_DURATION);
    await repCycle.submitRootHash("0x00", 0, "0x00", 10, { from: MINER });
    await repCycle.confirmNewHash(0);

    await forwardTime(MINING_CYCLE_DURATION);
    addr = await colonyNetwork.getReputationMiningCycle(true);
    repCycle = await IReputationMiningCycle.at(addr);

    console.log("*".repeat(20));
    console.log("CYCLE ADDRESS:", repCycle.address);
    console.log("COLONY NETWORK:", colonyNetwork.address);
    console.log("MINER ACCOUNT:", MINER);

    callback();
  } catch (err) {
    callback(err);
  }
};
