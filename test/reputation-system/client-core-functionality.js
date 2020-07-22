/* globals artifacts */

import path from "path";
import request from "async-request";
import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import TruffleLoader from "../../packages/reputation-miner/TruffleLoader";
import { DEFAULT_STAKE } from "../../helpers/constants";
import { currentBlock, makeReputationKey, advanceMiningCycleNoContest, getActiveRepCycle } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, giveUserCLNYTokensAndStake } from "../../helpers/test-data-generator";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";
import ReputationMinerClient from "../../packages/reputation-miner/ReputationMinerClient";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "../..", "build", "contracts"),
});

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation mining - client core functionality", (accounts) => {
      const MINER1 = accounts[5];

      let colonyNetwork;
      let metaColony;
      let clnyToken;
      let reputationMiner;
      let client;

      before(async () => {
        // Setup a new network instance as we'll be modifying the global skills tree
        colonyNetwork = await setupColonyNetwork();
        const tokenLockingAddress = await colonyNetwork.getTokenLocking();
        const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
        ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));

        await giveUserCLNYTokensAndStake(colonyNetwork, MINER1, DEFAULT_STAKE);
        await colonyNetwork.initialiseReputationMining();
        await colonyNetwork.startNextCycle();

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
          }

          expect(key).to.equal(oracleProofObject.key);
          expect(value).to.equal(oracleProofObject.value);
        });

        it("should correctly respond to a request for a valid key in a reputation state that never existed", async () => {
          const rootHash = await reputationMiner.getRootHash();
          const url = `http://127.0.0.1:3000/0x${rootHash.slice(8)}000000/${metaColony.address}/2/${MINER1}`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("No such reputation state");
        });

        it("should correctly respond to a request for a valid key that didn't exist in a valid past reputation state", async () => {
          const rootHash = await reputationMiner.getRootHash();
          const startingBlock = await currentBlock();
          const startingBlockNumber = startingBlock.number;

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await client._miner.sync(startingBlockNumber); // eslint-disable-line no-underscore-dangle

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${accounts[4]}`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("Requested reputation does not exist");
        });

        it("should correctly respond to a request for an invalid key in a valid past reputation state", async () => {
          const rootHash = await reputationMiner.getRootHash();
          const startingBlock = await currentBlock();
          const startingBlockNumber = startingBlock.number;

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await client._miner.sync(startingBlockNumber); // eslint-disable-line no-underscore-dangle

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/notAKey`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("One of the parameters was incorrect");
        });

        it("should correctly respond to a request for users that have a particular reputation in a colony", async () => {
          const rootHash = await reputationMiner.getRootHash();
          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/1/`;
          const res = await request(url);
          expect(res.statusCode).to.equal(200);

          const { addresses } = JSON.parse(res.body);
          expect(addresses.length).to.equal(1);
          expect(addresses[0]).to.equal(MINER1.toLowerCase());
        });
      });
    });
