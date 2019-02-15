import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

const ethers = require("ethers");

class MaliciousReputationMiningClaimNoUserChildReputation extends ReputationMinerTestWrapper {
  // This client will claim there is no user child reputation, whether there is one or not
  //
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    let originProof;
    let logEntry;
    if (updateNumber.toNumber() === this.entryToFalsify){
      const logEntryUpdateNumber = updateNumber.sub(this.nReputationsBeforeLatestLog);
      const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(logEntryUpdateNumber, blockNumber);
      logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber, { blockTag: blockNumber });
      const nUpdates = ethers.utils.bigNumberify(logEntry.nUpdates);
      const relativeUpdateNumber = updateNumber.sub(logEntry.nPreviousUpdates).sub(this.nReputationsBeforeLatestLog);
      // Get current reputation amount of the origin skill, which is positioned at the end of the current logEntry nUpdates.
      const originSkillUpdateNumber = updateNumber.sub(relativeUpdateNumber).add(nUpdates).sub(1);
      const originSkillKey = await this.getKeyForUpdateNumber(originSkillUpdateNumber);
      originProof = await this.getReputationProofObject(originSkillKey);
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement)
    if (updateNumber.toNumber() === this.entryToFalsify){

      // Because the amount is zero (due to our custom getAmount function below), the origin skill proof object and the user child proof object
      // will have default (zero) values.
      // We set the origin proof here here, (because we want to be able to prove that value), but set the child skill key
      // (which is checked) and leave the other values alone.
      // The amount variable represents the change in the reputation being updated, which for a child update is always zero when there is no user child reputation.
      // The calculation is therefore self-consistent and will be able to pass respondToChallenge.

      // Set the origin proof
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].originReputationProof = originProof;

      // Set the child skill key
      const relativeUpdateNumber = updateNumber.sub(this.nReputationsBeforeLatestLog).sub(logEntry.nPreviousUpdates);
      const {nUpdates} = logEntry;
      const [nParents] = await this.colonyNetwork.getSkill(logEntry.skillId);
      const nChildUpdates = nUpdates.div(2).sub(1).sub(nParents);
      let childKey;
      if (relativeUpdateNumber.lt(nChildUpdates)) {
        const childSkillUpdateNumber = updateNumber.add(nUpdates.div(2));
        childKey = await this.getKeyForUpdateNumber(childSkillUpdateNumber);
      } else {
        childKey = await this.getKeyForUpdateNumber(updateNumber);
      }
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].childReputationProof.key = childKey;
    }
  }

  getAmount(i, _score) {
    let score = _score;
    if (i.toString() === this.entryToFalsify.toString()) {
      score = score.sub(score);
    }
    return score;
  }
}

export default MaliciousReputationMiningClaimNoUserChildReputation;
