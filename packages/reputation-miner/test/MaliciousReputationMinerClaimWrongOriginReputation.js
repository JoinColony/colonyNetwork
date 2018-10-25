import ReputationMiningClient from "../ReputationMiner";

const ethers = require("ethers");

class MaliciousReputationMiningWrongOriginReputation extends ReputationMiningClient {
  // This client will claim there is no originReputationUID, whether there is one or not
  //
  constructor(opts, entryToFalsify, amountToFalsify) {
    super(opts);
    this.entryToFalsify = entryToFalsify;
    // Amount to falsify here isn't really the amount the origin reputation is wrong by, it's how wrong
    // we get the lookup index.
    this.amountToFalsify = amountToFalsify;
  }

  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    if (updateNumber.toNumber() === this.entryToFalsify){
      this.alterThisEntry = true;
    }
    await super.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement)
    this.alterThisEntry = false;
  }

  async getKeyForUpdateNumber(updateNumber){
    if (this.alterThisEntry){
      if (updateNumber.toNumber() > this.entryToFalsify){
        // Then we're trying to look up an origin skill
        return super.getKeyForUpdateNumber(updateNumber.toNumber() - this.amountToFalsify);
      }
    }
    return super.getKeyForUpdateNumber(updateNumber);
  }

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
    const submission = await repCycle.getDisputeRounds(round, index);
    const firstDisagreeIdx = submission[8];
    const lastAgreeIdx = firstDisagreeIdx.sub(1);
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    const lastAgreeKey = ReputationMiningClient.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = ReputationMiningClient.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = ethers.utils.bigNumberify(0);
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx);
    }

    const tx = await repCycle.respondToChallenge(
      [
        round,
        index,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.nNodes,
        ReputationMiningClient.getHexString(agreeStateBranchMask),
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.nNodes,
        ReputationMiningClient.getHexString(disagreeStateBranchMask),
        this.justificationHashes[lastAgreeKey].newestReputationProof.branchMask,
        logEntryNumber,
        "0",
        this.justificationHashes[lastAgreeKey].originReputationProof.branchMask
      ],
      reputationKey,
      this.justificationHashes[firstDisagreeKey].justUpdatedProof.siblings,
      this.justificationHashes[lastAgreeKey].nextUpdateProof.value,
      agreeStateSiblings,
      this.justificationHashes[firstDisagreeKey].justUpdatedProof.value,
      disagreeStateSiblings,
      this.justificationHashes[lastAgreeKey].newestReputationProof.key,
      this.justificationHashes[lastAgreeKey].newestReputationProof.value,
      this.justificationHashes[lastAgreeKey].newestReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].originReputationProof.key,
      this.justificationHashes[lastAgreeKey].originReputationProof.value,
      this.justificationHashes[lastAgreeKey].originReputationProof.siblings,
      { gasLimit: 4000000 }
    );
    return tx;
  }
}

export default MaliciousReputationMiningWrongOriginReputation;
