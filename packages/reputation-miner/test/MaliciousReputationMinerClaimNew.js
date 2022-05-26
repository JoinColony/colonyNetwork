const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

class MaliciousReputationMinerClaimNew extends ReputationMinerTestWrapper {
  // Only difference between this and the 'real' client should be that it claims a reputation update
  // corresponds to a reputation that didn't previously exist in the tree.
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber) {
    let adjacentReputationProof;
    if (updateNumber.toString() === this.entryToFalsify) {
      let key;
      if (updateNumber.lt(this.nReputationsBeforeLatestLog)) {
        key = await Object.keys(this.reputations)[updateNumber];
      } else {
        key = await this.getKeyForUpdateNumber(updateNumber, blockNumber);
      }
      delete this.reputations[key];
      this.beWrongThisCycle = true;
      const adjacentKey = await this.getAdjacentKey(key);
      adjacentReputationProof = await this.getReputationProofObject(adjacentKey);
      // Note that this won't remove it from the PatriciaTree - which is what we want
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber);
    if (updateNumber.toString() === this.entryToFalsify) {
      this.justificationHashes[
        ReputationMinerTestWrapper.getHexString(updateNumber.sub(1), 64)
      ].nextUpdateProof = await this.getReputationProofObject("0");
      this.justificationHashes[
        ReputationMinerTestWrapper.getHexString(updateNumber.sub(1), 64)
      ].adjacentReputationProof = adjacentReputationProof;
    }
    this.beWrongThisCycle = false;
  }

  async getNewestReputationProofObject(i) {
    // i is unused here, but is used in the Malicious3 mining client.
    let key = Object.keys(this.reputations)[this.nReputations - 1];
    if (i.gte(parseInt(this.entryToFalsify, 10))) {
      key = Object.keys(this.reputations)[this.nReputations - 2];
    }
    return this.getReputationProofObject(key);
  }
}

module.exports = MaliciousReputationMinerClaimNew;
