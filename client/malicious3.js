import BN from "bn.js";
import ReputationMiningClient from "./main";

class MaliciousReputationMiningClient3 extends ReputationMiningClient {
  // This client will reuse a UID for a reputation
  constructor(minerAddress, realProviderPort, entryToFalsify, amountToFalsify) {
    super(minerAddress, realProviderPort);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  async getNewestReputationInformation(logEntry) {
    let newestReputationKey;
    if (logEntry.toString() === this.entryToFalsify.toString()) {
      newestReputationKey = Object.keys(this.reputations)[this.nReputations - 1 - parseInt(this.amountToFalsify, 10)];
    } else {
      newestReputationKey = Object.keys(this.reputations)[this.nReputations - 1];
    }
    const newestReputationValue = this.reputations[newestReputationKey];
    const [newestReputationBranchMask, newestReputationSiblings] = await this.reputationTree.getProof(newestReputationKey);
    return [newestReputationKey, newestReputationValue, newestReputationBranchMask, newestReputationSiblings];
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

export default MaliciousReputationMiningClient3;
