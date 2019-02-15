import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMinerWrongNNodes extends ReputationMinerTestWrapper {

  constructor(opts, amountToFalsifyBy) {
    super(opts);
    this.amountToFalsifyBy = amountToFalsifyBy.toString();
  }

  async getRootHashNNodes() {
    return this.nReputations.add(this.amountToFalsifyBy);
  }
}

export default MaliciousReputationMinerWrongNNodes;
