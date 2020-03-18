
import { BN } from "bn.js";
import { soliditySha3, isAddress } from "web3-utils";
import { ethers } from "ethers";

import PatriciaTreeNoHash from "./patriciaNoHashKey";
import PatriciaTree from "./patricia";

const sqlite = require("sqlite");

// We don't need the account address right now for this secret key, but I'm leaving it in in case we
// do in the future.
// const accountAddress = "0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4";
const secretKey = "0xe5c050bb6bfdd9c29397b8fe6ed59ad2f7df83d6fd213b473f84b489205d9fc7";
const miningCycleDuration = ethers.utils.bigNumberify(60).mul(60).mul(24); // 24 hours
const minStake = ethers.utils.bigNumberify(10).pow(18).mul(2000);
const constant = ethers.utils.bigNumberify(2).pow(256).sub(1).div(miningCycleDuration);

class ReputationMiner {
  /**
   * Constructor for ReputationMiner
   * @param {string} minerAddress            The address that is staking CLNY that will allow the miner to submit reputation hashes
   * @param {Number} [realProviderPort=8545] The port that the RPC node with the ability to sign transactions from `minerAddress` is responding on. The address is assumed to be `localhost`.
   */
  constructor({ loader, minerAddress, privateKey, provider, realProviderPort = 8545, useJsTree = false, dbPath = "./reputationStates.sqlite" }) {
    this.loader = loader;
    this.dbPath = dbPath;

    this.useJsTree = useJsTree;
    if (!this.useJsTree) {
      // If this require is global, line numbers are broken in all our tests. If we move it here, it's only an issue if we're not
      // using the JS tree. There is an issue open at ganache-core about this, and this require will have to remain here until it's fixed.
      // https://github.com/trufflesuite/ganache-core/issues/287
      const ganache = require("ganache-core"); // eslint-disable-line global-require
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

    // This will have to support provider.getSigner https://docs.ethers.io/ethers.js/html/api-providers.html#jsonrpcprovider
    if (provider) {
      this.realProvider = provider;
    } else {
      this.realProvider = new ethers.providers.JsonRpcProvider(`http://localhost:${realProviderPort}`);
    }

    if (minerAddress) {
      this.minerAddress = minerAddress;
      this.realWallet = this.realProvider.getSigner(minerAddress);
    } else {
      this.realWallet = new ethers.Wallet(privateKey, this.realProvider);
      this.minerAddress = this.realWallet.address;
      // TODO: Check that this wallet can stake?
      this.minerAddress = this.realWallet.address;
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
      this.reputationTree = new PatriciaTree();
    } else {
      this.patriciaTreeContractDef = await this.loader.load({ contractName: "PatriciaTree" }, { abi: true, address: false, bytecode: true });
      this.patriciaTreeNoHashContractDef = await this.loader.load(
        { contractName: "PatriciaTreeNoHash" },
        { abi: true, address: false, bytecode: true }
      );

      const contractFactory = new ethers.ContractFactory(this.patriciaTreeContractDef.abi, this.patriciaTreeContractDef.bytecode, this.ganacheWallet);
      const contract = await contractFactory.deploy();
      await contract.deployed();
      this.reputationTree = new ethers.Contract(contract.address, this.patriciaTreeContractDef.abi, this.ganacheWallet);
    }

    this.nReputations = ethers.constants.Zero;
    this.reputations = {};
    this.gasPrice = ethers.utils.hexlify(20000000000);

    // Are we using ganache? If so, note this so we add safety margin to gas estimates because ganache sucks at that
    // See if we're talking to Ganache to fix a ganache crash (which, while fun to say, is not fun to see)
    const clientString = await this.realProvider.send("web3_clientVersion");
    this.ganacheClient = clientString.indexOf('TestRPC') !== -1;
  }

  /**
   * When called, adds the entire contents of the current (active) log to its reputation tree. It also builds a Justification Tree as it does so
   * in case a dispute is called which would require it.
   * @return {Promise}
   */
  async addLogContentsToReputationTree(blockNumber = "latest") {
    if (this.useJsTree) {
      this.justificationTree = new PatriciaTreeNoHash();
    } else {
      const contractFactory = new ethers.ContractFactory(
        this.patriciaTreeNoHashContractDef.abi,
        this.patriciaTreeNoHashContractDef.bytecode,
        this.ganacheWallet
      );

      const contract = await contractFactory.deploy();
      await contract.deployed();

      this.justificationTree = new ethers.Contract(contract.address, this.patriciaTreeNoHashContractDef.abi, this.ganacheWallet);
    }
    this.justificationHashes = {};
    this.reverseReputationHashLookup = {};
    const repCycle = await this.getActiveRepCycle(blockNumber)

    // Do updates
    this.nReputationsBeforeLatestLog = ethers.utils.bigNumberify(this.nReputations.toString());
    // This is also the number of decays we have.

    // How many updates from the logs do we have?
    const nLogEntries = await repCycle.getReputationUpdateLogLength({ blockTag: blockNumber });
    if (nLogEntries.toString() === "0") {
      console.log("WARNING: No log entries found. If this is not one of the very first two cycles, something is wrong");
      return;
    }

    const nLogEntriesString = nLogEntries.sub(1).toString();
    const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntriesString, { blockTag: blockNumber });

    const totalnUpdates = ethers.utils
      .bigNumberify(lastLogEntry.nUpdates)
      .add(lastLogEntry.nPreviousUpdates)
      .add(this.nReputationsBeforeLatestLog);
    const nReplacementLogEntries = await this.colonyNetwork.getReplacementReputationUpdateLogsExist(repCycle.address);
    const replacementLogEntriesExist = nReplacementLogEntries > 0;
    for (let i = ethers.constants.Zero; i.lt(totalnUpdates); i = i.add(1)) {
      await this.addSingleReputationUpdate(i, repCycle, blockNumber, replacementLogEntriesExist);
    }
    const prevKey = await this.getKeyForUpdateNumber(totalnUpdates.sub(1), blockNumber);
    const justUpdatedProof = await this.getReputationProofObject(prevKey);
    const interimHash = await this.reputationTree.getRootHash();
    const jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    const nextUpdateProof = {};
    const tx = await this.justificationTree.insert(ReputationMiner.getHexString(totalnUpdates, 64), jhLeafValue, { gasLimit: 4000000 });
    if (!this.useJsTree) {
      await tx.wait();
    }

    this.justificationHashes[ReputationMiner.getHexString(totalnUpdates, 64)] = JSON.parse(
      JSON.stringify({
        interimHash,
        nNodes: this.nReputations.toString(),
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof
      })
    );
  }

