const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper").default;

class MaliciousReputationMinerWrongNLeaves extends ReputationMinerTestWrapper {

  constructor(opts, amountToFalsifyBy) {
    super(opts);
    this.amountToFalsifyBy = amountToFalsifyBy.toString();
    this.reputationMiner.getRootHashNLeaves = this.getRootHashNLeaves.bind(this);
  }

  async getRootHashNLeaves() {
    return this.nReputations.add(this.amountToFalsifyBy);
  }
}

module.exports = MaliciousReputationMinerWrongNLeaves;
