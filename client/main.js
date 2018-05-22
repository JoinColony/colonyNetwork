const BN = require("bn.js");
const web3Utils = require("web3-utils");
const ganache = require("ganache-core");

// We disable the import/no-unresolved rule for these lines because when ESLint is run on Circle, the contracts haven't
// been compiled yet and so would fail here.
const ReputationMiningCycleJSON = require("../build/contracts/IReputationMiningCycle.json"); // eslint-disable-line import/no-unresolved
const ColonyNetworkJSON = require("../build/contracts/IColonyNetwork.json"); // eslint-disable-line import/no-unresolved
const PatriciaTreeJSON = require("../build/contracts/PatriciaTree.json"); // eslint-disable-line import/no-unresolved

const jsonfile = require("jsonfile");

const file = "./reputations.json";

const ethers = require("ethers");

// We don't need the account address right now for this secret key, but I'm leaving it in in case we
// do in the future.
// const accountAddress = "0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4";
const secretKey = "0xe5c050bb6bfdd9c29397b8fe6ed59ad2f7df83d6fd213b473f84b489205d9fc7";

// Adapted from https://github.com/ethers-io/ethers.js/issues/59
// ===================================
function RPCSigner(minerAddress, provider) {
  this.address = minerAddress;
  this.provider = provider;
  const signer = this;
  this.sendTransaction = function sendTransaction(transaction) {
    const tx = this.buildTx(transaction);
    return signer.provider.send("eth_sendTransaction", [tx]);
  };

  this.estimateGas = async function estimateGas(transaction) {
    const tx = this.buildTx(transaction);
    const res = await signer.provider.send("eth_estimateGas", [tx]);
    return ethers.utils.bigNumberify(res);
  };

  this.buildTx = function buildTx(transaction) {
    const tx = {
      from: this.address
    };
    ["to", "data"].forEach(key => {
      if (transaction[key] != null) {
        tx[key] = transaction[key];
      }
    });
    ["gasPrice", "nonce", "value"].forEach(key => {
      if (transaction[key] != null) {
        tx[key] = ethers.utils.hexlify(transaction[key]);
      }
    });
    if (transaction.gasLimit != null) {
      tx.gas = ethers.utils.hexlify(transaction.gasLimit);
    }
    return tx;
  };
}
// ===================================

class ReputationMiningClient {
  /**
   * Constructor for ReputationMiningClient
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor(minerAddress, realProviderPort = 8545) {
    this.minerAddress = minerAddress;
    const ganacheProvider = ganache.provider({
      network_id: 515,
      vmErrorsOnRPCResponse: false,
      locked: false,
      verbose: true,
      accounts: [
        {
          balance: "0x10000000000000000000000000",
          secretKey
        }
      ]
    });
    this.ganacheProvider = new ethers.providers.Web3Provider(ganacheProvider);
    this.ganacheWallet = new ethers.Wallet(secretKey, this.ganacheProvider);

    this.realProvider = new ethers.providers.JsonRpcProvider(`http://localhost:${realProviderPort}`);
    this.realWallet = new RPCSigner(minerAddress, this.realProvider);

    try {
      this.reputations = jsonfile.readFileSync(file);
    } catch (err) {
      this.reputations = {};
    }
  }

  /**
   * Initialises the mining client so that it knows where to find the `ColonyNetwork` contract
   * @param  {string}  colonyNetworkAddress The address of the current `ColonyNetwork` contract
   * @return {Promise}
   */
  async initialise(colonyNetworkAddress) {
    const patriciaTreeDeployTx = ethers.Contract.getDeployTransaction(PatriciaTreeJSON.bytecode, PatriciaTreeJSON.abi);
    const tx = await this.ganacheWallet.sendTransaction(patriciaTreeDeployTx);
    this.reputationTree = new ethers.Contract(ethers.utils.getContractAddress(tx), PatriciaTreeJSON.abi, this.ganacheWallet);
    this.nReputations = 0;
    this.colonyNetwork = new ethers.Contract(colonyNetworkAddress, ColonyNetworkJSON.abi, this.realWallet);
  }

