// const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper").default;
import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMinerAddNewReputation extends ReputationMinerTestWrapper {
  entryToFalsify: string;

  originalAddSingleReputationUpdate: any;

  // This will add a new reputation as well as adding entryToFalsify correctly.
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
    this.originalAddSingleReputationUpdate = this.reputationMiner.addSingleReputationUpdate;
    this.reputationMiner.addSingleReputationUpdate = this.addSingleReputationUpdate.bind(this);
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber) {
    await this.originalAddSingleReputationUpdate(updateNumber, repCycle, blockNumber);
    // Add a new reputation in the tree if this is when we've been told to do it.
    if (updateNumber.toString() === this.entryToFalsify) {
      const key = MaliciousReputationMinerAddNewReputation.getKey(
        "0x00000000000000000000000000000000deadbeef",
        0xdeadbeef,
        "0x00000000000000000000000000000000deadbeef"
      );
      await this.reputationMiner.reputationTree.insert(key, "0xdeadbeef", { gasLimit: 4000000 });
    }
  }
}

// module.exports = MaliciousReputationMinerAddNewReputation;
export default MaliciousReputationMinerAddNewReputation