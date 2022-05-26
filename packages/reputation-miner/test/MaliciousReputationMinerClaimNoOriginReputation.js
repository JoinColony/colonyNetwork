const ReputationMinerTestWrapper = require("./ReputationMinerTestWrapper");

class MaliciousReputationMinerClaimNoOriginReputation extends ReputationMinerTestWrapper {
  // This client will claim there is no origin reputation, whether there is one or not, if told to falsify a child update.
  // Not sure what will happen otherwise!
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement)
    if (updateNumber.toNumber() === this.entryToFalsify){

      // Set the origin skill key
      // Because the amount is zero (due to our custom getAmount function below), the origin skill proof object and the user child proof object
      // will have default (zero) values.
      // We set the keys here, (because the keys are checked in respondToChallenge) and leave everything else the same.
      // The amount variable represents the change in the reputation being updated, which for a child update is always zero when there is no origin reputation.
      // The calculation is therefore self-consistent and will be able to pass respondToChallenge.
      const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(updateNumber.sub(this.nReputationsBeforeLatestLog));
      const logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber);
      const originSkillUpdateNumber = logEntry.nUpdates.add(logEntry.nPreviousUpdates).add(this.nReputationsBeforeLatestLog).sub(1);
      const originReputationKey = await this.getKeyForUpdateNumber(originSkillUpdateNumber);
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].originReputationProof.key = originReputationKey;

      // Set the origin-adjacent key information, which is expected if we're
      const originAdjacentKey = await this.getAdjacentKey(originReputationKey);
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].originAdjacentReputationProof =
        await this.getReputationProofObject(originAdjacentKey);

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
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].childReputationProof =
        await this.getReputationProofObject(childKey);
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

module.exports = MaliciousReputationMinerClaimNoOriginReputation;