  /**
   * Get the key already in the tree that has the highest number of bits at the start the same as the supplied
   * @param  {string}  key The key we wish to find the adjacentKey for
   * @return {String}
   */
  getAdjacentKey(key) {
    const sortedHashes = Object.keys(this.reverseReputationHashLookup).sort();
    let keyPosition = sortedHashes.indexOf(soliditySha3(key));
    if (keyPosition === -1) {
      sortedHashes.push(soliditySha3(key))
      sortedHashes.sort()
      keyPosition = sortedHashes.indexOf(soliditySha3(key));
    }

    let adjacentKeyPosition;
    if (keyPosition === 0){
      adjacentKeyPosition = keyPosition + 1;
    } else if (keyPosition === sortedHashes.length - 1){
      adjacentKeyPosition = keyPosition - 1;
    } else {
      const possibleAdjacentKeyHash1 = new BN(sortedHashes[keyPosition - 1].slice(2), 16);
      const possibleAdjacentKeyHash2 = new BN(sortedHashes[keyPosition + 1].slice(2), 16);
      // Which is most similar, bitwise?
      // Pick the key that has the most similarity to the reputation being questioned.
      const keyHash = new BN(soliditySha3(key).slice(2), 16);
      if (possibleAdjacentKeyHash1.xor(keyHash).lt(possibleAdjacentKeyHash2.xor(keyHash))) {
        // Note that these xor'd numbers can never be equal
        adjacentKeyPosition = keyPosition - 1;
      } else {
        adjacentKeyPosition = keyPosition + 1;
      }
    }

    return this.reverseReputationHashLookup[sortedHashes[adjacentKeyPosition]];
  }

