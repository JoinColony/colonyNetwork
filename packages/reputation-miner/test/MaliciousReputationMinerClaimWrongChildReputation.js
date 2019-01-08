import ReputationMiningClient from "../ReputationMiner";

const WRONG_ADDRESS = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

class MaliciousReputationMiningWrongChildReputation extends ReputationMiningClient {
  // This client will claim there is no originReputationUID, whether there is one or not
  //
  constructor(opts, whatToFalsify) {
    super(opts);
    this.whatToFalsify = whatToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement);

    const correctKey = this.justificationHashes[ReputationMiningClient.getHexString(updateNumber, 64)].childReputationProof.key;
    let wrongKey;
    if (this.whatToFalsify === "colonyAddress"){
      wrongKey = `0x${WRONG_ADDRESS}${correctKey.slice(WRONG_ADDRESS.length + 2)}`;
    } else if (this.whatToFalsify === "skillId") {
      // No skill ID 0, so setting it to 0 is wrong.
      wrongKey = `${correctKey.slice(0, WRONG_ADDRESS.length + 2)}${"0".repeat(64)}${correctKey.slice(WRONG_ADDRESS.length + 2 + 64)}`;
    } else {
      // Falsify the user address
      wrongKey = `${correctKey.slice(0, WRONG_ADDRESS.length + 2 + 64)}${WRONG_ADDRESS}`;
    }
    this.justificationHashes[ReputationMiningClient.getHexString(updateNumber, 64)].childReputationProof.key = wrongKey;
  }
}

export default MaliciousReputationMiningWrongChildReputation;
