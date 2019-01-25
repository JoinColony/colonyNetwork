import ReputationMinerTestWrapper from "./ReputationMinerTestWrapper";

const ethers = require("ethers");

class MaliciousReputationMiningNoUserChildReputation extends ReputationMinerTestWrapper {
  // This client will claim there is no originReputationUID, whether there is one or not
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

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
    const submission = await repCycle.getDisputeRounds(round, index);
    const firstDisagreeIdx = submission.lowerBound;
    const lastAgreeIdx = firstDisagreeIdx.sub(1);
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    const lastAgreeKey = ReputationMinerTestWrapper.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = ReputationMinerTestWrapper.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = ethers.utils.bigNumberify(0);
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.sub(this.nReputationsBeforeLatestLog));
    }
  
    const tx = await repCycle.respondToChallenge(
      [
        round,
        index,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.nNodes,
        ReputationMinerTestWrapper.getHexString(agreeStateBranchMask),
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.nNodes,
        ReputationMinerTestWrapper.getHexString(disagreeStateBranchMask),
        this.justificationHashes[lastAgreeKey].newestReputationProof.branchMask,
        logEntryNumber,
        "0",
        this.justificationHashes[lastAgreeKey].originReputationProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.reputation,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.uid,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.reputation,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.uid,
        this.justificationHashes[lastAgreeKey].newestReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].newestReputationProof.uid,
        this.justificationHashes[lastAgreeKey].originReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].originReputationProof.uid,
        this.justificationHashes[lastAgreeKey].childReputationProof.branchMask,
        0,
        0,
        "0",
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.branchMask,
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.reputation,
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.uid,
        "0",
        "0"
      ],
      [
        reputationKey,
        this.justificationHashes[lastAgreeKey].newestReputationProof.key,
        this.justificationHashes[lastAgreeKey].originReputationProof.key,
        this.justificationHashes[lastAgreeKey].childReputationProof.key,
        this.justificationHashes[lastAgreeKey].adjacentReputationProof.key
      ],
      this.justificationHashes[firstDisagreeKey].justUpdatedProof.siblings,
      agreeStateSiblings,
      disagreeStateSiblings,
      this.justificationHashes[lastAgreeKey].newestReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].originReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].childReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].adjacentReputationProof.siblings,
      { gasLimit: 4000000 }
    );
    return tx.wait();
  }
}

export default MaliciousReputationMiningNoUserChildReputation;
