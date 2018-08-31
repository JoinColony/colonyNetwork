const BN = require("bn.js");
const web3Utils = require("web3-utils");
const ganache = require("ganache-core");
const ethers = require("ethers");
const sqlite = require("sqlite");
const patriciaJs = require("./patricia");

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
  this.sendTransaction = async function sendTransaction(transaction) {
    const tx = await this.buildTx(transaction);
    return signer.provider.send("eth_sendTransaction", [tx]);
  };

  this._ethersType = "Signer";

  this.getAddress = () => this.address;

  this.estimateGas = async function estimateGas(transaction) {
    const tx = this.buildTx(transaction);
    const res = await signer.provider.send("eth_estimateGas", [tx]);
    return ethers.utils.bigNumberify(res);
  };

  this.buildTx = async function buildTx(transaction) {
    const tx = {
      from: this.address
    };
    if (transaction.to != null) {
      tx.to = await transaction.to;
    }
    if (transaction.data !== null) {
      tx.data = transaction.data;
    }

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

class ReputationMiner {
  /**
   * Constructor for ReputationMiner
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor({ loader, minerAddress, privateKey, provider, realProviderPort = 8545, useJsTree = false, dbPath = "./reputationStates.sqlite" }) {
    this.loader = loader;
    this.minerAddress = minerAddress;
    this.dbPath = dbPath;

    this.useJsTree = useJsTree;
    if (!this.useJsTree) {
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
    }

    if (provider) {
      this.realProvider = provider;
    } else {
      this.realProvider = new ethers.providers.JsonRpcProvider(`http://localhost:${realProviderPort}`);
    }

    if (minerAddress) {
      this.realWallet = new RPCSigner(minerAddress, this.realProvider);
    } else {
      this.realWallet = new ethers.Wallet(privateKey, this.realProvider);
      // TODO: Check that this wallet can stake?
      console.log("Transactions will be signed from ", this.realWallet.address);
    }
  }

  /**
   * Initialises the mining client so that it knows where to find the `ColonyNetwork` contract
   * @param  {string}  colonyNetworkAddress The address of the current `ColonyNetwork` contract
   * @return {Promise}
   */
  async initialise(colonyNetworkAddress) {
    this.colonyNetworkContractDef = await this.loader.load({ contractName: "IColonyNetwork" }, { abi: true, address: false });
    this.repCycleContractDef = await this.loader.load({ contractName: "IReputationMiningCycle" }, { abi: true, address: false });
    this.tokenLockingContractDef = await this.loader.load({ contractName: "ITokenLocking" }, { abi: true, address: false });
    this.colonyContractDef = await this.loader.load({ contractName: "IColony" }, { abi: true, address: false });

    this.colonyNetwork = new ethers.Contract(colonyNetworkAddress, this.colonyNetworkContractDef.abi, this.realWallet);

    const tokenLockingAddress = await this.colonyNetwork.getTokenLocking();
    this.tokenLocking = new ethers.Contract(tokenLockingAddress, this.tokenLockingContractDef.abi, this.realWallet);
    const metaColonyAddress = await this.colonyNetwork.getMetaColony();
    const metaColony = new ethers.Contract(metaColonyAddress, this.colonyContractDef.abi, this.realWallet);
    this.clnyAddress = await metaColony.getToken();
    if (this.useJsTree) {
      this.reputationTree = new patriciaJs.PatriciaTree();
    } else {
      this.patriciaTreeContractDef = await this.loader.load({ contractName: "PatriciaTree" }, { abi: true, address: false, bytecode: true });

      const abstractContract = new ethers.Contract(null, this.patriciaTreeContractDef.abi, this.ganacheWallet);
      const contract = await abstractContract.deploy(this.patriciaTreeContractDef.bytecode);
      await contract.deployed();
      this.reputationTree = new ethers.Contract(contract.address, this.patriciaTreeContractDef.abi, this.ganacheWallet);
    }

    this.nReputations = ethers.utils.bigNumberify(0);
    this.reputations = {};
  }

  /**
   * When called, adds the entire contents of the current (active) log to its reputation tree. It also builds a Justification Tree as it does so
   * in case a dispute is called which would require it.
   * @return {Promise}
   */
  async addLogContentsToReputationTree(blockNumber = "latest") {
    if (this.useJsTree) {
      this.justificationTree = new patriciaJs.PatriciaTree();
    } else {
      const abstractContract = new ethers.Contract(null, this.patriciaTreeContractDef.abi, this.ganacheWallet);
      const contract = await abstractContract.deploy(this.patriciaTreeContractDef.bytecode);
      await contract.deployed();
      this.justificationTree = new ethers.Contract(contract.address, this.patriciaTreeContractDef.abi, this.ganacheWallet);
    }

    this.justificationHashes = {};
    const addr = await this.colonyNetwork.getReputationMiningCycle(true, { blockNumber });
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);

    // Do updates

    this.nReputationsBeforeLatestLog = ethers.utils.bigNumberify(this.nReputations.toString());
    // This is also the number of decays we have.

    // How many updates from the logs do we have?
    const nLogEntries = await repCycle.getReputationUpdateLogLength({ blockNumber });
    if (nLogEntries.toNumber() === 0) {
      return;
    }
    const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.sub(1), { blockNumber });
    const totalnUpdates = lastLogEntry[4].add(lastLogEntry[5]).add(this.nReputationsBeforeLatestLog);

    for (let i = ethers.utils.bigNumberify("0"); i.lt(totalnUpdates); i = i.add(1)) {
      await this.addSingleReputationUpdate(i, repCycle, blockNumber, a); // eslint-disable-line no-await-in-loop
    }
    const prevKey = await this.getKeyForUpdateNumber(totalnUpdates.sub(1), blockNumber);
    const justUpdatedProof = await this.getReputationProofObject(prevKey);
    const newestReputationProof = await this.getNewestReputationProofObject(totalnUpdates);
    const interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
    const jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    const nextUpdateProof = {};
    await this.justificationTree.insert(ReputationMiner.getHexString(totalnUpdates, 64), jhLeafValue, { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop

    this.justificationHashes[ReputationMiner.getHexString(totalnUpdates, 64)] = JSON.parse(
      JSON.stringify({
        interimHash,
        nNodes: this.nReputations.toString(),
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof,
        newestReputationProof
      })
    );
  }

  /**
   * Process the `j`th update and add to the current reputation state and the justificationtree.
   * @param  {BigNumber}  updateNumber     The number of the update that should be considered.
   * @return {Promise}
   */
  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, a) {
    let interimHash;
    let jhLeafValue;
    let justUpdatedProof;
    let score;
    interimHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
    jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    let logEntry;
    if (updateNumber.lt(this.nReputationsBeforeLatestLog)) {
      const key = await Object.keys(this.reputations)[updateNumber];
      const reputation = ethers.utils.bigNumberify(`0x${this.reputations[key].slice(2, 66)}`);
      let newReputation;
      // These are the numerator and the denominator of the fraction we wish to reduce the reputation by. It
      // is very slightly less than one.
      // Disabling prettier on the next line so we can have these two values aligned so it's easy to see
      // the fraction will be slightly less than one.
      const numerator   = ethers.utils.bigNumberify("999679150010888");  // eslint-disable-line prettier/prettier
      const denominator = ethers.utils.bigNumberify("1000000000000000");

      if (
        reputation.gt(
          ethers.utils
            .bigNumberify("2")
            .pow(256)
            .sub(1)
            .div(denominator)
        )
      ) {
        newReputation = reputation.div(denominator).mul(numerator);
      } else {
        newReputation = reputation.mul(numerator).div(denominator);
      }
      const reputationChange = newReputation.sub(reputation);
      score = this.getScore(updateNumber, reputationChange);
    } else {
      const logEntryUpdateNumber = updateNumber.sub(this.nReputationsBeforeLatestLog);
      const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(logEntryUpdateNumber, blockNumber);
      logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber, { blockNumber });
      let invalidUpdates = await this.colonyNetwork.getCorruptedReputationUpdateLogs(repCycle.address);
      invalidUpdates = invalidUpdates.map(i => i.toNumber());
      let reputationChange = logEntry[1];
      if (invalidUpdates.includes(logEntryUpdateNumber.toNumber())) {
        reputationChange = ethers.utils.bigNumberify("0");
      }
      score = this.getScore(updateNumber, reputationChange);
    }
    // TODO This 'if' statement is only in for now to make tests easier to write, should be removed in the future.
    if (updateNumber.eq(0)) {
      const nNodes = await this.colonyNetwork.getReputationRootHashNNodes({ blockNumber });
      const localRootHash = await this.reputationTree.getRootHash();
      const currentRootHash = await this.colonyNetwork.getReputationRootHash({ blockNumber });
      if (!nNodes.eq(this.nReputations) || localRootHash !== currentRootHash) {
        console.log("Warning: client being initialized in bad state. Was the previous rootHash submitted correctly?");
        interimHash = await this.colonyNetwork.getReputationRootHash(); // eslint-disable-line no-await-in-loop
        jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
      }
    } else {
      const prevKey = await this.getKeyForUpdateNumber(updateNumber.sub(1), blockNumber);
      justUpdatedProof = await this.getReputationProofObject(prevKey);
    }
    const newestReputationProof = await this.getNewestReputationProofObject(updateNumber);
    await this.justificationTree.insert(ReputationMiner.getHexString(updateNumber, 64), jhLeafValue, { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop

    const key = await this.getKeyForUpdateNumber(updateNumber, blockNumber);
    const nextUpdateProof = await this.getReputationProofObject(key);
    this.justificationHashes[ReputationMiner.getHexString(updateNumber, 64)] = JSON.parse(
      JSON.stringify({
        interimHash,
        nNodes: this.nReputations.toString(),
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof,
        newestReputationProof
      })
    );

    // TODO: Include updates for all child skills if x.amount is negative
    // We update colonywide sums first (children, parents, skill)
    // Then the user-specifc sums in the order children, parents, skill.

    await this.insert(key, score, updateNumber);
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
    return { branchMask: `${branchMask.toString(16)}`, siblings, key, value, nNodes: this.nReputations.toString() };
  }

  static async getKey(_colonyAddress, _skillId, _userAddress) {
    let colonyAddress = _colonyAddress;
    let userAddress = _userAddress;

    let base = 10;
    let skillId = _skillId.toString();
    if (skillId.slice(0, 2) === "0x") {
      // We've been passed a hex string
      skillId = skillId.slice(2);
      base = 16;
    }

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
    const key = `0x${new BN(colonyAddress, 16).toString(16, 40)}${new BN(skillId.toString(), base).toString(16, 64)}${new BN(
      userAddress,
      16
    ).toString(16, 40)}`;
    return key;
  }

  // /**
  //  * Convert number to 0x prefixed hex string, where the length discounts the 0x prefix.
  //  * @param  {BN or BigNumber or Number} bnLike
  //  * @param  {Number} length
  //  * @return {String} hexString
  //  * @dev Used to provide standard interface for BN and BigNumber
  //  */
  static getHexString(input, length) {
    return `0x${new BN(input.toString()).toString(16, length)}`;
  }

  /**
   * For update `_i` in the reputationUpdateLog currently under consideration, return the log entry that contains that update. Note that these
   * are not the same number because each entry in the log implies multiple reputation updates. Note that the update number passed here is just
   * the update number in the log, NOT including any decays that may have happened.
   * @param  {Number}  _i The update number we wish to determine which log entry in the reputationUpdateLog creates
   * @return {Promise}   A promise that resolves to the number of the corresponding log entry.
   */
  async getLogEntryNumberForLogUpdateNumber(_i, blockNumber) {
    const updateNumber = _i;
    const addr = await this.colonyNetwork.getReputationMiningCycle(true, { blockNumber });
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
    const nLogEntries = await repCycle.getReputationUpdateLogLength({ blockNumber });
    let lower = ethers.utils.bigNumberify("0");
    let upper = nLogEntries.sub(1);

    while (!upper.eq(lower)) {
      const testIdx = lower.add(upper.sub(lower).div(2));
      const testLogEntry = await repCycle.getReputationUpdateLogEntry(testIdx, { blockNumber }); // eslint-disable-line no-await-in-loop
      if (testLogEntry[5].gt(updateNumber)) {
        upper = testIdx.sub(1);
      } else if (testLogEntry[5].lte(updateNumber) && testLogEntry[5].add(testLogEntry[4]).gt(updateNumber)) {
        upper = testIdx;
        lower = testIdx;
      } else {
        lower = testIdx.add(1);
      }
    }

    return lower;
  }

  async getKeyForUpdateNumber(_i, blockNumber) {
    const updateNumber = ethers.utils.bigNumberify(_i);
    if (updateNumber.lt(this.nReputationsBeforeLatestLog)) {
      // Then it's a decay
      return Object.keys(this.reputations)[updateNumber.toNumber()];
    }
    // Else it's from a log entry
    const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(updateNumber.sub(this.nReputationsBeforeLatestLog), blockNumber);
    const addr = await this.colonyNetwork.getReputationMiningCycle(true, { blockNumber });
    const repCycle = new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);

    const logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber, { blockNumber });

    const key = await this.getKeyForUpdateInLogEntry(updateNumber.sub(logEntry[5]).sub(this.nReputationsBeforeLatestLog), logEntry);
    return key;
  }

  static breakKeyInToElements(key) {
    const colonyAddress = key.slice(2, 42);
    const skillId = key.slice(42, 106);
    const userAddress = key.slice(106);
    return [`0x${colonyAddress}`, `0x${skillId}`, `0x${userAddress}`];
  }

  /**
   * Gets the key appropriate for the nth reputation update that logEntry implies.
   * @param  {BigNumber} updateNumber The number of the update the log entry implies we want the information for. Must be less than logEntry[4].
   * @param  {LogEntry}  logEntry An array six long, containing the log entry in question [userAddress, amount, skillId, colony, nUpdates, nPreviousUpdates ]
   * @return {Promise}              Promise that resolves to key
   */
  async getKeyForUpdateInLogEntry(updateNumber, logEntry) {
    let skillAddress;
    // We need to work out the skillId and user address to use.
    // If we are in the first half of 'j's, then we are dealing with global update, so
    // the skilladdress will be 0x0, rather than the user address
    if (updateNumber.lt(logEntry[4].div(2))) {
      skillAddress = "0x0000000000000000000000000000000000000000";
    } else {
      skillAddress = logEntry[0]; // eslint-disable-line prefer-destructuring
      // Following the destructuring rule, this line would be [skillAddress] = logEntry, which I think is very misleading
    }
    const nUpdates = logEntry[4];
    const score = this.getScore(updateNumber.add(this.nReputationsBeforeLatestLog), logEntry[1]);

    const [nParents] = await this.colonyNetwork.getSkill(logEntry[2]);
    let skillId;
    // NB This is not necessarily the same as nChildren. However, this is the number of child updates
    // that this entry in the log was expecting at the time it was created.
    let nChildUpdates;
    // Accidentally commited with gt rather than gte, and everything still
    // worked; was worried this showed a gap in our tests, but the 'else'
    // branch evaluates to zero if score is 0 (because when nUpdates was
    // calculated on-chain, nChildUpdates was zero if score == 0.
    // Restored gte for clarity, but leaving this note for completeness.
    if (score.gte(0)) {
      nChildUpdates = ethers.utils.bigNumberify(0);
    } else {
      nChildUpdates = nUpdates
        .div(2)
        .sub(1)
        .sub(nParents);
    }
    // The list of skill ids to be updated is the same for the first half and the second half of the list of updates this
    // log entry implies, it's just the skillAddress that is different, which we've already established. So
    let skillIndex;
    if (updateNumber.gte(nUpdates.div(2))) {
      skillIndex = updateNumber.sub(nUpdates.div(2));
    } else {
      skillIndex = updateNumber;
    }

    if (skillIndex.lt(nChildUpdates)) {
      // Then the skill being updated is the skillIndex-th child skill
      skillId = await this.colonyNetwork.getChildSkillId(logEntry[2], skillIndex);
    } else if (skillIndex.lt(nChildUpdates.add(nParents))) {
      // Then the skill being updated is the skillIndex-nChildUpdates-th parent skill
      skillId = await this.colonyNetwork.getParentSkillId(logEntry[2], skillIndex.sub(nChildUpdates));
    } else {
      // Then the skill being update is the skill itself - not a parent or child
      skillId = logEntry[2]; // eslint-disable-line prefer-destructuring
    }
    const key = await ReputationMiner.getKey(logEntry[3], skillId, skillAddress);
    return key;
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
  getScore(i, score) {
    return score;
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
   * Get the active reputation mining cycle
   * @return {Promise}
   */
  async getActiveRepCycle() {
    const addr = await this.colonyNetwork.getReputationMiningCycle(true);
    return new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
  }

  /**
   * Submit what the client believes should be the next reputation state root hash to the `ReputationMiningCycle` contract
   * @param startIndex What index to start searching at when looking for a valid submission
   * @return {Promise}
   */
  async submitRootHash(startIndex = 1) {
    const hash = await this.getRootHash();
    const repCycle = await this.getActiveRepCycle();
    // Get how much we've staked, and thefore how many entries we have
    let entryIndex;
    const [, balance] = await this.tokenLocking.getUserLock(this.clnyAddress, this.minerAddress);
    const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    for (let i = ethers.utils.bigNumberify(startIndex); i.lte(balance.div(10 ** 15)); i = i.add(1)) {
      // Iterate over entries until we find one that passes
      const entryHash = await repCycle.getEntryHash(this.minerAddress, i, hash); // eslint-disable-line no-await-in-loop

      const constant = ethers.utils
        .bigNumberify(2)
        .pow(256)
        .sub(1)
        .div(3600);

      const block = await this.realProvider.getBlock("latest"); // eslint-disable-line no-await-in-loop
      const { timestamp } = block;

      const target = ethers.utils
        .bigNumberify(timestamp)
        .sub(reputationMiningWindowOpenTimestamp)
        .mul(constant);
      if (ethers.utils.bigNumberify(entryHash).lt(target)) {
        entryIndex = i;
        break;
      }
    }
    if (!entryIndex) {
      return new Error("No valid entry for submission found");
    }
    //
    // Submit that entry
    const gas = await repCycle.estimate.submitRootHash(hash, this.nReputations, entryIndex);

    return repCycle.submitRootHash(hash, this.nReputations, entryIndex, { gasLimit: `0x${gas.mul(2).toString()}` });
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
    const retBranchMask = ReputationMiner.getHexString(branchMask);
    return [retBranchMask, siblings];
  }

  /**
   * Get a Merkle proof and value for `key` in a past reputation state with root hash `rootHash`
   * @param  {[type]}  rootHash A previous root hash of a reputation state
   * @param  {[type]}  key      A key in that root hash we wish to know the value and proof for
   * @return {Promise}          A promise that resolves to [branchmask, siblings, value] for the supplied key in the supplied root hash
   */
  async getHistoricalProofAndValue(rootHash, key) {
    const tree = new patriciaJs.PatriciaTree();
    // Load all reputations from that state.

    const db = await sqlite.open(this.dbPath, { Promise });

    let res = await db.all(
      `SELECT reputations.skill_id, reputations.value, reputation_states.root_hash, colonies.address as colony_address, users.address as user_address
       FROM reputations
       INNER JOIN colonies ON colonies.rowid=reputations.colony_rowid
       INNER JOIN users ON users.rowid=reputations.user_rowid
       INNER JOIN reputation_states ON reputation_states.rowid=reputations.reputation_rowid
       WHERE reputation_states.root_hash="${rootHash}"`
    );
    if (res.length === 0) {
      return new Error("No such reputation state");
    }
    for (let i = 0; i < res.length; i += 1) {
      const row = res[i];
      const rowKey = await ReputationMiner.getKey(row.colony_address, row.skill_id, row.user_address); // eslint-disable-line no-await-in-loop
      await tree.insert(rowKey, row.value); // eslint-disable-line no-await-in-loop
    }

    const keyElements = ReputationMiner.breakKeyInToElements(key);
    const [colonyAddress, , userAddress] = keyElements;
    const skillId = parseInt(keyElements[1], 16);
    res = await db.all(
      `SELECT reputations.value
      FROM reputations
      INNER JOIN colonies ON colonies.rowid=reputations.colony_rowid
      INNER JOIN users ON users.rowid=reputations.user_rowid
      INNER JOIN reputation_states ON reputation_states.rowid=reputations.reputation_rowid
      WHERE reputation_states.root_hash="${rootHash}"
      AND users.address="${userAddress}"
      AND reputations.skill_id="${skillId}"
      AND colonies.address="${colonyAddress}"`
    );
    await db.close();

    if (res.length === 0) {
      return new Error("No such reputation");
    }

    if (res.length > 1) {
      return new Error("Multiple such reputations found. Something is wrong!");
    }

    const [branchMask, siblings] = await tree.getProof(key);
    const retBranchMask = ReputationMiner.getHexString(branchMask);
    return [retBranchMask, siblings, res[0].value];
  }

  /**
   * Submit the Justification Root Hash (JRH) for the hash that (presumably) we submitted this round
   * @return {Promise}
   */
  async submitJustificationRootHash() {
    const jrh = await this.justificationTree.getRootHash();
    const [branchMask1, siblings1] = await this.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
    const repCycle = await this.getActiveRepCycle();
    const nLogEntries = await repCycle.getReputationUpdateLogLength();
    const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.sub(1));
    const totalnUpdates = lastLogEntry[4].add(lastLogEntry[5]).add(this.nReputationsBeforeLatestLog);
    const [branchMask2, siblings2] = await this.justificationTree.getProof(ReputationMiner.getHexString(totalnUpdates, 64));
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const res = await repCycle.submitJustificationRootHash(round, index, jrh, branchMask1, siblings1, branchMask2, siblings2, { gasLimit: 6000000 });
    return res;
  }

  /**
   * Returns the round and index that our submission is currently at in the dispute cycle.
   * @return {Promise} Resolves to [round, index] which are `BigNumber`.
   */
  async getMySubmissionRoundAndIndex() {
    const submittedHash = await this.reputationTree.getRootHash();
    const repCycle = await this.getActiveRepCycle();

    let index = ethers.utils.bigNumberify(-1);
    let round = ethers.utils.bigNumberify(0);
    let submission = [];
    while (submission[0] !== submittedHash) {
      try {
        index = index.add(1);
        submission = await repCycle.getDisputeRounds(round, index); // eslint-disable-line no-await-in-loop
      } catch (err) {
        round = round.add(1);
        index = ethers.utils.bigNumberify(-1);
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
    const repCycle = await this.getActiveRepCycle();
    const submission = await repCycle.getDisputeRounds(round, index);
    const targetNode = submission[8].add(submission[9]).div(2);
    const targetNodeKey = ReputationMiner.getHexString(targetNode, 64);

    const intermediateReputationHash = this.justificationHashes[targetNodeKey].jhLeafValue;
    const [branchMask, siblings] = await this.justificationTree.getProof(targetNodeKey);
    const tx = await repCycle.respondToBinarySearchForChallenge(round, index, intermediateReputationHash, branchMask, siblings, {
      gasLimit: 1000000
    });
    return tx;
  }

  /**
   * Respond to a specific challenge over the effect of a specific log entry once the binary search has been completed to establish
   * the log entry where the two submitted hashes differ.
   * @return {Promise} Resolves to tx hash of the response
   */
  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const repCycle = await this.getActiveRepCycle();
    const submission = await repCycle.getDisputeRounds(round, index);
    // console.log(submission);
    const firstDisagreeIdx = submission[8];
    const lastAgreeIdx = firstDisagreeIdx.sub(1);
    // console.log('getReputationUPdateLogEntry', lastAgreeIdx);
    // const logEntry = await repCycle.getReputationUpdateLogEntry(lastAgreeIdx.toString());
    // console.log('getReputationUPdateLogEntry done');
    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    // console.log('get justification tree');
    const lastAgreeKey = ReputationMiner.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = ReputationMiner.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = ethers.utils.bigNumberify(0);
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.sub(this.nReputationsBeforeLatestLog));
    }
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
    const tx = await repCycle.respondToChallenge(
      [
        round,
        index,
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.branchMask,
        this.justificationHashes[lastAgreeKey].nextUpdateProof.nNodes,
        ReputationMiner.getHexString(agreeStateBranchMask),
        this.justificationHashes[firstDisagreeKey].justUpdatedProof.nNodes,
        ReputationMiner.getHexString(disagreeStateBranchMask),
        this.justificationHashes[lastAgreeKey].newestReputationProof.branchMask,
        "0",
        logEntryNumber,
        "0"
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
      { gasLimit: 4000000 }
    );
    return tx;
  }

  /**
   * Insert (or update) the reputation for a user in the local reputation tree
   * @param  {string}  key  The key of the reputation that is being updated
   * @param  {Number of BigNumber or String}  reputationScore The amount the reputation changes by
   * @param  {Number or BigNumber}  index           The index of the log entry being considered
   * @return {Promise}                 Resolves to `true` or `false` depending on whether the insertion was successful
   */
  async insert(key, _reputationScore, index) {
    // const keyAlreadyExists = await this.keyExists(key);
    // If we already have this key, then we lookup the unique identifier we assigned this key.
    // Otherwise, give it the new one.
    let value;
    let newValue;
    const keyAlreadyExists = this.reputations[key] !== undefined;
    if (keyAlreadyExists) {
      // Look up value from our JSON.
      value = this.reputations[key];
      // Extract uid
      const uid = ethers.utils.bigNumberify(`0x${value.slice(-64)}`);
      const existingValue = ethers.utils.bigNumberify(`0x${value.slice(2, 66)}`);
      newValue = existingValue.add(_reputationScore);
      if (newValue.lt(0)) {
        newValue = ethers.utils.bigNumberify(0);
      }
      const upperLimit = ethers.utils
        .bigNumberify(2)
        .pow(256)
        .sub(1);

      if (newValue.gt(upperLimit)) {
        newValue = upperLimit;
      }
      value = this.getValueAsBytes(newValue, uid, index);
    } else {
      newValue = _reputationScore;
      if (newValue.lt(0)) {
        newValue = ethers.utils.bigNumberify(0);
      }
      // A new value can never overflow, so we don't need a 'capping' check here
      value = this.getValueAsBytes(newValue, this.nReputations.add(1), index);
      this.nReputations = this.nReputations.add(1);
    }
    await this.reputationTree.insert(key, value, { gasLimit: 4000000 });
    // If successful, add to our JSON.
    this.reputations[key] = value;
    return true;
  }

  /**
   * Causes the reputation miner to replay mining logs that have occurred since the supplied block number
   * Note this function only does anything to the current state of the miner if the miner has no state or
   * it 'sees' that the state it has was the accepted state on-chain at some point since the supplied block
   * number.
   * @param  { Number }  blockNumber The block number to sync from.
   * @param  { Bool }    saveHistoricalStates Whether to save historical (valid) states while syncing
   * @return {Promise}               A promise that resolves once the state is up-to-date
   */
  async sync(blockNumber, saveHistoricalStates = false) {
    // Get the events
    const filter = this.colonyNetwork.filters.ReputationMiningCycleComplete(null, null);
    filter.fromBlock = blockNumber;
    const events = await this.realProvider.getLogs(filter);
    let localHash = await this.reputationTree.getRootHash();
    let applyLogs = false;

    // We're not going to apply the logs unless we're syncing from scratch (which is this if statement)
    // or we find a hash that we recognise as our current state, and we're going to sync from there (which
    // is the if statement at the end of the loop below
    if (localHash === `0x${new BN(0).toString(16, 64)}`) {
      applyLogs = true;
    }

    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const hash = event.data.slice(0, 66);
      if (applyLogs) {
        const nNodes = ethers.utils.bigNumberify(`0x${event.data.slice(66, 130)}`);
        const previousBlock = event.blockNumber - 1;
        await this.addLogContentsToReputationTree(previousBlock); // eslint-disable-line no-await-in-loop
        localHash = await this.reputationTree.getRootHash(); // eslint-disable-line no-await-in-loop
        const localNNodes = this.nReputations;
        if (localHash !== hash || !localNNodes.eq(nNodes)) {
          console.log("WARNING: Sync seems to have failed");
        }
        if (saveHistoricalStates) {
          await this.saveCurrentState(event.blockNumber); // eslint-disable-line no-await-in-loop
        }
      }
      if (applyLogs === false && localHash === hash) {
        applyLogs = true;
      }
    }
  }

  async saveCurrentState() {
    const db = await sqlite.open(this.dbPath, { Promise });

    const currentRootHash = await this.getRootHash();
    let res = await db.run(`INSERT OR IGNORE INTO reputation_states (root_hash, n_nodes) VALUES ('${currentRootHash}', ${this.nReputations})`);

    for (let i = 0; i < Object.keys(this.reputations).length; i += 1) {
      const key = Object.keys(this.reputations)[i];
      const value = this.reputations[key];
      const keyElements = ReputationMiner.breakKeyInToElements(key); // eslint-disable-line no-await-in-loop
      const [colonyAddress, , userAddress] = keyElements;
      const skillId = parseInt(keyElements[1], 16);

      res = await db.run(`INSERT OR IGNORE INTO colonies (address) VALUES ('${colonyAddress}')`); // eslint-disable-line no-await-in-loop
      res = await db.run(`INSERT OR IGNORE INTO users (address) VALUES ('${userAddress}')`); // eslint-disable-line no-await-in-loop
      res = await db.run(`INSERT OR IGNORE INTO skills (skill_id) VALUES ('${skillId}')`); // eslint-disable-line no-await-in-loop

      // eslint-disable-next-line no-await-in-loop
      let query;
      query = `SELECT COUNT ( * ) AS "n"
        FROM reputations
        INNER JOIN colonies ON colonies.rowid=reputations.colony_rowid
        INNER JOIN users ON users.rowid=reputations.user_rowid
        INNER JOIN reputation_states ON reputation_states.rowid=reputations.reputation_rowid
        WHERE reputation_states.root_hash="${currentRootHash}"
        AND colonies.address="${colonyAddress}"
        AND reputations.skill_id="${skillId}"
        AND users.address="${userAddress}"`;
      res = await db.get(query); // eslint-disable-line no-await-in-loop

      if (res.n === 0) {
        query = `INSERT INTO reputations (reputation_rowid, colony_rowid, skill_id, user_rowid, value)
          SELECT
          (SELECT reputation_states.rowid FROM reputation_states WHERE reputation_states.root_hash='${currentRootHash}'),
          (SELECT colonies.rowid FROM colonies WHERE colonies.address='${colonyAddress}'),
          ${skillId},
          (SELECT users.rowid FROM users WHERE users.address='${userAddress}'),
          '${value}'`;
        await db.run(query); // eslint-disable-line no-await-in-loop
      }
    }
    await db.close();
  }

  async loadState(reputationRootHash) {
    const db = await sqlite.open(this.dbPath, { Promise });
    this.nReputations = ethers.utils.bigNumberify(0);
    this.reputations = {};

    const res = await db.all(
      `SELECT reputations.skill_id, reputations.value, reputation_states.root_hash, colonies.address as colony_address, users.address as user_address
       FROM reputations
       INNER JOIN colonies ON colonies.rowid=reputations.colony_rowid
       INNER JOIN users ON users.rowid=reputations.user_rowid
       INNER JOIN reputation_states ON reputation_states.rowid=reputations.reputation_rowid
       WHERE reputation_states.root_hash="${reputationRootHash}"`
    );
    this.nReputations = ethers.utils.bigNumberify(res.length);
    for (let i = 0; i < res.length; i += 1) {
      const row = res[i];
      const key = await ReputationMiner.getKey(row.colony_address, row.skill_id, row.user_address); // eslint-disable-line no-await-in-loop
      await this.reputationTree.insert(key, row.value, { gasLimit: 4000000 }); // eslint-disable-line no-await-in-loop
      this.reputations[key] = row.value;
    }
    const currentStateHash = await this.reputationTree.getRootHash();
    if (currentStateHash !== reputationRootHash) {
      console.log("WARNING: The supplied state failed to be recreated successfully. Are you sure it was saved?");
    }
    await db.close();
  }

  async createDB() {
    const db = await sqlite.open(this.dbPath, { Promise });
    await db.run("CREATE TABLE IF NOT EXISTS users ( address text NOT NULL UNIQUE )");
    await db.run("CREATE TABLE IF NOT EXISTS reputation_states ( root_hash text NOT NULL UNIQUE, n_nodes INTEGER NOT NULL)");
    await db.run("CREATE TABLE IF NOT EXISTS colonies ( address text NOT NULL UNIQUE )");
    await db.run("CREATE TABLE IF NOT EXISTS skills ( skill_id INTEGER PRIMARY KEY )");
    await db.run(
      `CREATE TABLE IF NOT EXISTS reputations (
        reputation_rowid text NOT NULL,
        colony_rowid INTEGER NOT NULL,
        skill_id INTEGER NOT NULL,
        user_rowid INTEGER NOT NULL,
        value text NOT NULL
      )`
    );
    await db.close();
  }

  async resetDB() {
    const db = await sqlite.open(this.dbPath, { Promise });
    await db.run(`DROP TABLE IF EXISTS users`);
    await db.run(`DROP TABLE IF EXISTS colonies`);
    await db.run(`DROP TABLE IF EXISTS skills`);
    await db.run(`DROP TABLE IF EXISTS reputations`);
    await db.run(`DROP TABLE IF EXISTS reputation_states`);
    await db.close();
    await this.createDB();
  }
}

module.exports = ReputationMiner;
