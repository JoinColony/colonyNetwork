const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

class MaliciousReputationMinerWrongNLeaves extends ReputationMinerTestWrapper {

  constructor(opts, amountToFalsifyBy) {
    super(opts);
    this.amountToFalsifyBy = amountToFalsifyBy.toString();
  }

  async getRootHashNLeaves() {
    return this.nReputations.add(this.amountToFalsifyBy);
  }
}

module.exports = MaliciousReputationMinerWrongNLeaves;
