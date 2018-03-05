import BN from "bn.js";
import ReputationMiningClient from "./main";

const accountAddress = "0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4";

export default class MaliciousReputationMiningClient extends ReputationMiningClient {
  // Only difference between this and the 'real' client should be that it adds some extra
  // reputation to the fourth entry being parsed.
  constructor(minerAddress, entryToFalsify, amountToFalsify) {
    super(minerAddress);
    this.entryToFalsify = entryToFalsify.toString();
    this.amountToFalsify = amountToFalsify.toString();
  }

  async addLogContentsToReputationTree(makeJustificationTree = false) {
    // Snapshot the current state, in case we get in to a dispute, and have to roll back
    // to generated the justification tree.
    let justUpdatedProof = { value: this.getValueAsBytes(0, 0), branchMask: 0, siblings: [] };
    let nextUpdateProof = { value: this.getValueAsBytes(0, 0), branchMask: 0, siblings: [] };

    await this.snapshotTree();
    let nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    nLogEntries = new BN(nLogEntries.toString());
    let interimHash;
    for (let i = new BN("0"); i.lt(nLogEntries); i.iadd(new BN("1"))) {
      interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.toString(), false); // eslint-disable-line no-await-in-loop
      let score = logEntry[1];
      if (i.toString() === this.entryToFalsify) {
        score = score.add(this.amountToFalsify);
      }
      if (makeJustificationTree) {
        if (i.toString() === "0") {
          // TODO If it's not already this value, then something has gone wrong, and we're working with the wrong state.
          // This 'if' statement is only in for now to make tests easier to write.
          interimHash = await this.colonyNetwork.getReputationRootHash(); // eslint-disable-line no-await-in-loop
        } else {
          const prevLogEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.subn(1).toString(), false); // eslint-disable-line no-await-in-loop
          const prevColonyAddress = prevLogEntry[3].slice(2);
          const prevSkillId = prevLogEntry[2];
          const prevUserAddress = prevLogEntry[0].slice(2);
          const prevKey = `0x${new BN(prevColonyAddress, 16).toString(16, 40)}${new BN(prevSkillId.toString()).toString(16, 64)}${new BN(
            prevUserAddress,
            16
          ).toString(16, 40)}`;

          justUpdatedProof = JSON.parse(JSON.stringify(nextUpdateProof));
          justUpdatedProof.value = this.reputations[prevKey];
        }
        await this.justificationTree.insert(`0x${i.toString(16, 64)}`, interimHash, { from: accountAddress, gas: 4000000 }); // eslint-disable-line no-await-in-loop

        const colonyAddress = logEntry[3].slice(2);
        const skillId = logEntry[2];
        const userAddress = logEntry[0].slice(2);
        const key = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(userAddress, 16).toString(
          16,
          40
        )}`;
        let branchMask;
        let siblings;
        let value;

        try {
          [branchMask, siblings] = await this.reputationTree.getProof(key); // eslint-disable-line no-await-in-loop
          value = this.reputations[key];
        } catch (err) {
          // Doesn't exist yet.
          branchMask = 0x0;
          siblings = [];
          value = this.getValueAsBytes(0, 0);
        }
        nextUpdateProof = { branchMask, siblings, key, value };
        this.justificationHashes[`0x${i.toString(16, 64)}`] = { interimHash, justUpdatedProof, nextUpdateProof };
      }

      // We have to process these sequentially - if two updates affected the
      // same entry, we would have a potential race condition.
      // Hence, we are awaiting inside these loops.
      // TODO: Include updates for all parent skills (and child, if x.amount is negative)
      // TODO: Include updates for colony-wide sums of skills.
      await this.insert(logEntry[3], logEntry[2], logEntry[0], score); // eslint-disable-line no-await-in-loop
    }
    // Add the last entry to the justification tree
    if (makeJustificationTree) {
      justUpdatedProof = nextUpdateProof;
      nextUpdateProof = {};
      interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      await this.justificationTree.insert(`0x${nLogEntries.toString(16, 64)}`, interimHash, { from: accountAddress, gas: 4000000 }); // eslint-disable-line no-await-in-loop
      if (nLogEntries.gtn(0)) {
        const prevLogEntry = await this.colonyNetwork.getReputationUpdateLogEntry(nLogEntries.subn(1).toString(), false); // eslint-disable-line no-await-in-loop
        const prevColonyAddress = prevLogEntry[3].slice(2);
        const prevSkillId = prevLogEntry[2];
        const prevUserAddress = prevLogEntry[0].slice(2);
        const prevKey = `0x${new BN(prevColonyAddress, 16).toString(16, 40)}${new BN(prevSkillId.toString()).toString(16, 64)}${new BN(
          prevUserAddress,
          16
        ).toString(16, 40)}`;
        justUpdatedProof.value = this.reputations[prevKey];
      }
      this.justificationHashes[`0x${nLogEntries.toString(16, 64)}`] = { interimHash, justUpdatedProof, nextUpdateProof };
    }
  }
}
