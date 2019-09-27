import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMinerWrongNLeaves2 extends ReputationMinerTestWrapper {
  // This client will reuse a UID for a reputation
  constructor(opts, entryToFalsify, amountToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber) {
    if (updateNumber.toString() === this.entryToFalsify) {
      this.nReputations = this.nReputations.add(1);
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber);
  }
}

export default MaliciousReputationMinerWrongNLeaves2;
