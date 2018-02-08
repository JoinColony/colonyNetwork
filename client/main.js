import sha3 from 'solidity-sha3';

const ganache = require('ganache-core');
const contract = require('truffle-contract');
const ReputationMiningCycleJSON = require('../build/contracts/ReputationMiningCycle.json');
const ColonyNetworkJSON = require('../build/contracts/ColonyNetwork.json');
const jsonfile = require('jsonfile');

const file = './reputations.json';

const Web3 = require('web3');
const pad = require('pad-left');


const ReputationMiningCycle = contract(ReputationMiningCycleJSON);
const ColonyNetwork = contract(ColonyNetworkJSON);
const accountAddress = '0xbb46703786c2049d4d6dd43f5b4edf52a20fefe4';

export default class ReputationMiningClient {
  constructor() {
    this.web3 = new Web3();
    ReputationMiningCycle.setProvider(ganache.provider({
      network_id: 515,
      vmErrorsOnRPCResponse: false,
      locked: false,
      verbose: true,
      accounts: [
        {
          balance: '0x10000000000000000000000000',
          secretKey: '0xe5c050bb6bfdd9c29397b8fe6ed59ad2f7df83d6fd213b473f84b489205d9fc7',
        },
      ],
    }));
    ColonyNetwork.setProvider(new Web3.providers.HttpProvider('http://localhost:8545'));
    try {
      this.reputations = jsonfile.readFileSync(file);
    } catch (err) {
      this.reputations = {};
    }
  }

  async initialise(colonyNetworkAddress) {
    this.reputationCycle = await ReputationMiningCycle.new({ from: accountAddress, gas: 4000000 });
    this.nReputations = 0;
    this.setColonyNetworkAddress(colonyNetworkAddress);
  }

  async setColonyNetworkAddress(address) {
    this.colonyNetwork = ColonyNetwork.at(address);
  }

  async addLogContentsToReputationTree() {
    const nLogEntries = await this.colonyNetwork.getReputationUpdateLogLength(false);
    for (let i = 0; i < nLogEntries; i += 1) {
      // We have to process these sequentially - if two updates affected the
      // same entry, we would have a potential race condition.
      // Hence, we are awaiting inside these loops.
      const logEntry = await this.colonyNetwork.getReputationUpdateLogEntry(i, false); // eslint-disable-line no-await-in-loop
      // TODO: Include updates for all parent skills (and child, if x.amount is negative)
      // TODO: Include updates for colony-wide sums of skills.
      await this.insert(logEntry[3], logEntry[2], logEntry[0], logEntry[1]); // eslint-disable-line no-await-in-loop
    }
  }

  // async update(colonyAddress, skillId, userAddress, reputationScore){
  //   // TODO: If this User + colony + skill id already exists, then update, don't just insert.
  //   return this.insert(colonyAddress, skillId, userAddress, reputationScore);
  // }

  getValueAsBytes(reputation, uid) {
    return `0x${pad(this.web3.toHex(reputation).slice(2), 64, '0')}${this.web3.toHex(':').slice(2)}${pad(this.web3.toHex(uid).slice(2), 64, '0')}`;
  }

  // function getNode(bytes32 hash) public view returns (Data.Node n);
  // function getProof(bytes key) public view returns (uint branchMask, bytes32[] _siblings);
  // function verifyProof(bytes32 rootHash, bytes key, bytes value, uint branchMask, bytes32[] siblings) public view returns (bool);
  // function insert(bytes key, bytes value) public;
  async insert(_colonyAddress, skillId, _userAddress, reputationScore) {
    let colonyAddress = _colonyAddress;
    let userAddress = _userAddress;
    // TODO fromAscii is deprecated - use asciiToHex once we upgrade web3.
    let isAddress = this.web3.isAddress(colonyAddress);
    if (!isAddress) { return; }
    isAddress = this.web3.isAddress(userAddress);
    if (!isAddress) { return; }
    if (colonyAddress.substring(0, 2) !== '0x') {
      colonyAddress = `0x${colonyAddress}`;
    }
    if (userAddress.substring(0, 2) !== '0x') {
      userAddress = `0x${userAddress}`;
    }
    colonyAddress = colonyAddress.toLowerCase();
    userAddress = userAddress.toLowerCase();
    const key = this.web3.fromAscii(`${colonyAddress}:${skillId}:${userAddress}`);
    const keyAlreadyExists = await this.keyExists(key);
    // const keyHash = sha3(key);
    // If we already have this key, then we lookup the unique identifier we assigned this key.
    // Otherwise, give it the new one.
    let value;
    if (keyAlreadyExists) {
      // Look up value from our JSON.
      value = this.reputations[key];
      // Extract uid
      const uid = this.web3.toBigNumber(`0x${value.slice(-64)}`);
      value = this.getValueAsBytes(reputationScore, uid);
    } else {
      value = this.getValueAsBytes(reputationScore, this.nReputations + 1);
    }
    await this.reputationCycle.insert(key, value, { from: accountAddress, gas: 4000000 });
    // If successful, add to our JSON.
    this.reputations[key] = value;
    if (!keyAlreadyExists) {
      this.nReputations += 1;
    }
  }

  async getRootHash() {
    return this.reputationCycle.getRootHash();
  }

  async getRootEdgeLabelData() {
    return this.reputationCycle.getRootEdgeLabelData();
  }

  async keyExists(key) {
    // key must already have had fromAscii applied to it.
    let res = ['', []];
    try {
      res = await this.reputationCycle.getProof(key);
    } catch (err) {
      // Nothing doing. This try/catch business is only needed until we can
      // straighten out the ganache-core / ganache-cli / truffle web3 0.20 vs 0.1
      // business.
    }
    if (res[1].length > 0) {
      return true;
    }
    // It is possible that this key is the only key in the tree.
    const rootEdge = await this.getRootEdgeLabelData();
    return rootEdge === sha3(key);
  }
}
