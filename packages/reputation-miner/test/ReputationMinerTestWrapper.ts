// const ReputationMiner = require("#ReputationMiner.js").default;
import { BigNumber, Contract, ContractReceipt } from "ethers";
import PatriciaTreeNoHash from "#patriciaNoHashKey.js";
import PatriciaTreeBase from "../src/patricia-base";
import ReputationMiner from "../src/ReputationMiner";
import PatriciaNoOp from "../src/patriciaNoOp";
import PatriciaTree from "../src/patricia";

type ContractDef = { abi: any; bytecode?: string };

class ReputationMinerTestWrapper {
  reputationMiner: ReputationMiner;

  justificationTree: any;

  reputations: any;

  justificationHashes: any;

  previousReputations: any;

  reputationTree: any;

  previousReputationTree: any;

  realProvider: any;

  reverseReputationHashLookup: any;

  constructor(opts) {
    this.reputationMiner = new ReputationMiner(opts);

    this.justificationTree = new Proxy({}, {
      get: (target, prop) => {
        if (prop in this.reputationMiner.justificationTree) {
          return this.reputationMiner.justificationTree[prop];
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (prop in this.reputationMiner.justificationTree) {
          this.reputationMiner.justificationTree[prop] = value;
          return true;
        }
        target[prop] = value; // eslint-disable-line no-param-reassign
        return true;
      }
    });

    this.realProvider = new Proxy({}, {
      get: (target, prop) => {
        if (prop in this.reputationMiner.realProvider) {
          return this.reputationMiner.realProvider[prop];
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (prop in this.reputationMiner.realProvider) {
          this.reputationMiner.realProvider[prop] = value;
          return true;
        }
        target[prop] = value; // eslint-disable-line no-param-reassign
        return true;
      }
    });

    this.reputationTree = new Proxy({}, {
      get: (target, prop) => {
        if (prop in this.reputationMiner.reputationTree) {
          return this.reputationMiner.reputationTree[prop];
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (prop in this.reputationMiner.reputationTree) {
          this.reputationMiner.reputationTree[prop] = value;
          return true;
        }
        target[prop] = value; // eslint-disable-line no-param-reassign
        return true;
      },
    });


    this.previousReputationTree = new Proxy({}, {
      get: (target, prop) => {
        if (prop in this.reputationMiner.previousReputationTree) {
          return this.reputationMiner.previousReputationTree[prop];
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (prop in this.reputationMiner.previousReputationTree) {
          this.reputationMiner.previousReputationTree[prop] = value;
          return true;
        }
        target[prop] = value; // eslint-disable-line no-param-reassign
        return true;
      },
    });


    // this.justificationTree = {
    //   getRootHash: () => this.reputationMiner.justificationTree.getRootHash(),
    //   insert: () => this.reputationMiner.justificationTree.insert(),
    //   getProof: () => this.reputationMiner.justificationTree.getProof(),
    //   getImpliedRoot: () => this.reputationMiner.justificationTree.getImpliedRoot(),
    //   insertAtEdge: () => this.reputationMiner.justificationTree.insertAtEdge(),
    // }

    this.reverseReputationHashLookup = new Proxy({}, {
      get: (target, prop) => {
        if (typeof prop !== "string" && typeof prop !== "number") {
          return undefined;
        }

        if (prop in this.reputationMiner.reverseReputationHashLookup) {
          return this.reputationMiner.reverseReputationHashLookup[prop];
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (typeof prop !== "string" && typeof prop !== "number") {
          return false;
        }
        if (prop in this.reputationMiner.reverseReputationHashLookup) {
          this.reputationMiner.reverseReputationHashLookup[prop] = value;
          return true;
        }
        target[prop] = value; // eslint-disable-line no-param-reassign
        return true;
      },
      ownKeys: (target) => {
        return Reflect.ownKeys(this.reputationMiner.reverseReputationHashLookup);
      },
      getOwnPropertyDescriptor: (target, prop) => {
      if (prop in this.reputationMiner.reverseReputationHashLookup) {
        return Object.getOwnPropertyDescriptor(this.reputationMiner.reverseReputationHashLookup, prop);
      }
      return Object.getOwnPropertyDescriptor(target, prop);
      }
    });

    this.reputations = new Proxy({}, {
      get: (target, prop) => {
      if (prop in this.reputationMiner.reputations) {
        if (typeof prop === "string" || typeof prop === "number") {
          return this.reputationMiner.reputations[prop];
        }
        return undefined;
      }
      return target[prop];
      },
      ownKeys: (target) => {
        return Reflect.ownKeys(this.reputationMiner.reputations);
      },
      getOwnPropertyDescriptor: (target, prop) => {
      if (prop in this.reputationMiner.reputations) {
        return Object.getOwnPropertyDescriptor(this.reputationMiner.reputations, prop);
      }
      return Object.getOwnPropertyDescriptor(target, prop);
      }
    });

    this.previousReputations = new Proxy({}, {
      get: (target, prop) => {
      if (prop in this.reputationMiner.previousReputations) {
        if (typeof prop === "string" || typeof prop === "number") {
          return this.reputationMiner.previousReputations[prop];
        }
        return undefined;
      }
      return target[prop];
      },
      ownKeys: (target) => {
        return Reflect.ownKeys(this.reputationMiner.previousReputations);
      },
      getOwnPropertyDescriptor: (target, prop) => {
      if (prop in this.reputationMiner.previousReputations) {
        return Object.getOwnPropertyDescriptor(this.reputationMiner.previousReputations, prop);
      }
      return Object.getOwnPropertyDescriptor(target, prop);
      }
    });


    this.justificationHashes = new Proxy({}, {
      get: (target, prop) => {
        if (prop in this.reputationMiner.justificationHashes) {
          if (typeof prop === "string" || typeof prop === "number") {
            return this.reputationMiner.justificationHashes[prop];
          }
          return undefined;
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (typeof prop !== "string" && typeof prop !== "number") {
          return false;
        }
        if (prop in this.reputationMiner.justificationHashes) {
          this.reputationMiner.justificationHashes[prop] = value;
          return true;
        }
        target[prop] = value; // eslint-disable-line no-param-reassign
        return true;
      },
      ownKeys: (target) => {
        return Reflect.ownKeys(this.reputationMiner.justificationHashes);
      },
      getOwnPropertyDescriptor: (target, prop) => {
      if (prop in this.reputationMiner.justificationHashes) {
        return Object.getOwnPropertyDescriptor(this.reputationMiner.justificationHashes, prop);
      }
      return Object.getOwnPropertyDescriptor(target, prop);
      }
    });

    //
  }

  // Functions we alter to make tests work
  async submitRootHash(entryIndex) : Promise<ContractReceipt>{
    const tx = await this.reputationMiner.submitRootHash(entryIndex);
    return tx.wait();
  }

  async confirmJustificationRootHash() {
    const tx = await this.reputationMiner.confirmJustificationRootHash();
    return tx.wait();
  }

  async respondToBinarySearchForChallenge() {
    const tx = await this.reputationMiner.respondToBinarySearchForChallenge();
    return tx.wait();
  }

  async confirmBinarySearchResult() {
    const tx = await this.reputationMiner.confirmBinarySearchResult();
    return tx.wait();
  }

  async respondToChallenge() {
    const tx = await this.reputationMiner.respondToChallenge();
    return tx.wait();
  }

  async confirmNewHash() {
    const tx = await this.reputationMiner.confirmNewHash();
    if (!tx) {
      throw new Error("No tx");
    }
    return tx.wait();
  }

  // All other functions that we call
  async initialise(colonyNetworkAddress: string) {
    return this.reputationMiner.initialise(colonyNetworkAddress);
  }

  async resetDB() {
    return this.reputationMiner.resetDB();
  }

  async addLogContentsToReputationTree(blockNumber : "latest" | number = "latest", buildJustificationTree = true) {
    return this.reputationMiner.addLogContentsToReputationTree(blockNumber, buildJustificationTree);
  }

  async getRootHash() {
    return this.reputationMiner.getRootHash();
  }

  async getRootHashNLeaves() {
    return this.reputationMiner.getRootHashNLeaves();
  }

  async saveCurrentState() : Promise<void>{
    return this.reputationMiner.saveCurrentState();
  }

  async getProof(key: string): Promise<[string, string[]]> {
    return this.reputationMiner.getProof(key);
  }

  async sync(n): Promise<void> {
    return this.reputationMiner.sync(n);
  }

  async loadState(reputationRootHash: string): Promise<void> {
    return this.reputationMiner.loadState(reputationRootHash);
  }

  async getHistoricalProofAndValue(rootHash: string, key:string): Promise<[string, string[], string] | Error> {
    return this.reputationMiner.getHistoricalProofAndValue(rootHash, key);
  }

  async getActiveRepCycle(): Promise<Contract> {
    return this.reputationMiner.getActiveRepCycle();
  }

  async getKeyForUpdateNumber(updateNumber: number): Promise<string> {
    return this.reputationMiner.getKeyForUpdateNumber(updateNumber);
  }

  async updatePeriodLength(repCycle: Contract): Promise<void> {
    return this.reputationMiner.updatePeriodLength(repCycle);
  }

  async getMiningCycleDuration(): Promise<BigNumber> {
    return this.reputationMiner.getMiningCycleDuration();
  }

  static getKey(_colonyAddress, _skillId, _userAddress): string {
    return ReputationMiner.getKey(_colonyAddress, _skillId, _userAddress);
  }

  static getHexString(input, length = 0) {
    return ReputationMiner.getHexString(input, length);
  }

  static breakKeyInToElements(key: string): [string, string, string] {
    return ReputationMiner.breakKeyInToElements(key);
  }

  async getMySubmissionRoundAndIndex(): Promise<BigNumber[]> {
    return this.reputationMiner.getMySubmissionRoundAndIndex();
  }

  async getEntryIndex(): Promise<BigNumber> {
    return this.reputationMiner.getEntryIndex();
  }

  async getJRHEntryValueAsBytes(_reputationState: any, _nLeaves: any) {
    return this.reputationMiner.getJRHEntryValueAsBytes(_reputationState, _nLeaves);
  }

  async addSingleReputationUpdate(updateNumber: BigNumber,
    repCycle: Contract,
    blockNumber: number | "latest",
    checkForReplacement: boolean
): Promise<void> {
    return this.reputationMiner.addSingleReputationUpdate(updateNumber, repCycle, blockNumber, checkForReplacement);
  }

  async getReputationProofObject(key: string): Promise<any> {
    return this.reputationMiner.getReputationProofObject(key);
  }

  async loadJustificationTree(justificationRootHash: string): Promise<void> {
    return this.reputationMiner.loadJustificationTree(justificationRootHash);
  }

  async insert(key: string, _reputationScore: BigNumber | number, index: BigNumber|number): Promise<boolean> {
    return this.reputationMiner.insert(key, _reputationScore, index);
  }

  async submissionPossible(entryIndex: any): Promise<boolean> {
    return this.reputationMiner.submissionPossible(entryIndex);
  }

  async setFeeData(_feeData: any): Promise<void> {
    return this.reputationMiner.setFeeData(_feeData);
  }

  async saveJustificationTree(): Promise<void> {
    return this.reputationMiner.saveJustificationTree();
  }

  get minerAddress(): string {
    return this.reputationMiner.minerAddress;
  }

  get nReputations(): BigNumber {
    return this.reputationMiner.nReputations;
  }

  set nReputations(i: BigNumber) {
    this.reputationMiner.nReputations = i;
  }

  get nReputationsBeforeLatestLog(): BigNumber {
    return this.reputationMiner.nReputationsBeforeLatestLog;
  }

  get colonyNetwork(): Contract {
    return this.reputationMiner.colonyNetwork;
  }

  get repCycleContractDef(): ContractDef {
    return this.reputationMiner.repCycleContractDef;
  }

  get constant(): BigNumber {
    return this.reputationMiner.constant;
  }

  get useJsTree(): boolean {
    return this.reputationMiner.useJsTree;
  }

  get decayNumerator(): BigNumber {
    return this.reputationMiner.decayNumerator;
  }

  get decayDenominator(): BigNumber {
    return this.reputationMiner.decayDenominator;
  }

  async getLogEntryNumberForLogUpdateNumber(_i, blockNumber): Promise<BigNumber> {
    return this.reputationMiner.getLogEntryNumberForLogUpdateNumber(_i, blockNumber);
  }

  async loadStateToPrevious(reputationRootHash: string): Promise<void> {
    return this.reputationMiner.loadStateToPrevious(reputationRootHash);
  }

  async getAdjacentKey(key: string): Promise<string> {
    return this.reputationMiner.getAdjacentKey(key);
  }

  getAmount(i: any, amount: any): BigNumber {
    return this.reputationMiner.getAmount(i, amount);
  }

  get realWallet() {
    return new Proxy(this.reputationMiner.realWallet, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop];
        }
        return undefined;
      },
      ownKeys: (target) => {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, prop) => {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
    });
  }
}

export default ReputationMinerTestWrapper;
