const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper").default;

class MaliciousReputationMinerWrongNLeaves2 extends ReputationMinerTestWrapper {
  // This client will reuse a UID for a reputation
  constructor(opts, entryToFalsify, amountToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
    this.originalAddSingleReputationUpdate = this.reputationMiner.addSingleReputationUpdate;
    this.reputationMiner.addSingleReputationUpdate = this.addSingleReputationUpdate.bind(this);
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber) {
    if (updateNumber.toString() === this.entryToFalsify) {
      this.nReputations = this.nReputations.add(1);
    }
    await this.originalAddSingleReputationUpdate(updateNumber, repCycle, blockNumber);
  }
}

module.exports = MaliciousReputationMinerWrongNLeaves2;
