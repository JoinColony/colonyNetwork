/* globals artifacts, hre */

const path = require("path");
const request = require("async-request");
const chai = require("chai");
const bnChai = require("bn-chai");
const ethers = require("ethers");

const { TruffleLoader } = require("../../packages/package-utils");
const { DEFAULT_STAKE, INITIAL_FUNDING } = require("../../helpers/constants");
const { makeReputationKey, advanceMiningCycleNoContest, getActiveRepCycle, TestAdapter, getChainId } = require("../../helpers/test-helper");
const {
  fundColonyWithTokens,
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  giveUserCLNYTokensAndStake,
  setupClaimedExpenditure,
} = require("../../helpers/test-data-generator");
const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const ReputationMinerClient = require("../../packages/reputation-miner/ReputationMinerClient");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ITokenLocking = artifacts.require("ITokenLocking");

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

const realProviderPort = 8545;

hre.__SOLIDITY_COVERAGE_RUNNING
  ? contract.skip
  : contract("Reputation mining - client core functionality", (accounts) => {
      const MINER1 = accounts[5];

      let miningSkillId;

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
        const chainId = await getChainId();
        await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

        const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
        expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

        reputationMiner = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, realProviderPort, useJsTree: true });

        miningSkillId = await colonyNetwork.getReputationMiningSkillId();
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
        await reputationMiner.initialise(colonyNetwork.address);
        await reputationMiner.resetDB();
        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
        await reputationMiner.saveCurrentState();

        const adapter = new TestAdapter();

        client = new ReputationMinerClient({ loader, realProviderPort, minerAddress: MINER1, useJsTree: true, auto: false, adapter });
      });

      afterEach(async () => {
        await client.close();
      });

      describe("core functionality", () => {
        it("should correctly respond to a request for a reputation state in the current state", async () => {
          await client.initialise(colonyNetwork.address, 1);
          const rootHash = await reputationMiner.getRootHash();
          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/${miningSkillId}/${MINER1}`;
          const res = await request(url);
          expect(res.statusCode).to.equal(200);

          const oracleProofObject = JSON.parse(res.body);
          const key = makeReputationKey(metaColony.address, miningSkillId, MINER1);

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

        it("should correctly respond to a request for a reputation state in previous states", async () => {
          await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(100));
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, worker: MINER1, manager: accounts[6] });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

          const rootHash = await reputationMiner.getRootHash();
          const key = makeReputationKey(metaColony.address, miningSkillId, MINER1);
          const [branchMask, siblings] = await reputationMiner.getProof(key);
          const value = reputationMiner.reputations[key];

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          const rootHash2 = await reputationMiner.getRootHash();
          const [branchMask2, siblings2] = await reputationMiner.getProof(key);
          const value2 = reputationMiner.reputations[key];

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          const rootHash3 = await reputationMiner.getRootHash();
          const [branchMask3, siblings3] = await reputationMiner.getProof(key);
          const value3 = reputationMiner.reputations[key];

          await client.initialise(colonyNetwork.address, 1);

          let url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/${miningSkillId}/${MINER1}`;
          let res = await request(url);

          expect(res.statusCode).to.equal(200);

          let oracleProofObject = JSON.parse(res.body);
          expect(branchMask).to.equal(oracleProofObject.branchMask);
          expect(siblings.length).to.equal(oracleProofObject.siblings.length);

          for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
            expect(siblings[i]).to.equal(oracleProofObject.siblings[i]);
          }

          expect(key).to.equal(oracleProofObject.key);
          expect(value).to.equal(oracleProofObject.value);

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

          // Different URL so we don't hit the cache.
          url = `http://127.0.0.1:3000/${rootHash2}/${metaColony.address}/${miningSkillId}/${MINER1}`;
          res = await request(url);
          expect(res.statusCode).to.equal(200);

          oracleProofObject = JSON.parse(res.body);
          expect(branchMask2).to.equal(oracleProofObject.branchMask);
          expect(siblings2.length).to.equal(oracleProofObject.siblings.length);

          for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
            expect(siblings2[i]).to.equal(oracleProofObject.siblings[i]);
          }

          expect(key).to.equal(oracleProofObject.key);
          expect(value2).to.equal(oracleProofObject.value);

          // Different URL so we don't hit the cache.
          url = `http://127.0.0.1:3000/${rootHash3}/${metaColony.address}/${miningSkillId}/${MINER1}`;
          res = await request(url);
          expect(res.statusCode).to.equal(200);

          oracleProofObject = JSON.parse(res.body);
          expect(branchMask3).to.equal(oracleProofObject.branchMask);
          expect(siblings3.length).to.equal(oracleProofObject.siblings.length);

          for (let i = 0; i < oracleProofObject.siblings.length; i += 1) {
            expect(siblings3[i]).to.equal(oracleProofObject.siblings[i]);
          }

          expect(key).to.equal(oracleProofObject.key);
          expect(value3).to.equal(oracleProofObject.value);
        });

        it("should correctly respond to a request for a reputation state in previous states with no proof", async () => {
          await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(100));
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, worker: MINER1, manager: accounts[6] });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

          const rootHash = await reputationMiner.getRootHash();
          const key = makeReputationKey(metaColony.address, miningSkillId, MINER1);
          const value = reputationMiner.reputations[key];

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          const rootHash2 = await reputationMiner.getRootHash();
          const value2 = reputationMiner.reputations[key];

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          const rootHash3 = await reputationMiner.getRootHash();
          const value3 = reputationMiner.reputations[key];

          await client.initialise(colonyNetwork.address, 1);

          let url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/${miningSkillId}/${MINER1}/noProof`;
          let res = await request(url);
          expect(res.statusCode).to.equal(200);

          let oracleProofObject = JSON.parse(res.body);
          expect(undefined).to.equal(oracleProofObject.branchMask);
          expect(undefined).to.equal(oracleProofObject.siblings);

          expect(key).to.equal(oracleProofObject.key);
          expect(value).to.equal(oracleProofObject.value);

          // Different URL so we don't hit the cache.
          url = `http://127.0.0.1:3000/${rootHash2}/${metaColony.address}/${miningSkillId}/${MINER1}/noProof`;
          res = await request(url);
          expect(res.statusCode).to.equal(200);

          oracleProofObject = JSON.parse(res.body);
          expect(undefined).to.equal(oracleProofObject.branchMask);
          expect(undefined).to.equal(oracleProofObject.siblings);

          expect(key).to.equal(oracleProofObject.key);
          expect(value2).to.equal(oracleProofObject.value);

          url = `http://127.0.0.1:3000/${rootHash3}/${metaColony.address}/${miningSkillId}/${MINER1}/noProof`;
          res = await request(url);
          expect(res.statusCode).to.equal(200);

          oracleProofObject = JSON.parse(res.body);
          expect(undefined).to.equal(oracleProofObject.branchMask);
          expect(undefined).to.equal(oracleProofObject.siblings);

          expect(key).to.equal(oracleProofObject.key);
          expect(value3).to.equal(oracleProofObject.value);
        });

        it("should correctly respond to a request for a valid key in a reputation state that never existed", async () => {
          await client.initialise(colonyNetwork.address, 1);
          const rootHash = await reputationMiner.getRootHash();
          const url = `http://127.0.0.1:3000/0x${rootHash.slice(8)}000000/${metaColony.address}/${miningSkillId}/${MINER1}`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("No such reputation state");
        });

        it("should correctly respond to a request for a valid key that didn't exist in a valid past reputation state", async () => {
          const rootHash = await reputationMiner.getRootHash();

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await client.initialise(colonyNetwork.address, 1);

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/${accounts[4]}`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("Requested reputation does not exist");
        });

        it("should correctly respond to a request for an invalid key in a valid past reputation state", async () => {
          const rootHash = await reputationMiner.getRootHash();

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await client.initialise(colonyNetwork.address, 1);

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/2/notAKey`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("One of the parameters was incorrect");
        });

        it("should correctly respond to a request for users that have a particular reputation in a colony", async () => {
          await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(100));
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, worker: MINER1, manager: accounts[6] });

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

          let rootHash = await reputationMiner.getRootHash();
          await reputationMiner.saveCurrentState();
          await client.initialise(colonyNetwork.address, 1);

          const domain1 = await metaColony.getDomain(1);

          // Note that we're testing here with one URL with a trailing slash and one without.
          // Both should work
          let url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/${domain1.skillId}`;
          let res = await request(url);
          expect(res.statusCode).to.equal(200);
          let { addresses, reputations } = JSON.parse(res.body);
          expect(addresses.length).to.equal(2);
          expect(addresses[0]).to.equal(MINER1.toLowerCase());
          expect(addresses[1]).to.equal(accounts[6].toLowerCase());

          expect(reputations.length).to.equal(2);

          // Let's check that once accounts[6] has more reputation again, it's listed first.
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, worker: accounts[6], manager: accounts[6] });
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, worker: accounts[6], manager: accounts[6] });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          rootHash = await reputationMiner.reputationTree.getRootHash();
          await reputationMiner.saveCurrentState();
          url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/${domain1.skillId}/`;

          res = await request(url);
          expect(res.statusCode).to.equal(200);

          ({ addresses, reputations } = JSON.parse(res.body));
          expect(addresses.length).to.equal(2);
          expect(addresses[0]).to.equal(accounts[6].toLowerCase());
          expect(addresses[1]).to.equal(MINER1.toLowerCase());

          expect(reputations.length).to.equal(2);
        });

        it("should correctly respond to a request for users that have a particular reputation in a colony that has an invalid address", async () => {
          await client.initialise(colonyNetwork.address, 1);
          const url = `http://127.0.0.1:3000/0x0000/NotAValidAddress/1`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("One of the parameters was incorrect");
        });

        it("should correctly respond to a request for all reputation a single user has in a colony", async () => {
          await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(100));

          await metaColony.addLocalSkill();
          const localSkillId = await colonyNetwork.getSkillCount();

          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: MINER1, manager: accounts[6] });

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });

          let rootHash = await reputationMiner.getRootHash();
          await reputationMiner.saveCurrentState();
          await client.initialise(colonyNetwork.address, 1);

          const url = `http://127.0.0.1:3000/${rootHash}/${metaColony.address}/${MINER1}/all`;
          let res = await request(url);
          expect(res.statusCode).to.equal(200);
          let { reputations } = JSON.parse(res.body);
          expect(reputations.length).to.equal(4);

          // More people get reputation doesn't change anything
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, skillId: localSkillId, worker: accounts[6], manager: accounts[6] });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner, test: this });
          rootHash = await reputationMiner.reputationTree.getRootHash();
          await reputationMiner.saveCurrentState();

          res = await request(url);
          expect(res.statusCode).to.equal(200);

          ({ reputations } = JSON.parse(res.body));
          expect(reputations.length).to.equal(4);
        });

        it("should correctly respond to a request for all reputation a single user has in a colony that has an invalid address", async () => {
          await client.initialise(colonyNetwork.address, 1);
          const url = `http://127.0.0.1:3000/0x0000/NotAValidAddress/1/all`;
          const res = await request(url);
          expect(res.statusCode).to.equal(400);
          expect(res.statusCode).to.equal(400);
          expect(JSON.parse(res.body).message).to.equal("One of the parameters was incorrect");
        });
      });
    });
