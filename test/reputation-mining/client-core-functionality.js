/* globals artifacts */
import path from "path";
import request from "async-request";
import BN from "bn.js";

import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE } from "../../helpers/constants";
import { currentBlock, makeReputationKey, advanceMiningCycleNoContest, getActiveRepCycle } from "../../helpers/test-helper";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import ReputationMinerClient from "../../packages/reputation-miner/ReputationMinerClient";

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
  let clny;
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
    clny = await Token.at(clnyAddress);

    reputationMiner = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, realProviderPort, useJsTree: true });
  });

  beforeEach(async () => {
    const lock = await tokenLocking.getUserLock(clny.address, MINER1);
    assert.equal(lock.balance, DEFAULT_STAKE.toString());

    // Advance two cycles to clear active and inactive state.
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });
    await advanceMiningCycleNoContest({ colonyNetwork, test: this });

    // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
    // This is the same starting point for all tests.
    const repCycle = await getActiveRepCycle(colonyNetwork);
    const activeLogEntries = await repCycle.getReputationUpdateLogLength();
    assert.equal(activeLogEntries.toNumber(), 1);

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
      assert.equal(res.statusCode, 200);

      const oracleProofObject = JSON.parse(res.body);
      const key = makeReputationKey(metaColony.address, new BN(2), MINER1);

      const [branchMask, siblings] = await reputationMiner.getProof(key);
      const value = reputationMiner.reputations[key];

      assert.equal(branchMask, oracleProofObject.branchMask);
      assert.equal(siblings.length, oracleProofObject.siblings.length);

      for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
      }

      assert.equal(key, oracleProofObject.key);
      assert.equal(value, oracleProofObject.value);
    });

    it("should correctly respond to a request for a reputation state in a previous state", async () => {
      const rootHash = await reputationMiner.getRootHash();
      const key = makeReputationKey(metaColony.address, new BN(2), MINER1);
      const [branchMask, siblings] = await reputationMiner.getProof(key);
      const value = reputationMiner.reputations[key];

      await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

      const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${MINER1}`;
      const res = await request(url);
      assert.equal(res.statusCode, 200);

      const oracleProofObject = JSON.parse(res.body);
      assert.equal(branchMask, oracleProofObject.branchMask);
      assert.equal(siblings.length, oracleProofObject.siblings.length);

      for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
        assert.equal(siblings[i], oracleProofObject.siblings[i]);
      }

      assert.equal(key, oracleProofObject.key);
      assert.equal(value, oracleProofObject.value);
    });

    it("should correctly respond to a request for a valid key in an invalid reputation state", async () => {
      const rootHash = await reputationMiner.getRootHash();
      const url = `http://127.0.0.1:3000/${rootHash.slice(4)}0000/${metaColony.address}/2/${MINER1}`;
      const res = await request(url);
      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).message, "Requested reputation does not exist or invalid request");
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
          assert.equal(res.statusCode, 400);
          assert.equal(JSON.parse(res.body).message, "Requested reputation does not exist or invalid request");
        });
  });
});
