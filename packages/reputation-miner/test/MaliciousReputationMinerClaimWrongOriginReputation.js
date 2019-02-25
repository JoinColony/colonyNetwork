import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

const WRONG_ADDRESS = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

class MaliciousReputationMinerWrongOriginReputation extends ReputationMinerTestWrapper {
  // This client will claim there is no originReputationUID, whether there is one or not
  //
  constructor(opts, entryToFalsify, amountToFalsify, whatToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify;
    // Amount to falsify here isn't really the amount the origin reputation is wrong by, it's how wrong
    // we get the lookup index.
    this.amountToFalsify = amountToFalsify;
    this.whatToFalsify = whatToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    if (updateNumber.toNumber() === this.entryToFalsify){
      this.alterThisEntry = true;
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement)
    this.alterThisEntry = false;
  }

  async getKeyForUpdateNumber(updateNumber){
    const correctKey = await super.getKeyForUpdateNumber(updateNumber);
    if (this.alterThisEntry){
      if (updateNumber.toNumber() > this.entryToFalsify){
        let wrongKey;
        // Then we're trying to look up an origin skill
        if (this.whatToFalsify === "colonyAddress"){
          wrongKey = `0x${WRONG_ADDRESS}${correctKey.slice(WRONG_ADDRESS.length + 2)}`;
        } else if (this.whatToFalsify === "skillId") {
          // No skill ID 0, so setting it to 0 is wrong.
          wrongKey = `${correctKey.slice(0, WRONG_ADDRESS.length + 2)}${"0".repeat(64)}${correctKey.slice(WRONG_ADDRESS.length + 2 + 64)}`;
        } else {
          // Falsify the user address
          wrongKey = `${correctKey.slice(0, WRONG_ADDRESS.length + 2 + 64)}${WRONG_ADDRESS}`;
        }
        return wrongKey;
      }
    }
    return correctKey
  }

}

export default MaliciousReputationMinerWrongOriginReputation;
