import BN from "bn.js";

const ganache = require("ganache-core");
const contract = require("truffle-contract");
const ReputationMiningCycleJSON = require("../build/contracts/ReputationMiningCycle.json");
const ColonyNetworkJSON = require("../build/contracts/IColonyNetwork.json");
const PatriciaTreeJSON = require("../build/contracts/PatriciaTree.json");

const ReputationMiningCycle = contract(ReputationMiningCycleJSON);

const jsonfile = require("jsonfile");

const file = "./reputations.json";

const Web3 = require("web3");

const ColonyNetwork = contract(ColonyNetworkJSON);
const accountAddress = "0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4";

class ReputationMiningClient {
  constructor(minerAddress, realProviderPort = 8545) {
    this.web3 = new Web3();
    this.minerAddress = minerAddress;
    this.PatriciaTree = contract(PatriciaTreeJSON);
    this.ganacheProvider = ganache.provider({
      network_id: 515,
      vmErrorsOnRPCResponse: false,
      locked: false,
      verbose: true,
      accounts: [
        {
          balance: "0x10000000000000000000000000",
          secretKey: "0xe5c050bb6bfdd9c29397b8fe6ed59ad2f7df83d6fd213b473f84b489205d9fc7"
        }
      ]
    });
    this.PatriciaTree.setProvider(this.ganacheProvider);
    this.realProvider = new Web3.providers.HttpProvider(`http://localhost:${realProviderPort}`);
    ColonyNetwork.setProvider(this.realProvider);
    ReputationMiningCycle.setProvider(this.realProvider);
    try {
      this.reputations = jsonfile.readFileSync(file);
    } catch (err) {
      this.reputations = {};
    }
  }

  async initialise(colonyNetworkAddress) {
    this.reputationTree = await this.PatriciaTree.new({ from: accountAddress, gas: 4000000 });
    this.nReputations = 0;
    this.setColonyNetworkAddress(colonyNetworkAddress);
  }

  async setColonyNetworkAddress(address) {
    this.colonyNetwork = ColonyNetwork.at(address);
  }

  async getNewestReputationInformation() {
    let newestReputationKey = Object.keys(this.reputations)[this.nReputations - 1];
    let newestReputationValue;
    if (!newestReputationKey) {
      newestReputationKey = 0x0;
      newestReputationValue = `0x${new BN("0").toString(16, 64)}`;
    } else {
      newestReputationValue = this.reputations[newestReputationKey];
    }
    const [newestReputationBranchMask, newestReputationSiblings] = await this.reputationTree.getProof(newestReputationKey);
    return [newestReputationKey, newestReputationValue, newestReputationBranchMask, newestReputationSiblings];
  }

  snapshotTree() {
    this.snapshottedReputations = Object.assign({}, this.reputations);
    this.snapshottedNReputations = this.nReputations;
    return new Promise((resolve, reject) => {
      this.ganacheProvider.sendAsync(
        {
          jsonrpc: "2.0",
          method: "evm_snapshot",
          params: [],
          id: 0
        },
        (err, res) => {
          if (err !== null) return reject(err);
          this.lastSnapshotId = res.result;
          return resolve(res);
        }
      );
    });
  }

  revertTree() {
    this.reputations = Object.assign({}, this.snapshottedReputations);
    this.nReputations = this.snapshottedNReputations;
    return new Promise((resolve, reject) => {
      this.ganacheProvider.sendAsync(
        {
          jsonrpc: "2.0",
          method: "evm_revert",
          params: [this.lastSnapshotId],
          id: 0
        },
        (err, res) => {
          if (err !== null) return reject(err);
          return resolve(res);
        }
      );
    });
  }

  async submitJustificationRootHash() {
    const jrh = await this.justificationTree.getRootHash();
    const [branchMask1, siblings1] = await this.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
    const nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    const [branchMask2, siblings2] = await this.justificationTree.getProof(`0x${new BN(nLogEntries.toString()).toString(16, 64)}`);
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);

