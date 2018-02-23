import BN from "bn.js";
import ReputationMiningClient from "./main";

const accountAddress = "0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4";

export default class MaliciousReputationMiningClient extends ReputationMiningClient {
  // Only difference between this and the 'real' client should be that it adds some extra
  // reputation to the fourth entry being parsed.
  async addLogContentsToReputationTree(makeJustificationTree = false) {
    // Snapshot the current state, in case we get in to a dispute, and have to roll back
    // to generated the justification tree.

    await this.snapshotTree();
    let nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    nLogEntries = new BN(nLogEntries.toString());
    for (let i = new BN("0"); i.lt(nLogEntries); i.iadd(new BN("1"))) {
      let interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      if (makeJustificationTree) {
        if (i.toString() === "0") {
          // TODO If it's not already this value, then something has gone wrong, and we're working with the wrong state.
          // This 'if' statement is only in for now to make tests easier to write.
          interimHash = await this.colonyNetwork.getReputationRootHash(); // eslint-disable-line no-await-in-loop
        }
        await this.justificationTree.insert(`0x${i.toString(16, 64)}`, interimHash, { from: accountAddress, gas: 4000000 }); // eslint-disable-line no-await-in-loop
        this.justificationHashes[`0x${i.toString(16, 64)}`] = interimHash;
      }
      // We have to process these sequentially - if two updates affected the
      // same entry, we would have a potential race condition.
      // Hence, we are awaiting inside these loops.
      const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.toString(), false); // eslint-disable-line no-await-in-loop
      // TODO: Include updates for all parent skills (and child, if x.amount is negative)
      // TODO: Include updates for colony-wide sums of skills.
      let score = logEntry[1];
      if (i.toString() === "4") {
        score = score.add("0xfffffffff");
      }
      await this.insert(logEntry[3], logEntry[2], logEntry[0], score); // eslint-disable-line no-await-in-loop
    }
    // Add the last entry to the justification tree
    if (makeJustificationTree) {
      const interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      await this.justificationTree.insert(`0x${nLogEntries.toString(16, 64)}`, interimHash, { from: accountAddress, gas: 4000000 }); // eslint-disable-line no-await-in-loop
      this.justificationHashes[`0x${nLogEntries.toString(16, 64)}`] = interimHash;
    }
  }
}
