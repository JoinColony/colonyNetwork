import ReputationMiner from "../ReputationMiner";

class MaliciousReputationMinerClaimNew extends ReputationMiner {
  // Not really sure how to describe this malicous mining client...
  // It ends up proving a too-large newest reputation for the nNodes it claimed in the
  // JRH (so in the test in question, the intermediate value had 6 nodes, but it proves
  // a reputation with id 7 exists in that tree.
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify.toString();
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber) {
    if (updateNumber.toString() === this.entryToFalsify) {
      let key;
      if (updateNumber.lt(this.nReputationsBeforeLatestLog)) {
        key = await Object.keys(this.reputations)[updateNumber];
      } else {
        key = await this.getKeyForUpdateNumber(updateNumber, blockNumber);
      }
      delete this.reputations[key];
      this.nReputations = this.nReputations.sub(1);
    }
    // Note that this won't remove it from the PatriciaTree - which is what we want
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber);
  }
}

export default MaliciousReputationMinerClaimNew;