  /**
   * Process a single update and add to the current reputation state and the justificationtree.
   * @param  {BigNumber}  updateNumber     The number of the update that should be considered.
   * @param  {Contract}   repCycle         The contract object representing reputation mining cycle contract we're processing the logs of
   * @param  {String or Number} blockNumber The block number to query the repCycle contract. If it has self destructed, and we are
   *                                       are syncing from scratch, if we queried at "latest", we wouldn't find the logs
   * @param  {bool}       checkForReplacement A boolean that controls whether we query getReplacementReputationUpdateLogEntry for the log entry.
   * @return {Promise}
   */
  async addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement) {
    let interimHash;
    let jhLeafValue;
    let justUpdatedProof;
    let originReputationProof;
    let originAdjacentReputationProof = await this.getReputationProofObject("0x00");;
    let childAdjacentReputationProof = await this.getReputationProofObject("0x00");;
    let childReputationProof = await this.getReputationProofObject("0x00");
    let adjacentReputationProof = await this.getReputationProofObject("0x00");
    let logEntry;
    let amount;

    interimHash = await this.reputationTree.getRootHash();
    jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
    originReputationProof = await this.getReputationProofObject(
      "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    );

    if (updateNumber.lt(this.nReputationsBeforeLatestLog)) {
      const key = await Object.keys(this.reputations)[updateNumber];
      const reputation = ethers.utils.bigNumberify(`0x${this.reputations[key].slice(2, 66)}`);
      // These are the numerator and the denominator of the fraction we wish to reduce the reputation by. It
      // is very slightly less than one (0.5 ** (1/2160) for a 1-hr mining cycle, 0.5 ** (1/90) for a 24-hr cycle).
      // Disabling prettier on the next line so we can have these two values aligned so it's easy to see
      // the fraction will be slightly less than one.
      const numerator = ethers.utils.bigNumberify("992327946262944");
      const denominator = ethers.utils.bigNumberify("1000000000000000");

      const newReputation = reputation.mul(numerator).div(denominator);
      const reputationChange = newReputation.sub(reputation);
      amount = this.getAmount(updateNumber, reputationChange);
    } else {
      const logEntryUpdateNumber = updateNumber.sub(this.nReputationsBeforeLatestLog);
      const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(logEntryUpdateNumber, blockNumber);
      logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber, { blockTag: blockNumber });
      if (checkForReplacement) {
        const potentialReplacementLogEntry = await this.colonyNetwork.getReplacementReputationUpdateLogEntry(repCycle.address, logEntryNumber);
        if (potentialReplacementLogEntry.colonyAddress !== ethers.constants.AddressZero) {
          logEntry = potentialReplacementLogEntry;
        }
      }
      const reputationChange = ethers.utils.bigNumberify(logEntry.amount);
      amount = this.getAmount(updateNumber, reputationChange);

      // When reputation amount update is negative, adjust its value for child reputation updates and parent updates
      // We update colonywide sums first (children, parents, skill)
      // Then the user-specifc sums in the order children, parents, skill.
      if (amount.lt(0)) {
        const nUpdates = ethers.utils.bigNumberify(logEntry.nUpdates);
        const [nParents] = await this.colonyNetwork.getSkill(logEntry.skillId);
        const nChildUpdates = nUpdates.div(2).sub(1).sub(nParents);
        const relativeUpdateNumber = updateNumber.sub(logEntry.nPreviousUpdates).sub(this.nReputationsBeforeLatestLog);
        // Child updates are two sets: colonywide sums for children - located in the first nChildUpdates,
        // and user-specific updates located in the first nChildUpdates of the second half of the nUpdates set.

        // Get current reputation amount of the origin skill, which is positioned at the end of the current logEntry nUpdates.
        const originSkillUpdateNumber = updateNumber.sub(relativeUpdateNumber).add(nUpdates).sub(1);
        const originSkillKey = await this.getKeyForUpdateNumber(originSkillUpdateNumber);
        originReputationProof = await this.getReputationProofObject(originSkillKey);
        const originSkillKeyExists = this.reputations[originSkillKey] !== undefined;

        let originReputation;
        if (originSkillKeyExists) {
          // Look up value from our JSON.
          const originReputationValueBytes = this.reputations[originSkillKey];
          originReputation = ethers.utils.bigNumberify(`0x${originReputationValueBytes.slice(2, 66)}`);
        } else {
          originReputation = ethers.constants.Zero;
          // Get the proof for the reputation that exists in the tree that would be the adjacent reputation.
          // We use this to prove that the origin reputation doesn't exist
          const originAdjacentKey = await this.getAdjacentKey(originSkillKey);
          originAdjacentReputationProof = await this.getReputationProofObject(originAdjacentKey);
        }

        if (
          relativeUpdateNumber.lt(nChildUpdates) ||
          (relativeUpdateNumber.gte(nUpdates.div(2)) && relativeUpdateNumber.lt(nUpdates.div(2).add(nChildUpdates)))
        ) {
          // Get the user-specific child reputation key.
          let keyUsedInCalculations;
          if (relativeUpdateNumber.lt(nChildUpdates)) {
            const childSkillUpdateNumber = updateNumber.add(nUpdates.div(2));
            keyUsedInCalculations = await this.getKeyForUpdateNumber(childSkillUpdateNumber);
          } else {
            keyUsedInCalculations = await this.getKeyForUpdateNumber(updateNumber);
          }
          childReputationProof = await this.getReputationProofObject(keyUsedInCalculations);

          if (originReputation.eq(0)) {
            amount = ethers.constants.Zero;
          } else {
            let reputation = ethers.constants.Zero;
            const keyExists = this.reputations[keyUsedInCalculations] !== undefined;
            if (keyExists) {
              reputation = ethers.utils.bigNumberify(`0x${this.reputations[keyUsedInCalculations].slice(2, 66)}`);
            } else {
              const childAdjacentKey = await this.getAdjacentKey(keyUsedInCalculations);
              childAdjacentReputationProof = await this.getReputationProofObject(childAdjacentKey);
            }

            amount = amount.mul(reputation).div(originReputation);

            // We can't lose more reputation than we have in this reputation
            if (reputation.lt(amount.mul(-1))) {
              amount = reputation.mul(-1);
            }
          }
        } else if (originReputation.lt(amount.mul(-1))) {
          // If the 'if' above didn't match, it's either an origin or a parent skill update.
          // We can't lose more reputation in an origin or parent skill than we have in the origin skill.
          // Cap change based on origin skill if needed.
          amount = originReputation.mul(-1);
        }
      }
    }

    // TODO This 'if' statement is only in for now to make tests easier to write, should be removed in the future.
    if (updateNumber.eq(0)) {
      const nNodes = await this.colonyNetwork.getReputationRootHashNNodes({ blockTag: blockNumber });
      const localRootHash = await this.reputationTree.getRootHash();
      const currentRootHash = await this.colonyNetwork.getReputationRootHash({ blockTag: blockNumber });
      if (!nNodes.eq(this.nReputations) || localRootHash !== currentRootHash) {
        console.log("Warning: client being initialized in bad state. Was the previous rootHash submitted correctly?");
        interimHash = await this.colonyNetwork.getReputationRootHash();
        jhLeafValue = this.getJRHEntryValueAsBytes(interimHash, this.nReputations);
      }
    } else {
      const prevKey = await this.getKeyForUpdateNumber(updateNumber.sub(1), blockNumber);
      justUpdatedProof = await this.getReputationProofObject(prevKey);
    }
    const tx = await this.justificationTree.insert(ReputationMiner.getHexString(updateNumber, 64), jhLeafValue, { gasLimit: 4000000 });
    if (!this.useJsTree) {
      await tx.wait();
    }

    const key = await this.getKeyForUpdateNumber(updateNumber, blockNumber);
    const nextUpdateProof = await this.getReputationProofObject(key);

    // Work out what is the closest reputation to this one.
    // This is only ever necessary if the reputation about to be added is new, so check for that.
    this.reverseReputationHashLookup[soliditySha3(key)] = key;
    if (!this.reputations[key]) {
      const adjacentKey = await this.getAdjacentKey(key);
      adjacentReputationProof = await this.getReputationProofObject(adjacentKey);
    }

    this.justificationHashes[ReputationMiner.getHexString(updateNumber, 64)] = JSON.parse(
      JSON.stringify({
        interimHash,
        nNodes: this.nReputations.toString(),
        jhLeafValue,
        justUpdatedProof,
        nextUpdateProof,
        originReputationProof,
        childReputationProof,
        adjacentReputationProof,
        originAdjacentReputationProof,
        childAdjacentReputationProof
      })
    );
    // console.log("updateNumber", updateNumber.toString());
    // console.log("key", key);
    // console.log("amount", amount.toString());
    await this.insert(key, amount, updateNumber);
  }

  /**
   * Get an object containing the key, value, and branchMask and siblings of the merkle proof of the provided key in the current reputation state. If the key
   * does not exist in the current state, returns valid 0-based values for each element (e.g. `0x0` for the branchMask);
   * @return {Promise}    The returned promise will resolve to `[key, value, branchMask, siblings]`
   */
  async getReputationProofObject(_key) {
    let branchMask;
    let siblings;
    let value;
    let key = _key;
    if (this.reputations[key]) {
      [branchMask, siblings] = await this.getProof(key);
      value = this.reputations[key];
    } else {
      // Doesn't exist yet.
      branchMask = 0x00;
      siblings = [];
      value = this.getValueAsBytes(0, 0);
      if (!key) {
        key = ReputationMiner.getHexString(0, 32);
      }
    }
    const reputation = `0x${value.slice(2,66)}`;
    const uid = `0x${value.slice(-64)}`;
    return { branchMask: `${branchMask.toString(16)}`, siblings, key, value, reputation, uid, nNodes: this.nReputations.toString() };
  }

  static getKey(_colonyAddress, _skillId, _userAddress) {
    let colonyAddress = _colonyAddress;
    let userAddress = _userAddress;

    let base = 10;
    let skillId = _skillId.toString();
    if (skillId.slice(0, 2) === "0x") {
      // We've been passed a hex string
      skillId = skillId.slice(2);
      base = 16;
    }

    let validAddress = isAddress(colonyAddress);
    // TODO should we return errors here?
    if (!validAddress) {
      return false;
    }
    validAddress = isAddress(userAddress);
    if (!validAddress) {
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
  async getLogEntryNumberForLogUpdateNumber(_i, blockNumber = "latest") {
    const updateNumber = _i;
    const repCycle = await this.getActiveRepCycle(blockNumber);
    const nLogEntries = await repCycle.getReputationUpdateLogLength({ blockTag: blockNumber });
    let lower = ethers.constants.Zero;
    let upper = nLogEntries.sub(1);

    while (!upper.eq(lower)) {
      const testIdx = lower.add(upper.sub(lower).div(2));
      const testLogEntry = await repCycle.getReputationUpdateLogEntry(testIdx, { blockTag: blockNumber });

      const nPreviousUpdates = ethers.utils.bigNumberify(testLogEntry.nPreviousUpdates);
      if (nPreviousUpdates.gt(updateNumber)) {
        upper = testIdx.sub(1);
      } else if (nPreviousUpdates.lte(updateNumber) && nPreviousUpdates.add(testLogEntry.nUpdates).gt(updateNumber)) {
        upper = testIdx;
        lower = testIdx;
      } else {
        lower = testIdx.add(1);
      }
    }

    return lower;
  }

  async getKeyForUpdateNumber(_i, blockNumber = "latest") {
    const updateNumber = ethers.utils.bigNumberify(_i);
    if (updateNumber.lt(this.nReputationsBeforeLatestLog)) {
      // Then it's a decay
      return Object.keys(this.reputations)[updateNumber.toNumber()];
    }
    // Else it's from a log entry
    const logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(updateNumber.sub(this.nReputationsBeforeLatestLog), blockNumber);
    const repCycle = await this.getActiveRepCycle(blockNumber);

    const logEntry = await repCycle.getReputationUpdateLogEntry(logEntryNumber, { blockTag: blockNumber });
    const key = await this.getKeyForUpdateInLogEntry(updateNumber.sub(logEntry.nPreviousUpdates).sub(this.nReputationsBeforeLatestLog), logEntry);
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
   * @param  {BigNumber} updateNumber The number of the update the log entry implies we want the information for. Must be less than logEntry.nUpdates.
   * @param  {LogEntry}  logEntry An array six long, containing the log entry in question [userAddress, amount, skillId, colony, nUpdates, nPreviousUpdates ]
   * @return {Promise}              Promise that resolves to key
   */
  async getKeyForUpdateInLogEntry(updateNumber, logEntry) {
    let skillAddress;
    // We need to work out the skillId and user address to use.
    // If we are in the first half of 'updateNumber's, then we are dealing with global update, so
    // the skilladdress will be 0x0, rather than the user address
    if (updateNumber.lt(ethers.utils.bigNumberify(logEntry.nUpdates).div(2))) {
      skillAddress = ethers.constants.AddressZero;
    } else {
      skillAddress = logEntry.user; // eslint-disable-line prefer-destructuring
      // Following the destructuring rule, this line would be [skillAddress] = logEntry, which I think is very misleading
    }
    const nUpdates = ethers.utils.bigNumberify(logEntry.nUpdates);
    const amount = this.getAmount(updateNumber.add(this.nReputationsBeforeLatestLog), ethers.utils.bigNumberify(logEntry.amount));

    const [nParents] = await this.colonyNetwork.getSkill(logEntry.skillId);
    let skillId;
    // NB This is not necessarily the same as nChildren. However, this is the number of child updates
    // that this entry in the log was expecting at the time it was created.
    let nChildUpdates;
    // Accidentally commited with gt rather than gte, and everything still
    // worked; was worried this showed a gap in our tests, but the 'else'
    // branch evaluates to zero if amount is 0 (because when nUpdates was
    // calculated on-chain, nChildUpdates was zero if amount == 0.
    // Restored gte for clarity, but leaving this note for completeness.
    if (amount.gte(0)) {
      nChildUpdates = ethers.constants.Zero;
    } else {
      nChildUpdates = nUpdates.div(2).sub(1).sub(nParents);
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
      skillId = await this.colonyNetwork.getChildSkillId(logEntry.skillId, skillIndex);
    } else if (skillIndex.lt(nChildUpdates.add(nParents))) {
      // Then the skill being updated is the skillIndex-nChildUpdates-th parent skill
      skillId = await this.colonyNetwork.getParentSkillId(logEntry.skillId, skillIndex.sub(nChildUpdates));
    } else {
      // Then the skill being update is the skill itself - not a parent or child
      skillId = logEntry.skillId; // eslint-disable-line prefer-destructuring
    }
    const key = ReputationMiner.getKey(logEntry.colony, skillId, skillAddress);
    return key;
  }

  /**
   * Formats `_reputationState` and `nNodes` in to the format used for the Justification Tree
   * @param  {bigNumber or string} _reputationState The reputation state root hashes
   * @param  {bigNumber or string} nNodes           The number of nodes in the reputation state Tree
   * @return {string}                               The correctly formatted hex string for inclusion in the justification tree
   */
  getJRHEntryValueAsBytes(_reputationState, nNodes) { // eslint-disable-line class-methods-use-this
    let reputationState = _reputationState.toString(16);
    if (reputationState.substring(0, 2) === "0x") {
      reputationState = reputationState.slice(2);
    }
    return `0x${new BN(reputationState.toString(), 16).toString(16, 64)}${new BN(nNodes.toString()).toString(16, 64)}`;
  }

  /**
   * Formats `reputation` and `uid` in to the format used for the Reputation Tree
   * @param  {bigNumber or string} reputation The reputation amount
   * @param  {bigNumber or string} uid        The global UID assigned to this reputation
   * @return {string}            Appropriately formatted hex string
   */
  getValueAsBytes(reputation, uid) { // eslint-disable-line class-methods-use-this
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
  getAmount(i, amount) {
    return amount;
  }

  /**
   * Get the active reputation mining cycle
   * @return {Promise}
   */
  async getActiveRepCycle(blockNumber = "latest") {
    const addr = await this.colonyNetwork.getReputationMiningCycle(true, { blockTag: blockNumber });

    if (addr === ethers.constants.AddressZero) {
      throw new Error(`No active mining cycle found for block number ${blockNumber}`);
    }

    return new ethers.Contract(addr, this.repCycleContractDef.abi, this.realWallet);
  }

  /**
   * Submit what the client believes should be the next reputation state root hash to the `ReputationMiningCycle` contract
   * @param startIndex What index to start searching at when looking for a valid submission
   * @return {Promise}
   */
  async submitRootHash(entryIndex) {
    const hash = await this.getRootHash();
    const nNodes = await this.getRootHashNNodes();
    const jrh = await this.justificationTree.getRootHash();
    const repCycle = await this.getActiveRepCycle();

    if (!entryIndex) {
      entryIndex = await this.getEntryIndex(); // eslint-disable-line no-param-reassign
    }
    let gasEstimate = ethers.utils.bigNumberify(1000000);
    try {
      gasEstimate = await repCycle.estimate.submitRootHash(hash, nNodes, jrh, entryIndex);
    } catch (err) { // eslint-disable-line no-empty

    }
    gasEstimate = this.padGasEstimateIfNecessary(gasEstimate);

    // Submit that entry
    return repCycle.submitRootHash(hash, nNodes, jrh, entryIndex, { gasLimit: gasEstimate, gasPrice: this.gasPrice });
  }

  async getEntryIndex(startIndex = 1) {
    // Get how much we've staked, and thefore how many entries we have
    const [, balance] = await this.tokenLocking.getUserLock(this.clnyAddress, this.minerAddress);

    for (let i = ethers.utils.bigNumberify(startIndex); i.lte(balance.div(minStake)); i = i.add(1)) {
      const submissionPossible = await this.submissionPossible(i);
      if (submissionPossible) {
        return i;
      }
    }

    throw new Error("No valid entry for submission found.");
  }

  /**
   * Check whether a hash submission is possible at the given entryIndex
   * The logic is equivalent to submissionPossible, entryQualifies and withinTarget modifiers in ReputationMiningCycle
   * @return {Promise} Resolves to a boolean result
   */
  async submissionPossible(entryIndex) {
    if (entryIndex.eq(0)) {
      throw new Error();
    }

    const repCycle = await this.getActiveRepCycle();
    const reputationMiningWindowOpenTimestamp = await repCycle.getReputationMiningWindowOpenTimestamp();
    const block = await this.realProvider.getBlock("latest");

    // Check the window has not closed or it has closed but no-one has submitted and so the current cycle is open to submissions
    const nUniqueSubmittedHashes = await repCycle.getNUniqueSubmittedHashes();
    const elapsedTime = ethers.utils.bigNumberify(block.timestamp).sub(reputationMiningWindowOpenTimestamp);

    if (elapsedTime.gte(miningCycleDuration) && !nUniqueSubmittedHashes.eq(0)) {
      return false;
    }

    // Check the proposed entry is eligible (emulates entryQualifies modifier behaviour)
    const lock = await this.tokenLocking.getUserLock(this.clnyAddress, this.minerAddress);
    if (ethers.utils.bigNumberify(entryIndex).gt(lock.balance.div(minStake))) {
      return false;
    }

    if(reputationMiningWindowOpenTimestamp.lt(lock.timestamp)) {
      return false;
    }

    const hash = await this.getRootHash();
    const entryIndexAlreadySubmitted = await repCycle.minerSubmittedEntryIndex(this.minerAddress, entryIndex);
    if (entryIndexAlreadySubmitted) {
      return false;
    }

    // Check the proposed entry is within the current allowable submission window (emulates withinTarget modifier behaviour)
    if (elapsedTime.lt(miningCycleDuration)) {
      const target = ethers.utils.bigNumberify(block.timestamp).sub(reputationMiningWindowOpenTimestamp).mul(constant);
      const entryHash = await repCycle.getEntryHash(this.minerAddress, entryIndex, hash);

      if (ethers.utils.bigNumberify(entryHash).lt(target)) {
        return true;
      }
      return false
    }

    return true;
  }

  /**
   * Get the mining cycle duration.
   * @return {integer}      Mining cycle duration
   */
  getMiningCycleDuration() {  // eslint-disable-line class-methods-use-this
    return miningCycleDuration;
  }

  /**
   * Get what the client believes should be the next reputation state root hash.
   * @return {Promise}      Resolves to the root hash
   */
  async getRootHash() {
    return this.reputationTree.getRootHash();
  }

  /**
   * Get what the client believes should be the next reputation state nNodes.
   * @return {Promise}      Resolves to the nNodes as ethers BigNumber
   */
  async getRootHashNNodes() {
    return this.nReputations;
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
    const tree = new PatriciaTree();
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
      const rowKey = ReputationMiner.getKey(row.colony_address, row.skill_id, row.user_address);
      await tree.insert(rowKey, row.value);
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
  async confirmJustificationRootHash() {
    const [, siblings1] = await this.justificationTree.getProof(`0x${new BN("0").toString(16, 64)}`);
    const repCycle = await this.getActiveRepCycle();
    const nLogEntries = await repCycle.getReputationUpdateLogLength();
    const lastLogEntry = await repCycle.getReputationUpdateLogEntry(nLogEntries.sub(1));
    const totalnUpdates = ethers.utils
      .bigNumberify(lastLogEntry.nUpdates)
      .add(lastLogEntry.nPreviousUpdates)
      .add(this.nReputationsBeforeLatestLog);
    const [, siblings2] = await this.justificationTree.getProof(ReputationMiner.getHexString(totalnUpdates, 64));
    const [round, index] = await this.getMySubmissionRoundAndIndex();

    let gasEstimate = ethers.utils.bigNumberify(6000000);
    try {
      gasEstimate = await repCycle.estimate.confirmJustificationRootHash(round, index, siblings1, siblings2);
    } catch (err) { // eslint-disable-line no-empty

    }
    gasEstimate = this.padGasEstimateIfNecessary(gasEstimate);

    return repCycle.confirmJustificationRootHash(
      round,
      index,
      siblings1,
      siblings2,
      { gasLimit: gasEstimate, gasPrice: this.gasPrice }
    );
  }

  /**
   * Returns the round and index that our disputedEntry is currently at in the dispute cycle.
   * @return {Promise} Resolves to [round, index] which are `BigNumber`.
   */
  async getMySubmissionRoundAndIndex() {
    const submittedHash = await this.reputationTree.getRootHash();
    const submittedNNodes = await this.getRootHashNNodes();
    const jrh = await this.justificationTree.getRootHash();
    const repCycle = await this.getActiveRepCycle();

    let round = ethers.constants.Zero;
    let disputeRound = await repCycle.getDisputeRound(round);
    while (disputeRound.length > 0) {
      for (let index = ethers.constants.Zero; index.lt(disputeRound.length); index = index.add(1) ) {
        const submission = await repCycle.getReputationHashSubmission(disputeRound[index].firstSubmitter);
        if (
          submission.proposedNewRootHash === submittedHash &&
          submission.nNodes.toString() === submittedNNodes.toString() &&
          submission.jrh === jrh
        ) {
          return [round, index ] }
      }
      round = round.add(1);
      disputeRound = await repCycle.getDisputeRound(round);
    }
    return [ethers.constants.negativeOne, ethers.constants.negativeOne];
  }

  /**
   * Respond to the next stage in the binary search occurring on `ReputationMiningCycle` contract in order to find
   * the first log entry where our submitted hash and the hash we are paired off against differ.
   * @return {Promise} Resolves to the tx hash of the response
   */
  async respondToBinarySearchForChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const repCycle = await this.getActiveRepCycle();
    const disputeRound = await repCycle.getDisputeRound(round);
    const disputedEntry = disputeRound[index];

    const targetNode = disputedEntry.lowerBound;
    const targetNodeKey = ReputationMiner.getHexString(targetNode, 64);

    const intermediateReputationHash = this.justificationHashes[targetNodeKey].jhLeafValue;
    const proof = await this.justificationTree.getProof(targetNodeKey);
    const [branchMask] = proof;
    let [, siblings] = proof;

    let proofEndingHash = await this.justificationTree.getImpliedRoot(
      targetNodeKey,
      this.justificationHashes[targetNodeKey].jhLeafValue,
      branchMask,
      siblings
    );

    while (siblings.length > 1 && disputedEntry.targetHashDuringSearch !== proofEndingHash) {
      // Remove the first sibling
      siblings = siblings.slice(1);
      // Recalulate ending hash
      proofEndingHash = await this.justificationTree.getImpliedRoot(
        targetNodeKey,
        this.justificationHashes[targetNodeKey].jhLeafValue,
        branchMask,
        siblings
      );
    }

    let gasEstimate = ethers.utils.bigNumberify(1000000);
    try {
      gasEstimate = await repCycle.estimate.respondToBinarySearchForChallenge(
        round,
        index,
        intermediateReputationHash,
        siblings
      );
    } catch (err) { // eslint-disable-line no-empty

    }
    gasEstimate = this.padGasEstimateIfNecessary(gasEstimate);
    return repCycle.respondToBinarySearchForChallenge(
      round,
      index,
      intermediateReputationHash,
      siblings,
      {
        gasLimit: gasEstimate,
        gasPrice: this.gasPrice
      }
    );
  }

  /**
   * Respond to the next stage in the binary search occurring on `ReputationMiningCycle` contract in order to find
   * the first log entry where our submitted hash and the hash we are paired off against differ.
   * @return {Promise} Resolves to the tx hash of the response
   */
  async confirmBinarySearchResult() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const repCycle = await this.getActiveRepCycle();
    const disputeRound = await repCycle.getDisputeRound(round);
    const disputedEntry = disputeRound[index];
    const targetNode = ethers.utils.bigNumberify(disputedEntry.lowerBound);
    const targetNodeKey = ReputationMiner.getHexString(targetNode, 64);

    const intermediateReputationHash = this.justificationHashes[targetNodeKey].jhLeafValue;
    const [, siblings] = await this.justificationTree.getProof(targetNodeKey);
    let gasEstimate = ethers.utils.bigNumberify(1000000);
    try {
      gasEstimate = await repCycle.estimate.confirmBinarySearchResult(round, index, intermediateReputationHash, siblings);
    } catch (err){ // eslint-disable-line no-empty

    }
    gasEstimate = this.padGasEstimateIfNecessary(gasEstimate);

    return repCycle.confirmBinarySearchResult(round, index, intermediateReputationHash, siblings, {
      gasLimit: gasEstimate,
      gasPrice: this.gasPrice
    });
  }

  /**
   * Respond to a specific challenge over the effect of a specific log entry once the binary search has been completed to establish
   * the log entry where the two submitted hashes differ.
   * @return {Promise} Resolves to tx hash of the response
   */
  async respondToChallenge() {
    const [round, index] = await this.getMySubmissionRoundAndIndex();
    const repCycle = await this.getActiveRepCycle();
    const disputeRound = await repCycle.getDisputeRound(round);
    const disputedEntry = disputeRound[index];

    // console.log(disputedEntry);
    let firstDisagreeIdx = ethers.utils.bigNumberify(disputedEntry.lowerBound);
    let lastAgreeIdx = firstDisagreeIdx.sub(1);
    // If this is called before the binary search has finished, these would be -1 and 0, respectively, which will throw errors
    // when we try and pass -ve hex values. Instead, set them to values that will allow us to send a tx that will fail.

    lastAgreeIdx = lastAgreeIdx.lt(0) ? ethers.constants.Zero : lastAgreeIdx;
    firstDisagreeIdx = firstDisagreeIdx.lt(1) ? ethers.constants.One : firstDisagreeIdx;

    const reputationKey = await this.getKeyForUpdateNumber(lastAgreeIdx);
    const lastAgreeKey = ReputationMiner.getHexString(lastAgreeIdx, 64);
    const firstDisagreeKey = ReputationMiner.getHexString(firstDisagreeIdx, 64);

    const [agreeStateBranchMask, agreeStateSiblings] = await this.justificationTree.getProof(lastAgreeKey);
    const [disagreeStateBranchMask, disagreeStateSiblings] = await this.justificationTree.getProof(firstDisagreeKey);
    let logEntryNumber = ethers.constants.Zero;
    if (lastAgreeIdx.gte(this.nReputationsBeforeLatestLog)) {
      logEntryNumber = await this.getLogEntryNumberForLogUpdateNumber(lastAgreeIdx.sub(this.nReputationsBeforeLatestLog));
    }
    const lastAgreeJustifications = this.justificationHashes[lastAgreeKey];
    const firstDisagreeJustifications = this.justificationHashes[firstDisagreeKey];

    if (this.justificationHashes[lastAgreeKey].originAdjacentReputationProof.key !== "0x00") {
      // We generated the origin-adjacent reputation proof. We replace the origin proof with the originAdjacentReputationProof
      lastAgreeJustifications.originReputationProof.uid = lastAgreeJustifications.originAdjacentReputationProof.uid;
      lastAgreeJustifications.originReputationProof.branchMask = lastAgreeJustifications.originAdjacentReputationProof.branchMask;
      lastAgreeJustifications.originReputationProof.siblings = lastAgreeJustifications.originAdjacentReputationProof.siblings;
    }

    if (this.justificationHashes[lastAgreeKey].childAdjacentReputationProof.key !== "0x00") {
      // We generated the child-adjacent reputation proof. We replace the child proof with the childAdjacentReputationProof
      lastAgreeJustifications.childReputationProof.uid = lastAgreeJustifications.childAdjacentReputationProof.uid;
      lastAgreeJustifications.childReputationProof.branchMask = lastAgreeJustifications.childAdjacentReputationProof.branchMask;
      lastAgreeJustifications.childReputationProof.siblings = lastAgreeJustifications.childAdjacentReputationProof.siblings;
    }

    const functionArgs = [
      [
        round,
        index,
        firstDisagreeJustifications.justUpdatedProof.branchMask,
        lastAgreeJustifications.nextUpdateProof.nNodes,
        ReputationMiner.getHexString(agreeStateBranchMask),
        firstDisagreeJustifications.justUpdatedProof.nNodes,
        ReputationMiner.getHexString(disagreeStateBranchMask),
        logEntryNumber,
        "0",
        lastAgreeJustifications.originReputationProof.branchMask,
        lastAgreeJustifications.nextUpdateProof.reputation,
        lastAgreeJustifications.nextUpdateProof.uid,
        firstDisagreeJustifications.justUpdatedProof.reputation,
        firstDisagreeJustifications.justUpdatedProof.uid,
        lastAgreeJustifications.originReputationProof.reputation,
        lastAgreeJustifications.originReputationProof.uid,
        lastAgreeJustifications.childReputationProof.branchMask,
        lastAgreeJustifications.childReputationProof.reputation,
        lastAgreeJustifications.childReputationProof.uid,
        "0",
        lastAgreeJustifications.adjacentReputationProof.branchMask,
        lastAgreeJustifications.adjacentReputationProof.reputation,
        lastAgreeJustifications.adjacentReputationProof.uid,
        "0",
        lastAgreeJustifications.originAdjacentReputationProof.reputation,
        lastAgreeJustifications.childAdjacentReputationProof.reputation
      ],
      [
        ...ReputationMiner.breakKeyInToElements(reputationKey).map(x => ethers.utils.hexZeroPad(x, 32)),
        soliditySha3(reputationKey),
        soliditySha3(lastAgreeJustifications.adjacentReputationProof.key),
        soliditySha3(lastAgreeJustifications.originAdjacentReputationProof.key),
        soliditySha3(lastAgreeJustifications.childAdjacentReputationProof.key),
      ],
      firstDisagreeJustifications.justUpdatedProof.siblings,
      agreeStateSiblings,
      disagreeStateSiblings,
      lastAgreeJustifications.originReputationProof.siblings,
      lastAgreeJustifications.childReputationProof.siblings,
      lastAgreeJustifications.adjacentReputationProof.siblings]

    let gasEstimate = ethers.utils.bigNumberify(4000000);
    try {
      gasEstimate = await repCycle.estimate.respondToChallenge(...functionArgs);
    } catch (err){ // eslint-disable-line no-empty

    }
    gasEstimate = this.padGasEstimateIfNecessary(gasEstimate);

    return repCycle.respondToChallenge(...functionArgs,
      { gasLimit: gasEstimate, gasPrice: this.gasPrice }
    );
  }

  /**
   * Insert (or update) the reputation for a user in the local reputation tree
   * @param  {string}  key  The key of the reputation that is being updated
   * @param  {Number of BigNumber or String}  reputationScore The amount the reputation changes by
   * @param  {Number or BigNumber}  index           The index of the log entry being considered
   * @return {Promise}                 Resolves to `true` or `false` depending on whether the insertion was successful
   */
  async insert(key, _reputationScore, index) {
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
        newValue = ethers.constants.Zero;
      }
      const upperLimit = ethers.utils
        .bigNumberify(2)
        .pow(127)
        .sub(1);

      if (newValue.gt(upperLimit)) {
        newValue = upperLimit;
      }
      value = this.getValueAsBytes(newValue, uid, index);
    } else {
      newValue = _reputationScore;
      if (newValue.lt(0)) {
        newValue = ethers.constants.Zero;
      }

      // A new value can never overflow, so we don't need a 'capping' check here
      value = this.getValueAsBytes(newValue, this.nReputations.add(1), index);
      this.nReputations = this.nReputations.add(1);
    }
    const tx = await this.reputationTree.insert(key, value, { gasLimit: 4000000 });
    if (!this.useJsTree) {
      await tx.wait();
    }
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
    if (!blockNumber) {
      throw new Error("Block number not supplied to sync");
    }
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
      console.log(`Syncing mining cycle ${i + 1} of ${events.length}...`)
      const event = events[i];
      const hash = event.data.slice(0, 66);
      if (applyLogs) {
        const nNodes = ethers.utils.bigNumberify(`0x${event.data.slice(66, 130)}`);
        const previousBlock = event.blockNumber - 1;
        await this.addLogContentsToReputationTree(previousBlock);
        localHash = await this.reputationTree.getRootHash();
        const localNNodes = this.nReputations;
        if (localHash !== hash || !localNNodes.eq(nNodes)) {
          console.log("WARNING: Either sync has failed, or some log entries have been replaced. Continuing sync, as we might recover");
        }
        if (saveHistoricalStates) {
          await this.saveCurrentState(event.blockNumber);
        }
      }
      if (applyLogs === false && localHash === hash) {
        applyLogs = true;
      }
    }

    // Check final state
    const currentHash = await this.colonyNetwork.getReputationRootHash();
    const currentNNodes = await this.colonyNetwork.getReputationRootHashNNodes();
    localHash = await this.reputationTree.getRootHash();
    const localNNodes = await this.nReputations;
    if (localHash !== currentHash || !currentNNodes.eq(localNNodes)) {
      console.log("ERROR: Sync failed and did not recover");
    } else {
      console.log("Sync successful, even if there were warnings above");
    }
  }

  async printCurrentState() {
    for (let i = 0; i < Object.keys(this.reputations).length; i += 1) {
      const key = Object.keys(this.reputations)[i];
      const decimalValue = new BN(this.reputations[key].slice(2, 66), 16);
      const keyElements = ReputationMiner.breakKeyInToElements(key);
      const [colonyAddress, , userAddress] = keyElements;
      const skillId = parseInt(keyElements[1], 16);

      console.log("colonyAddress", colonyAddress);
      console.log("userAddress", userAddress);
      console.log("skillId", skillId);
      console.log("value", decimalValue.toString());
      console.log("---------");
    }
  }

  padGasEstimateIfNecessary(_gasEstimate){
    let gasEstimate = _gasEstimate;
    if (this.ganacheClient) {
      gasEstimate = `0x${new BN(gasEstimate.toString()).mul(new BN("11")).div(new BN("10")).toString(16)}`;
    }
    return gasEstimate;
  }

  async saveCurrentState() {
    const db = await sqlite.open(this.dbPath, { Promise });

    const currentRootHash = await this.getRootHash();
    let res = await db.run(`INSERT OR IGNORE INTO reputation_states (root_hash, n_nodes) VALUES ('${currentRootHash}', ${this.nReputations})`);

    for (let i = 0; i < Object.keys(this.reputations).length; i += 1) {
      const key = Object.keys(this.reputations)[i];
      const value = this.reputations[key];
      const keyElements = ReputationMiner.breakKeyInToElements(key);
      const [colonyAddress, , userAddress] = keyElements;
      const skillId = parseInt(keyElements[1], 16);

      res = await db.run(`INSERT OR IGNORE INTO colonies (address) VALUES ('${colonyAddress}')`);
      res = await db.run(`INSERT OR IGNORE INTO users (address) VALUES ('${userAddress}')`);
      res = await db.run(`INSERT OR IGNORE INTO skills (skill_id) VALUES ('${skillId}')`);

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
      res = await db.get(query);

      if (res.n === 0) {
        query = `INSERT INTO reputations (reputation_rowid, colony_rowid, skill_id, user_rowid, value)
          SELECT
          (SELECT reputation_states.rowid FROM reputation_states WHERE reputation_states.root_hash='${currentRootHash}'),
          (SELECT colonies.rowid FROM colonies WHERE colonies.address='${colonyAddress}'),
          ${skillId},
          (SELECT users.rowid FROM users WHERE users.address='${userAddress}'),
          '${value}'`;
        await db.run(query);
      }
    }
    await db.close();
  }

  async loadState(reputationRootHash) {
    const db = await sqlite.open(this.dbPath, { Promise });
    this.nReputations = ethers.constants.Zero;
    this.reputations = {};

    if (this.useJsTree) {
      this.reputationTree = new PatriciaTree();
    } else {
      this.patriciaTreeContractDef = await this.loader.load({ contractName: "PatriciaTree" }, { abi: true, address: false, bytecode: true });

      const contractFactory = new ethers.ContractFactory(this.patriciaTreeContractDef.abi, this.patriciaTreeContractDef.bytecode, this.ganacheWallet);
      const contract = await contractFactory.deploy();
      await contract.deployed();

      this.reputationTree = new ethers.Contract(contract.address, this.patriciaTreeContractDef.abi, this.ganacheWallet);
    }

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
      const key = ReputationMiner.getKey(row.colony_address, row.skill_id, row.user_address);
      const tx = await this.reputationTree.insert(key, row.value, { gasLimit: 4000000 });
      if (!this.useJsTree) {
        await tx.wait();
      }
      this.reputations[key] = row.value;
    }
    const currentStateHash = await this.reputationTree.getRootHash();
    if (currentStateHash !== reputationRootHash) {
      console.log("WARNING: The supplied state failed to be recreated successfully. Are you sure it was saved?");
    }
    await db.close();
  }

  async getAddressesWithReputation(reputationRootHash, colonyAddress, skillId) {
    const db = await sqlite.open(this.dbPath, { Promise });
    const res = await db.all(
      `SELECT DISTINCT users.address as user_address
       FROM reputations
       INNER JOIN colonies ON colonies.rowid=reputations.colony_rowid
       INNER JOIN users ON users.rowid=reputations.user_rowid
       INNER JOIN reputation_states ON reputation_states.rowid=reputations.reputation_rowid
       WHERE reputation_states.root_hash="${reputationRootHash}"
       AND colonies.address="${colonyAddress.toLowerCase()}"
       AND reputations.skill_id="${skillId}"
       AND users.address!="0x0000000000000000000000000000000000000000"`
    );
    await db.close();
    const addresses = res.map(x => x.user_address)
    return addresses;
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
