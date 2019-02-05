/* globals artifacts */

import path from "path";
import request from "async-request";
import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE } from "../../helpers/constants";
import { currentBlock, makeReputationKey, advanceMiningCycleNoContest, getActiveRepCycle } from "../../helpers/test-helper";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import ReputationMinerClient from "../../packages/reputation-miner/ReputationMinerClient";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts")
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

contract("Reputation mining - client core functionality", accounts => {
  const MINER1 = accounts[5];

  let colonyNetwork;
  let tokenLocking;
  let metaColony;
  let clnyToken;
  let reputationMiner;
  let client;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
    const clnyAddress = await metaColony.getToken();
    clnyToken = await Token.at(clnyAddress);

    const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
    expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

    reputationMiner = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, realProviderPort, useJsTree: true });
  });

  beforeEach(async () => {
    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const activeLogEntries = await repCycle.getReputationUpdateLogLength();
    expect(activeLogEntries).to.eq.BN(1);

    await reputationMiner.resetDB();
    await reputationMiner.initialise(colonyNetwork.address);
    await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
    await reputationMiner.saveCurrentState();

    client = new ReputationMinerClient({ loader, realProviderPort, minerAddress: MINER1, useJsTree: true, auto: false });
    await client.initialise(colonyNetwork.address);
  });

  afterEach(async () => {
    client.close();
  });

  describe("core functionality", () => {
    it("should correctly respond to a request for a reputation state in the current state", async () => {
      const rootHash = await reputationMiner.getRootHash();
      const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${MINER1}`;
      const res = await request(url);
      expect(res.statusCode).to.equal(200);

      const oracleProofObject = JSON.parse(res.body);
      const key = makeReputationKey(metaColony.address, new BN(2), MINER1);

      const [branchMask, siblings] = await reputationMiner.getProof(key);
      const value = reputationMiner.reputations[key];

      expect(branchMask).to.equal(oracleProofObject.branchMask);
      expect(siblings.length).to.equal(oracleProofObject.siblings.length);

      for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
        expect(siblings[i]).to.equal(oracleProofObject.siblings[i]);
        expect(siblings[i]).to.equal(oracleProofObject.siblings[i]);
      }

      expect(key).to.equal(oracleProofObject.key);
      expect(value).to.equal(oracleProofObject.value);
    });

    it("should correctly respond to a request for a reputation state in a previous state", async () => {
      const rootHash = await reputationMiner.getRootHash();
      const key = makeReputationKey(metaColony.address, new BN(2), MINER1);
      const [branchMask, siblings] = await reputationMiner.getProof(key);
      const value = reputationMiner.reputations[key];

      await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

      const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${MINER1}`;
      const res = await request(url);
      expect(res.statusCode).to.equal(200);

      const oracleProofObject = JSON.parse(res.body);
      expect(branchMask).to.equal(oracleProofObject.branchMask);
      expect(siblings.length).to.equal(oracleProofObject.siblings.length);

      for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
        expect(siblings[i]).to.equal(oracleProofObject.siblings[i]);
        expect(siblings[i]).to.equal(oracleProofObject.siblings[i]);
      }

      expect(key).to.equal(oracleProofObject.key);
      expect(value).to.equal(oracleProofObject.value);
    });

    it("should correctly respond to a request for a valid key in an invalid reputation state", async () => {
      const rootHash = await reputationMiner.getRootHash();
      const url = `http://127.0.0.1:3000/${rootHash.slice(4)}0000/${metaColony.address}/2/${MINER1}`;
      const res = await request(url);
      expect(res.statusCode).to.equal(400);
      expect(JSON.parse(res.body).message).to.equal("Requested reputation does not exist or invalid request");
    });

    process.env.SOLIDITY_COVERAGE
      ? it.skip
      : it("should correctly respond to a request for an invalid key in a valid past reputation state", async () => {
          const rootHash = await reputationMiner.getRootHash();
          const startingBlock = await currentBlock();
          const startingBlockNumber = startingBlock.number;

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await client._miner.sync(startingBlockNumber); // eslint-disable-line no-underscore-dangle

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${accounts[4]}`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("Requested reputation does not exist or invalid request");
        });
  });
});
