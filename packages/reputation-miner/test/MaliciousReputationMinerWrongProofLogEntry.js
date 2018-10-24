import ReputationMiningClient from "../ReputationMiner";

const ethers = require("ethers");

class MaliciousReputationMiningWrongProofLogEntry extends ReputationMiningClient {
  // This client will supply the wrong log entry as part of its proof
  constructor(opts, amountToFalsify) {
    super(opts);
    this.amountToFalsify = amountToFalsify.toString();
  }

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
    const submission = await repCycle.getDisputeRounds(round, index);
    const firstDisagreeIdx = ethers.utils.bigNumberify(submission.lowerBound);
    const lastAgreeIdx = firstDisagreeIdx.sub(1);
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    const lastAgreeKey = MaliciousReputationMiningWrongProofLogEntry.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = MaliciousReputationMiningWrongProofLogEntry.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = ethers.utils.bigNumberify(0);
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.sub(this.nReputationsBeforeLatestLog));
    }
    logEntryNumber = logEntryNumber.add(this.amountToFalsify);

    const tx = await repCycle.respondToChallenge(
      [
        round,
        index,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.nNodes,
        MaliciousReputationMiningWrongProofLogEntry.getHexString(agreeStateBranchMask),
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.nNodes,
        MaliciousReputationMiningWrongProofLogEntry.getHexString(disagreeStateBranchMask),
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
      ],
      reputationKey,
      this.justificationHashes[firstDisagreeKey].justUpdatedProof.siblings,
      agreeStateSiblings,
      disagreeStateSiblings,
      this.justificationHashes[lastAgreeKey].newestReputationProof.key,
      this.justificationHashes[lastAgreeKey].newestReputationProof.siblings,
      this.justificationHashes[lastAgreeKey].originReputationProof.key,
      this.justificationHashes[lastAgreeKey].originReputationProof.siblings,
      { gasLimit: 4000000 }
    );
    return tx;
  }
}

export default MaliciousReputationMiningWrongProofLogEntry;