    const [round, index] = await this.getMySubmissionRoundAndIndex();
    await repCycle.submitJRH(round.toString(), index.toString(), jrh, branchMask1, siblings1, branchMask2, siblings2, {
      from: this.minerAddress,
      gas: 6000000
    });
  }

  // The version of this function in malicious.js uses `this`, but not here.
  // eslint-disable-next-line class-methods-use-this
  getScore(i, logEntry) {
    return logEntry[1];
  }

  async addLogContentsToReputationTree() {
    const makeJustificationTree = true;
    // Snapshot the current state, in case we get in to a dispute, and have to roll back
    // to generated the justification tree.
    let justUpdatedProof = { value: this.getValueAsBytes(0, 0), branchMask: 0, siblings: [] };
    let nextUpdateProof = { value: this.getValueAsBytes(0, 0), branchMask: 0, siblings: [] };

    // await this.snapshotTree();
    this.justificationTree = await this.PatriciaTree.new({ from: accountAddress, gas: 4000000 });
    this.justificationHashes = {};

    let nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    nLogEntries = new BN(nLogEntries.toString());
    let interimHash;
    let jhLeafValue;
    for (let i = new BN("0"); i.lt(nLogEntries); i.iadd(new BN("1"))) {
      interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      // console.log(interimHash);
      jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
      // console.log(jhLeafValue);
      const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.toString(), false); // eslint-disable-line no-await-in-loop
      const score = this.getScore(i, logEntry);
      let newestReputationKey = 0x0;
      let newestReputationValue = 0x0;
      let newestReputationBranchMask = 0x0;
      let newestReputationSiblings = [];
      if (makeJustificationTree) {
        if (i.toString() === "0") {
          // TODO If it's not already this value, then something has gone wrong, and we're working with the wrong state.
          // This 'if' statement is only in for now to make tests easier to write.
          interimHash = await this.colonyNetwork.getReputationRootHash(); // eslint-disable-line no-await-in-loop
          jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
        } else {
          const prevLogEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i.subn(1).toString(), false); // eslint-disable-line no-await-in-loop
          const prevColonyAddress = prevLogEntry[3].slice(2);
          const prevSkillId = prevLogEntry[2];
          const prevUserAddress = prevLogEntry[0].slice(2);
          const prevKey = `0x${new BN(prevColonyAddress, 16).toString(16, 40)}${new BN(prevSkillId.toString()).toString(16, 64)}${new BN(
            prevUserAddress,
            16
          ).toString(16, 40)}`;

          justUpdatedProof.value = this.reputations[prevKey];
          justUpdatedProof.key = prevKey;
          justUpdatedProof.nNodes = this.nReputations;
          [justUpdatedProof.branchMask, justUpdatedProof.siblings] = await this.reputationTree.getProof(prevKey); // eslint-disable-line no-await-in-loop

          [
            newestReputationKey,
            newestReputationValue,
            newestReputationBranchMask,
            newestReputationSiblings
          ] = await this.getNewestReputationInformation(i); // eslint-disable-line no-await-in-loop
        }
        // console.log('done');
        // console.log(jhLeafValue);
        await this.justificationTree.insert(`0x${i.toString(16, 64)}`, jhLeafValue, { from: accountAddress, gas: 4000000 }); // eslint-disable-line no-await-in-loop

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
        nextUpdateProof = { branchMask, siblings, key, value, nNodes: this.nReputations };
        this.justificationHashes[`0x${i.toString(16, 64)}`] = JSON.parse(
          JSON.stringify({
            interimHash,
            nNodes: this.nReputations,
            jhLeafValue,
            justUpdatedProof,
            nextUpdateProof,
            newestReputationKey,
            newestReputationValue,
            newestReputationBranchMask,
            newestReputationSiblings
          })
        );
      }

      // We have to process these sequentially - if two updates affected the
      // same entry, we would have a potential race condition.
      // Hence, we are awaiting inside these loops.
      // TODO: Include updates for all parent skills (and child, if x.amount is negative)
      // TODO: Include updates for colony-wide sums of skills.
      await this.insert(logEntry[3], logEntry[2], logEntry[0], score, i); // eslint-disable-line no-await-in-loop
    }
    // Add the last entry to the justification tree
    if (makeJustificationTree) {
      justUpdatedProof = nextUpdateProof;
      nextUpdateProof = {};
      interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
      jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);

      await this.justificationTree.insert(`0x${nLogEntries.toString(16, 64)}`, jhLeafValue, { from: accountAddress, gas: 4000000 }); // eslint-disable-line no-await-in-loop
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
      this.justificationHashes[`0x${nLogEntries.toString(16, 64)}`] = {
        interimHash,
        nNodes: this.nReputations,
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof
      };
    }
    // console.log(this.justificationHashes);
  }

  async getMySubmissionRoundAndIndex() {
    const submittedHash = await this.reputationTree.getRootHash();
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);

    let index = new BN("-1");
    const round = new BN("0");
    let submission = [];
    while (submission[0] !== submittedHash) {
      try {
        index.iaddn(1);
        submission = await repCycle.disputeRounds(round.toString(), index.toString()); // eslint-disable-line no-await-in-loop
      } catch (err) {
        round.iaddn(1);
        index = new BN("-1");
      }
    }
    return [round, index];
  }

  async respondToBinarySearchForChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);
    let submission = await repCycle.disputeRounds(round.toString(), index.toString());
    const targetNode = new BN(
      submission[8]
        .plus(submission[9])
        .div(2)
        .floor()
        .toString()
    );
    const intermediateReputationHash = this.justificationHashes[`0x${targetNode.toString(16, 64)}`].jhLeafValue;
    const [branchMask, siblings] = await this.justificationTree.getProof(`0x${targetNode.toString(16, 64)}`);
    // const impliedRoot = await repCycle.getImpliedRoot(`0x${targetNode.toString(16,64)}`, intermediateReputationHash, branchMask, siblings);
    await repCycle.binarySearchForChallenge(round.toString(), index.toString(), intermediateReputationHash, branchMask, siblings, {
      from: this.minerAddress,
      gas: 1000000
    });
    submission = await repCycle.disputeRounds(round.toString(), index.toString());
  }

  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);
    // TODO: REmove 'real'
    const submission = await repCycle.disputeRounds(round.toString(), index.toString());
    // console.log(submission);
    const firstDisagreeIdx = new BN(submission[8].toString());
    const lastAgreeIdx = firstDisagreeIdx.subn(1);
    // console.log('getReputationUPdateLogEntry', lastAgreeIdx);
    const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(lastAgreeIdx.toString(), false);
    // console.log('getReputationUPdateLogEntry done');
    const colonyAddress = logEntry[3];
    const skillId = logEntry[2];
    const userAddress = logEntry[0];
    const reputationKey = `0x${new BN(colonyAddress.slice(2), 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(
      userAddress.slice(2),
      16
    ).toString(16, 40)}`;
    // console.log('get justification tree');
    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
    // console.log('get justification tree done');

    // These comments can help with debugging. This implied root is the intermediate root hash that is implied
    // const impliedRoot = await this.justificationTree.getImpliedRoot(
    //   reputationKey,
    //   this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
    //   this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.branchMask,
    //   this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.siblings
    // );
    // console.log('intermediatRootHash', impliedRoot);
    // // This one is the JRH implied by the proof provided alongside the above implied root - we expect this to
    // // be the JRH that has been submitted.
    // const impliedRoot2 = await this.justificationTree.getImpliedRoot(
    //   `0x${new BN(lastAgreeIdx).toString(16, 64)}`,
    //   impliedRoot,
    //   agreeStateBranchMask,
    //   agreeStateSiblings
    // );
    // const jrh = await this.justificationTree.getRootHash();
    // console.log('implied jrh', impliedRoot2)
    // console.log('actual jrh', jrh)
    // const impliedRoot3 = await this.justificationTree.getImpliedRoot(
    //   reputationKey,
    //   this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
    //   this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask,
    //   this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings
    // );
    // const impliedRoot4 = await this.justificationTree.getImpliedRoot(
    //   `0x${new BN(firstDisagreeIdx).toString(16, 64)}`,
    //   impliedRoot3,
    //   disagreeStateBranchMask,
    //   disagreeStateSiblings
    // );
    // console.log('intermediatRootHash2', impliedRoot3);
    // console.log('implied jrh from irh2', impliedRoot4);
    // console.log('about to respondToChallengeReal')

    return repCycle.respondToChallengeReal(
      [
        round.toString(),
        index.toString(),
        this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.branchMask,
        this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.nNodes,
        agreeStateBranchMask,
        this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.nNodes,
        disagreeStateBranchMask,
        this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationBranchMask,
        0
      ],
      reputationKey,
      this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.siblings,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].nextUpdateProof.value,
      agreeStateSiblings,
      this.justificationHashes[`0x${new BN(firstDisagreeIdx).toString(16, 64)}`].justUpdatedProof.value,
      disagreeStateSiblings,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationKey,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationValue,
      this.justificationHashes[`0x${new BN(lastAgreeIdx).toString(16, 64)}`].newestReputationSiblings,
      { from: this.minerAddress, gas: 4000000 }
    );
    // console.log('respondToChallengeReal done')
  }

  // async update(colonyAddress, skillId, userAddress, reputationScore){
  //   // TODO: If this User + colony + skill id already exists, then update, don't just insert.
  //   return this.insert(colonyAddress, skillId, userAddress, reputationScore);
  // }

  getValueAsBytes(reputation, uid) { //eslint-disable-line
    return `0x${new BN(reputation.toString()).toString(16, 64)}${new BN(uid.toString()).toString(16, 64)}`;
  }

  getJRHEntryValueAsBytes(_reputationState, nNodes) { //eslint-disable-line
    let reputationState = _reputationState.toString(16);
    if (reputationState.substring(0, 2) === "0x") {
      reputationState = reputationState.slice(2);
    }
    return `0x${new BN(reputationState.toString(), 16).toString(16, 64)}${new BN(nNodes.toString()).toString(16, 64)}`;
  }

  // function getNode(bytes32 hash) public view returns (Data.Node n);
  // function getProof(bytes key) public view returns (uint branchMask, bytes32[] _siblings);
  // function verifyProof(bytes32 rootHash, bytes key, bytes value, uint branchMask, bytes32[] siblings) public view returns (bool);
  // function insert(bytes key, bytes value) public;
  async insert(_colonyAddress, skillId, _userAddress, reputationScore, index) {
    let colonyAddress = _colonyAddress;
    let userAddress = _userAddress;
    // TODO fromAscii is deprecated - use asciiToHex once we upgrade web3.
    let isAddress = this.web3.isAddress(colonyAddress);
    // TODO should we return errors here?
    if (!isAddress) {
      return false;
    }
    isAddress = this.web3.isAddress(userAddress);
    if (!isAddress) {
      return false;
    }
    if (colonyAddress.substring(0, 2) === "0x") {
      colonyAddress = colonyAddress.slice(2);
    }
    if (userAddress.substring(0, 2) === "0x") {
      userAddress = userAddress.slice(2);
    }
    colonyAddress = colonyAddress.toLowerCase();
    userAddress = userAddress.toLowerCase();
    const key = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(userAddress, 16).toString(
      16,
      40
    )}`;
    // const keyAlreadyExists = await this.keyExists(key);
    // If we already have this key, then we lookup the unique identifier we assigned this key.
    // Otherwise, give it the new one.
    let value;
    const keyAlreadyExists = this.reputations[key] !== undefined;
    if (keyAlreadyExists) {
      // Look up value from our JSON.
      value = this.reputations[key];
      // Extract uid
      const uid = this.web3.toBigNumber(`0x${value.slice(-64)}`);
      const existingValue = this.web3.toBigNumber(`0x${value.slice(2, 66)}`);
      value = this.getValueAsBytes(existingValue.add(reputationScore), uid, index);
    } else {
      value = this.getValueAsBytes(reputationScore, this.nReputations + 1, index);
      this.nReputations += 1;
    }
    await this.reputationTree.insert(key, value, { from: accountAddress, gas: 4000000 });
    // If successful, add to our JSON.
    this.reputations[key] = value;
    return true;
  }

  async submitRootHash() {
    const addr = await this.colonyNetwork.getReputationMiningCycle.call();
    const repCycle = ReputationMiningCycle.at(addr);
    const hash = await this.getRootHash();
    // TODO: Work out what entry we should use when we submit
    const gas = await repCycle.submitNewHash.estimateGas(hash, this.nReputations, 1, { from: this.minerAddress });
    await repCycle.submitNewHash(hash, this.nReputations, 1, { from: this.minerAddress, gas: gas * 2 });
  }

  async getRootHash() {
    return this.reputationTree.getRootHash();
    // return this.reputationTree.root();
  }

  async getRootEdgeLabelData() {
    return this.reputationTree.getRootEdgeLabelData();
  }

  async getProof(key) {
    const res = await this.reputationTree.getProof(key);
    return res;
  }
}

export default ReputationMiningClient;
