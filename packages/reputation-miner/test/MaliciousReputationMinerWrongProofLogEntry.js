import BN from "bn.js";
import ReputationMiningClient from "../ReputationMiner";

const ethers = require("ethers");
const ReputationMiningCycleJSON = require("../../../build/contracts/IReputationMiningCycle.json"); // eslint-disable-line import/no-unresolved

class MaliciousReputationMiningWrongProofLogEntry extends ReputationMiningClient {
  // This client will supply the wrong log entry as part of its proof
  constructor(opts, amountToFalsify) {
    super(opts);
    this.amountToFalsify = new BN(amountToFalsify.toString());
  }

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    const submission = await repCycle.disputeRounds(round.toString(), index.toString());
    const firstDisagreeIdx = new BN(submission[8].toString());
    const lastAgreeIdx = firstDisagreeIdx.subn(1);
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx.toString());
    // console.log('get justification tree');
    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
    const logEntryNumber = await this.getLogEntryNumberForUpdateNumber(lastAgreeIdx.toString());
    logEntryNumber.iadd(this.amountToFalsify);
    const tx = await repCycle.respondToChallenge(
      [
        round.toString(),
        index.toString(),
        this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask,
        this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes,
        agreeStateBranchMask.toHexString(),
        this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes,
        disagreeStateBranchMask.toHexString(),
        this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.branchMask,
        0,
        logEntryNumber.toString()
      ],
      reputationKey,
      this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
      agreeStateSiblings,
      this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
      disagreeStateSiblings,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.key,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.value,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationProof.siblings,
      { gasLimit: 4000000 }
    );
    return tx;
  }
}

export default MaliciousReputationMiningWrongProofLogEntry;
