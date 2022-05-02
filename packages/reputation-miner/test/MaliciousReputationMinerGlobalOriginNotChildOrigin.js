const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

const WRONG_ADDRESS = "0000000000000000000000000000000000000000";

class MaliciousReputationMinerGlobalOriginNotChildOrigin extends ReputationMinerTestWrapper {
  // This client will calculate with the global origin skill, rather than the child origin skill, whend doing a child reputation update.
  // It will also provide it as the origin reputation skill when respondingToChallenge
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    if (updateNumber.toNumber() === this.entryToFalsify){
      this.alterThisEntry = true;
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement)
  }

  async getKeyForUpdateNumber(updateNumber){
    const correctKey = await super.getKeyForUpdateNumber(updateNumber);
    if (this.alterThisEntry){
      if (updateNumber.toNumber() > this.entryToFalsify){
        // Then we're trying to look up an origin skill
        // Provide the global origin skill
        const wrongKey = `${correctKey.slice(0, WRONG_ADDRESS.length + 2 + 64)}${WRONG_ADDRESS}`;
        // We only return the wrongkey the first time this function is called in the update in question.
        this.alterThisEntry = false;
        return wrongKey;
      }
    }
    return correctKey
  }

}

module.exports = MaliciousReputationMinerGlobalOriginNotChildOrigin;
