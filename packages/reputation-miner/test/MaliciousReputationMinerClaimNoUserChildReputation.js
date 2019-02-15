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
    let childAdjacentProof;
    let logEntry;
    let relativeUpdateNumber;
    let childKey;

    if (updateNumber.toNumber() === this.entryToFalsify){
      const logEntryUpdateNumber = updateNumber.sub(this.nReputationsBeforeLatestLog);
      const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(logEntryUpdateNumber, blockNumber);
      logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber, { blockTag: blockNumber });
      const nUpdates = ethers.utils.bigNumberify(logEntry.nUpdates);
      relativeUpdateNumber = updateNumber.sub(logEntry.nPreviousUpdates).sub(this.nReputationsBeforeLatestLog);
      // Get current reputation amount of the origin skill, which is positioned at the end of the current logEntry nUpdates.
      const originSkillUpdateNumber = updateNumber.sub(relativeUpdateNumber).add(nUpdates).sub(1);
      const originSkillKey = await this.getKeyForUpdateNumber(originSkillUpdateNumber);
      originProof = await this.getReputationProofObject(originSkillKey);

      // Get the child-adjacent proof
      // First, get the (user) child skill key
      const [nParents] = await this.colonyNetwork.getSkill(logEntry.skillId);
      const nChildUpdates = nUpdates.div(2).sub(1).sub(nParents);
      relativeUpdateNumber = updateNumber.sub(logEntry.nPreviousUpdates).sub(this.nReputationsBeforeLatestLog);
      if (relativeUpdateNumber.lt(nChildUpdates)) {
        const childSkillUpdateNumber = updateNumber.add(nUpdates.div(2));
        childKey = await this.getKeyForUpdateNumber(childSkillUpdateNumber);
      } else {
        childKey = await this.getKeyForUpdateNumber(updateNumber);
      }
      const childAdjacentKey = await this.getAdjacentKey(childKey);
      childAdjacentProof = await this.getReputationProofObject(childAdjacentKey);

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

      // Set the childAdjacentProof
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].childAdjacentReputationProof = childAdjacentProof;

      // Set the child skill key
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
