const ethers = require("ethers");
const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

class ReputationMinerLongTransactionMined extends ReputationMinerTestWrapper {
  // Only difference between this and the 'real' client should be that submitRootHash
  // doesn't resolve until we tell it to, via resolveSubmission()

  async submitRootHash(entryIndex) {
    const hash = await this.getRootHash();
    const nLeaves = await this.getRootHashNLeaves();
    const jrh = await this.justificationTree.getRootHash();
    const repCycle = await this.getActiveRepCycle();

    if (!entryIndex) {
      entryIndex = await this.getEntryIndex(); // eslint-disable-line no-param-reassign
    }
    let gasEstimate = ethers.BigNumber.from(1000000);
    try {
      gasEstimate = await repCycle.estimate.submitRootHash(hash, nLeaves, jrh, entryIndex);
    } catch (err) { // eslint-disable-line no-empty

    }

    // Submit that entry
    this.p = new Promise((resolve) => {
      this.result = repCycle.submitRootHash(hash, nLeaves, jrh, entryIndex, { gasLimit: gasEstimate, gasPrice: this.gasPrice });
      this.resolve = resolve;
    })
    return this.p;
  }

  async resolveSubmission() {
    this.resolve(this.result);
  }
}

module.exports = ReputationMinerLongTransactionMined;
