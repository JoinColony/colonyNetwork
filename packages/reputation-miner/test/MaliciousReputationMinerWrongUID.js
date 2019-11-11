import BN from "bn.js";
import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMinerWrongUID extends ReputationMinerTestWrapper {
  // This client uses the wrong UID for a reputation (even an existing one)
  constructor(opts, entryToFalsify, amountToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  getValueAsBytes(reputation, _uid, index) {
    let uid;
    if (index && index.toString() === this.entryToFalsify) {
      uid = new BN(_uid.toString()).add(new BN(this.amountToFalsify));
    } else {
      uid = _uid;
    }
    return `0x${new BN(reputation.toString()).toString(16, 64)}${new BN(uid.toString()).toString(16, 64)}`;
  }
}

export default MaliciousReputationMinerWrongUID;
