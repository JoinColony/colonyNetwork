import BN from "bn.js";
import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

class MaliciousReputationMiningNoOriginReputation extends ReputationMinerTestWrapper {
  // This client will claim there is no originReputationUID, whether there is one or not
  //
  constructor(opts, entryToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    if (updateNumber.toNumber() === this.entryToFalsify){
      this.alterThisEntry = true;
      const reputationKey = await this.getKeyForUpdateNumber(updateNumber);
      const reputationValue = new BN(this.reputations[reputationKey].slice(2, 66), 16);
      this.replacementAmount = reputationValue.mul(new BN(-1));
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement)
    if (updateNumber.toNumber() === this.entryToFalsify){

      // Set the origin skill key
      const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(updateNumber.sub(this.nReputationsBeforeLatestLog));
      const logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber);
      const originSkillUpdateNumber = logEntry.nUpdates.add(logEntry.nPreviousUpdates).add(this.nReputationsBeforeLatestLog).sub(1);
      const originReputationKey = await this.getKeyForUpdateNumber(originSkillUpdateNumber);
      this.justificationHashes[ReputationMinerTestWrapper.getHexString(updateNumber, 64)].originReputationProof.key = originReputationKey;
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

      this.alterThisEntry = false;
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

export default MaliciousReputationMiningNoOriginReputation;
