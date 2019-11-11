import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMinerAddNewReputation extends ReputationMinerTestWrapper {
  // This will add a new reputation as well as adding entryToFalsify correctly.
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber) {
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber);
    // Add a new reputation in the tree if this is when we've been told to do it.
    if (updateNumber.toString() === this.entryToFalsify) {
      const key = MaliciousReputationMinerAddNewReputation.getKey(
        "0x00000000000000000000000000000000deadbeef",
        0xdeadbeef,
        "0x00000000000000000000000000000000deadbeef"
      );
      await this.reputationTree.insert(key, "0xdeadbeef", { gasLimit: 4000000 });
    }
  }
}

export default MaliciousReputationMinerAddNewReputation;