  /**
   * When called, adds the entire contents of the current (inactive) log to its reputation tree. It also builds a Justification Tree as it does so
   * in case a dispute is called which would require it.
   * @return {Promise}
   */
  async addLogContentsToReputationTree() {
    const patriciaTreeDeployTx = ethers.Contract.getDeployTransaction(PatriciaTreeJSON.bytecode, PatriciaTreeJSON.abi);

    const tx = await this.ganacheWallet.sendTransaction(patriciaTreeDeployTx);
    this.justificationTree = new ethers.Contract(ethers.utils.getContractAddress(tx), PatriciaTreeJSON.abi, this.ganacheWallet);

    this.justificationHashes = {};
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    let nLogEntries = await repCycle.getReputationUpdateLogLength();
    nLogEntries = new BN(nLogEntries.toString());
    for (let i = new BN("0"); i.lt(nLogEntries); i.iadd(new BN("1"))) {
      await this.addSingleLogEntry(i); // eslint-disable-line no-await-in-loop
    }

    const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.subn(1).toString());
    const nUpdates = new BN(lastLogEntry[4].add(lastLogEntry[5]).toString());
    const prevKey = await this.getKeyForUpdateNumber(nUpdates.subn(1));
    const justUpdatedProof = await this.getReputationProofObject(prevKey);
    const newestReputationProof = await this.getNewestReputationProofObject(nUpdates);
    const interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
    const jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    const nextUpdateProof = {};
    await this.justificationTree.insert(`0x${nUpdates.toString(16, 64)}`, jhLeafValue, { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop

    this.justificationHashes[`0x${nUpdates.toString(16, 64)}`] = JSON.parse(
      JSON.stringify({
        interimHash,
        nNodes: this.nReputations,
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof,
        newestReputationProof
      })
    );
  }

  /**
   * Function called by `addLogContentsToReputationTree` to process a single log entry, updating the reputation tree and the justification tree
   * as it does so.
   * @param  {Number}  i    The index of the log entry to process. Note that the final time this function is called, it is equal to the number of logs entries
   *                        present, which could cause out-of-bounds errors if unchecke. In this case, `last` will be set to true to avoid errors.
   * @return {Promise}
   */
  async addSingleLogEntry(i) {
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    const logEntry = await repCycle.getReputationUpdateLogEntry(i.toString()); // eslint-disable-line no-await-in-loop

    const nUpdates = new BN(logEntry[4].toString());
    for (let j = new BN("0"); j.lt(nUpdates); j.iadd(new BN("1"))) {
      await this.addSingleReputationUpdate(j, logEntry); // eslint-disable-line no-await-in-loop
    }
  }

  /**
   * Process the `j`th update that the log entry logEntry implies, and add to the current reputation state and the
   * justificationtree.
   * @param  {BigNumber}  j     The number of the update that the the log entry implies that should be considered.
   * @param  {[type]}  logEntry The log entry describing the reputation change to be applied
   * @return {Promise}
   */
  async addSingleReputationUpdate(j, logEntry) {
    let interimHash;
    let jhLeafValue;
    let justUpdatedProof;
    let newestReputationProof;
    interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
    jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    const updateNumber = new BN(logEntry[5].add(j).toString());
    const score = this.getScore(updateNumber, logEntry);

    if (updateNumber.toString() === "0") {
      // TODO If it's not already this value, then something has gone wrong, and we're working with the wrong state.
      // This 'if' statement is only in for now to make tests easier to write.
      interimHash = await this.colonyNetwork.getReputationRootHash(); // eslint-disable-line no-await-in-loop
      jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    } else {
      const prevKey = await this.getKeyForUpdateNumber(updateNumber.subn(1));
      justUpdatedProof = await this.getReputationProofObject(prevKey);
      newestReputationProof = await this.getNewestReputationProofObject(updateNumber);
    }
    await this.justificationTree.insert(`0x${updateNumber.toString(16, 64)}`, jhLeafValue, { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop

    const key = await this.getKeyForUpdateNumber(updateNumber);
    const nextUpdateProof = await this.getReputationProofObject(key);

    this.justificationHashes[`0x${updateNumber.toString(16, 64)}`] = JSON.parse(
      JSON.stringify({
        interimHash,
        nNodes: this.nReputations,
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof,
        newestReputationProof
      })
    );

    const [skillId, skillAddress] = await this.getSkillIdAndAddressForUpdateInLogEntry(j, logEntry); // eslint-disable-line no-await-in-loop

    // TODO: Include updates for all child skills if x.amount is negative
    // We update colonywide sums first (children, parents, skill)
    // Then the user-specifc sums in the order children, parents, skill.
    await this.insert(logEntry[3], skillId, skillAddress, score, updateNumber); // eslint-disable-line no-await-in-loop
  }

  /**
   * Get an object containing the key, value, and branchMask and siblings of the merkle proof of the provided key in the current reputation state. If the key
   * does not exist in the current state, returns valid 0-based values for each element (e.g. `0x0` for the branchMask);
   * @return {Promise}    The returned promise will resolve to `[key, value, branchMask, siblings]`
   */
  async getReputationProofObject(key) {
    let branchMask;
    let siblings;
    let value;

    try {
      [branchMask, siblings] = await this.getProof(key); // eslint-disable-line no-await-in-loop
      value = this.reputations[key];
    } catch (err) {
      // Doesn't exist yet.
      branchMask = 0x0;
      siblings = [];
      value = this.getValueAsBytes(0, 0);
    }
    return { branchMask: `${branchMask.toString(16)}`, siblings, key, value, nNodes: this.nReputations };
  }

  /**
   * For the supplied log entry, return the key in the reputation log that is affected by the update.
   * @param  {[type]}  i The index of the entry of interest in the reputation log.
   * @return {Promise}   A promise that resolves to the key of the corresponding reputation.
   */
  async getKeyForLogEntry(i) {
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    const logEntry = await repCycle.getReputationUpdateLogEntry(i); // eslint-disable-line no-await-in-loop
    const colonyAddress = logEntry[3].slice(2);
    const skillId = logEntry[2];
    const userAddress = logEntry[0].slice(2);
    const key = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(userAddress, 16).toString(
      16,
      40
    )}`;
    return key;
  }

  /**
   * For update `_i` in the reputationUpdateLog currently under consideration, return the log entry that contains that update. Note that these
   * are not the same number because each entry in the log implies multiple reputation updates.
   * @param  {Number}  _i The update number we wish to determine which log entry in the reputationUpdateLog creates
   * @return {Promise}   A promise that resolves to the number of the corresponding log entry.
   */
  async getLogEntryNumberForUpdateNumber(_i) {
    const updateNumber = new BN(_i.toString());
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    const nLogEntries = await repCycle.getReputationUpdateLogLength();
    let lower = new BN("0");
    let upper = new BN(nLogEntries.toString()).subn(1);

    while (!upper.eq(lower)) {
      const testIdx = lower.add(upper.sub(lower).divn(2));
      const testLogEntry = await repCycle.getReputationUpdateLogEntry(testIdx); // eslint-disable-line no-await-in-loop
      if (new BN(testLogEntry[5].toString()).gt(updateNumber)) {
        upper = testIdx.subn(1);
      } else if (
        new BN(testLogEntry[5].toString()).lte(updateNumber) &&
        new BN(testLogEntry[5].toString()).add(new BN(testLogEntry[4].toString())).gt(updateNumber)
      ) {
        upper = testIdx;
        lower = testIdx;
      } else {
        lower = testIdx.addn(1);
      }
    }

    return lower;
  }

  async getKeyForUpdateNumber(_i) {
    const updateNumber = new BN(_i.toString());
    const logEntryNumber = await this.getLogEntryNumberForUpdateNumber(updateNumber);
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    const logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber.toString());

    const [skillId, userAddress] = await this.getSkillIdAndAddressForUpdateInLogEntry(updateNumber.sub(new BN(logEntry[5].toString())), logEntry);
    const key = `0x${new BN(logEntry[3].slice(2), 16).toString(16, 40)}${new BN(skillId.toString()).toString(16, 64)}${new BN(
      userAddress.slice(2),
      16
    ).toString(16, 40)}`;
    return key;
  }

  /**
   * Gets the skillId and 'user' address appropriate for the nth reputation update that logEntry implies.
   * If updateNumber is in the first half of the number of updates logEntry implies, `skillAddress` is 0x0, as
   * this corresponds to a colony-wide total amount of reputation being update. Otherwise, `skillAddress` is the
   * address of the user in the log entry.
   * The skillId depends on whether it is a child, parent or the skill listed in the log entry itself being updated.
   * @param  {BigNumber}  _updateNumber The number of the update the log entry implies we want the information for. Must be less than logEntry[4].
   * @param  {LogEntry}  logEntry An array six long, containing the log entry in question [userAddress, amount, skillId, colony, nUpdates, nPreviousUpdates ]
   * @return {Promise}              Promise that resolves to [skillId, address]
   */
  async getSkillIdAndAddressForUpdateInLogEntry(_updateNumber, logEntry) {
    const updateNumber = new BN(_updateNumber.toString());
    let skillAddress;
    // We need to work out the skillId and user address to use.
    // If we are in the first half of 'j's, then we are dealing with global update, so
    // the skilladdress will be 0x0, rather than the user address
    if (updateNumber.lt(new BN(logEntry[4].toString()).divn(2))) {
      skillAddress = "0x0000000000000000000000000000000000000000";
    } else {
      skillAddress = logEntry[0]; // eslint-disable-line prefer-destructuring
      // Following the destructuring rule, this line would be [skillAddress] = logEntry, which I think is very misleading
    }
    const nUpdates = new BN(logEntry[4].toString());
    const score = this.getScore(updateNumber, logEntry);

    let [nParents] = await this.colonyNetwork.getSkill(logEntry[2]);
    nParents = new BN(nParents.toString());
    let skillId;
    // NB This is not necessarily the same as nChildren. However, this is the number of child updates
    // that this entry in the log was expecting at the time it was created.
    let nChildUpdates;
    if (score.gte(new BN("0"))) {
      nChildUpdates = new BN("0");
    } else {
      nChildUpdates = nUpdates
        .divn(2)
        .subn(1)
        .sub(new BN(nParents.toString()));
    }
    // The list of skill ids to be updated is the same for the first half and the second half of the list of updates this
    // log entry implies, it's just the skillAddress that is different, which we've already established. So
    let skillIndex;
    if (updateNumber.gte(nUpdates.divn(2))) {
      skillIndex = updateNumber.sub(nUpdates.divn(2));
    } else {
      skillIndex = updateNumber;
    }

    if (skillIndex.lt(nChildUpdates)) {
      // Then the skill being updated is the skillIndex-th child skill
      skillId = await this.colonyNetwork.getChildSkillId(logEntry[2].toString(), skillIndex.toString());
    } else if (skillIndex.lt(nChildUpdates.add(nParents))) {
      // Then the skill being updated is the skillIndex-nChildUpdates-th parent skill
      skillId = await this.colonyNetwork.getParentSkillId(logEntry[2].toString(), skillIndex.sub(nChildUpdates).toString());
    } else {
      // Then the skill being update is the skill itself - not a parent or child
      skillId = logEntry[2]; // eslint-disable-line prefer-destructuring
    }
    return [skillId, skillAddress];
  }

  /**
   * Formats `_reputationState` and `nNodes` in to the format used for the Justification Tree
   * @param  {bigNumber or string} _reputationState The reputation state root hashes
   * @param  {bigNumber or string} nNodes           The number of nodes in the reputation state Tree
   * @return {string}                               The correctly formatted hex string for inclusion in the justification tree
   */
  getJRHEntryValueAsBytes(_reputationState, nNodes) { //eslint-disable-line
    let reputationState = _reputationState.toString(16);
    if (reputationState.substring(0, 2) === "0x") {
      reputationState = reputationState.slice(2);
    }
    return `0x${new BN(reputationState.toString(), 16).toString(16, 64)}${new BN(nNodes.toString()).toString(16, 64)}`;
  }

  /**
   * Formats `reputation` and `uid` in to the format used for the Reputation Tree
   * @param  {bigNumber or string} reputation The reputation score
   * @param  {bigNumber or string} uid        The global UID assigned to this reputation
   * @return {string}            Appropriately formatted hex string
   */
  getValueAsBytes(reputation, uid) { //eslint-disable-line
    return `0x${new BN(reputation.toString()).toString(16, 64)}${new BN(uid.toString()).toString(16, 64)}`;
  }

  /**
   * Get the reputation change from the supplied logEntry
   * @param  {Number} i        The number of the log entry. Not used here, but is in malicious.js to know whether to lie
   * @param  {Array} logEntry The log entry
   * @return {BigNumber}        The entry's reputation change
   * @dev The version of this function in malicious.js uses `this`, but not this version.
   */
  // eslint-disable-next-line class-methods-use-this
  getScore(i, logEntry) {
    return logEntry[1];
  }

  /**
   * Get the key and value of the most recently added reputation (i.e. the one with the highest UID),
   * and proof (branchMask and siblings) that it exists in the current reputation state.
   * @return {Promise}    The returned promise will resolve to `[key, value, branchMask, siblings]`
   */
  // eslint-disable-next-line no-unused-vars
  async getNewestReputationProofObject(i) {
    // i is unused here, but is used in the Malicious3 mining client.
    const key = Object.keys(this.reputations)[this.nReputations - 1];
    return this.getReputationProofObject(key);
  }

  /**
   * Submit what the client believes should be the next reputation state root hash to the `ReputationMiningCycle` contract
   * @return {Promise}
   */
  async submitRootHash() {
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

    const hash = await this.getRootHash();
    // TODO: Work out what entry we should use when we submit
    const gas = await repCycle.estimate.submitRootHash(hash, this.nReputations, 1);
    await repCycle.submitRootHash(hash, this.nReputations, 1, { gasLimit: `0x${gas.mul(2).toString()}` });
  }

  /**
   * Get what the client believes should be the next reputation state root hash.
   * @return {Promise}      Resolves to the root hash
   */
  async getRootHash() {
    return this.reputationTree.getRootHash();
  }

  /**
   * Get a Merkle proof for `key` in the current (local) reputation state.
   * @param  {string}  key The reputation key the proof is being asked for
   * @return {Promise}     Resolves to [branchMask, siblings]
   */
  async getProof(key) {
    const [branchMask, siblings] = await this.reputationTree.getProof(key);
    const retBranchMask = branchMask.toHexString();
    return [retBranchMask, siblings];
  }

  /**
   * Submit the Justification Root Hash (JRH) for the hash that (presumably) we submitted this round
   * @return {Promise}
   */
  async submitJustificationRootHash() {
    const jrh = await this.justificationTree.getRootHash();
    const [branchMask1, siblings1] = await this.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);

    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    let nLogEntries = await repCycle.getReputationUpdateLogLength();
    nLogEntries = new BN(nLogEntries.toString());
    const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.subn(1).toString());
    const nUpdates = new BN(lastLogEntry[4].toString()).add(new BN(lastLogEntry[5].toString()));
    const [branchMask2, siblings2] = await this.justificationTree.getProof(`0x${nUpdates.toString(16, 64)}`);
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const res = repCycle.submitJustificationRootHash(round.toString(), index.toString(), jrh, branchMask1, siblings1, branchMask2, siblings2, {
      gasLimit: 6000000
    });
    return res;
  }

  /**
   * Returns the round and index that our submission is currently at in the dispute cycle.
   * @return {Promise} Resolves to [round, index] which are `BigNumber`.
   */
  async getMySubmissionRoundAndIndex() {
    const submittedHash = await this.reputationTree.getRootHash();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);

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

  /**
   * Respond to the next stage in the binary search occurring on `ReputationMiningCycle` contract in order to find
   * the first log entry where our submitted hash and the hash we are paired off against differ.
   * @return {Promise} Resolves to the tx hash of the response
   */
  async respondToBinarySearchForChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    let submission = await repCycle.disputeRounds(round.toString(), index.toString());
    const targetNode = new BN(
      submission[8]
        .add(submission[9])
        .div(2)
        .toString()
    );
    const intermediateReputationHash = this.justificationHashes[`0x${targetNode.toString(16, 64)}`].jhLeafValue;
    const [branchMask, siblings] = await this.justificationTree.getProof(`0x${targetNode.toString(16, 64)}`);

    const tx = await repCycle.respondToBinarySearchForChallenge(
      round.toString(),
      index.toString(),
      intermediateReputationHash,
      branchMask,
      siblings,
      {
        gasLimit: 1000000
      }
    );
    submission = await repCycle.disputeRounds(round.toString(), index.toString());
    return tx;
  }

  /**
   * Respond to a specific challenge over the effect of a specific log entry once the binary search has been completed to establish
   * the log entry where the two submitted hashes differ.
   * @return {Promise} Resolves to tx hash of the response
   */
  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    const repCycle = new ethers.Contract(addr, ReputationMiningCycleJSON.abi, this.realWallet);
    const submission = await repCycle.disputeRounds(round.toString(), index.toString());
    // console.log(submission);
    const firstDisagreeIdx = new BN(submission[8].toString());
    const lastAgreeIdx = firstDisagreeIdx.subn(1);
    // console.log('getReputationUPdateLogEntry', lastAgreeIdx);
    // const logEntry = await repCycle.getReputationUpdateLogEntry(lastAgreeIdx.toString());
    // console.log('getReputationUPdateLogEntry done');
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx.toString());
    // console.log('get justification tree');
    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(`0x${lastAgreeIdx.toString(16, 64)}`);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(`0x${firstDisagreeIdx.toString(16, 64)}`);
    const logEntryNumber = await this.getLogEntryNumberForUpdateNumber(lastAgreeIdx.toString());
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

  /**
   * Insert (or update) the reputation for a user in the local reputation tree
   * @param  {string}  _colonyAddress  Hex address of the colony in which the reputation is being updated
   * @param  {Number or BigNumber or String}  skillId        The id of the skill being updated
   * @param  {string}  _userAddress    Hex address of the user who is having their reputation being updated
   * @param  {Number of BigNumber or String}  reputationScore The new reputation value
   * @param  {Number or BigNumber}  index           The index of the log entry being considered
   * @return {Promise}                 Resolves to `true` or `false` depending on whether the insertion was successful
   */
  async insert(_colonyAddress, skillId, _userAddress, reputationScore, index) {
    let colonyAddress = _colonyAddress;
    let userAddress = _userAddress;

    let isAddress = web3Utils.isAddress(colonyAddress);
    // TODO should we return errors here?
    if (!isAddress) {
      return false;
    }
    isAddress = web3Utils.isAddress(userAddress);
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
      const uid = ethers.utils.bigNumberify(`0x${value.slice(-64)}`);
      const existingValue = ethers.utils.bigNumberify(`0x${value.slice(2, 66)}`);
      value = this.getValueAsBytes(existingValue.add(reputationScore), uid, index);
    } else {
      value = this.getValueAsBytes(reputationScore, this.nReputations + 1, index);
      this.nReputations += 1;
    }
    await this.reputationTree.insert(key, value, { gasLimit: 4000000 });
    // If successful, add to our JSON.
    this.reputations[key] = value;
    return true;
  }
}

export default ReputationMiningClient;
