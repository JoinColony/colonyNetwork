import BN from "bn.js";
import ReputationMiner from "../ReputationMiner";

class MaliciousReputationMinerReuseUID extends ReputationMiner {
  // This client will reuse a UID for a reputation
  constructor(opts, entryToFalsify, amountToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  async getNewestReputationProofObject(logEntry) {
    let key;
    if (logEntry.toString() === this.entryToFalsify.toString()) {
      key = Object.keys(this.reputations)[this.nReputations - 1 - parseInt(this.amountToFalsify, 10)];
    } else {
      key = Object.keys(this.reputations)[this.nReputations - 1];
    }
    return this.getReputationProofObject(key);
  }

  getValueAsBytes(reputation, _uid, index) { //eslint-disable-line
    let uid;
    if (index && index.toString() === this.entryToFalsify) {
      uid = new BN(_uid.toString()).sub(new BN(this.amountToFalsify));
    } else {
      uid = _uid;
    }
    return `0x${new BN(reputation.toString()).toString(16, 64)}${new BN(uid.toString()).toString(16, 64)}`;
  }
}

export default MaliciousReputationMinerReuseUID;
