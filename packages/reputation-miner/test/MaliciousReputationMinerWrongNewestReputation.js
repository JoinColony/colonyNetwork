import BN from "bn.js";
import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMiningWrongNewestReputation extends ReputationMinerTestWrapper {
  // This client will supply the wrong newest reputation as part of its proof
  constructor(opts, amountToFalsify) {
    super(opts);
    this.amountToFalsify = new BN(amountToFalsify.toString());
  }

  async getNewestReputationProofObject() {
    let key;
    if (this.nReputations - this.amountToFalsify < 0) {
      [key] = Object.keys(this.reputations);
    } else {
      key = Object.keys(this.reputations)[this.nReputations - this.amountToFalsify];
    }
    return this.getReputationProofObject(key);
  }
}

export default MaliciousReputationMiningWrongNewestReputation;
