/* globals artifacts, ethers */

const path = require("path");
const chai = require("chai");
const bnChai = require("bn-chai");
const fs = require("fs");
const request = require("async-request");

const { TruffleLoader } = require("../../packages/package-utils");
const { DEFAULT_STAKE, INITIAL_FUNDING, UINT256_MAX } = require("../../helpers/constants");
const { forwardTime, currentBlock, advanceMiningCycleNoContest, getActiveRepCycle, TestAdapter } = require("../../helpers/test-helper");
const { giveUserCLNYTokensAndStake, setupClaimedExpenditure, fundColonyWithTokens } = require("../../helpers/test-data-generator");
const ReputationMinerTestWrapper = require("../../packages/reputation-miner/test/ReputationMinerTestWrapper");
const ReputationMinerClient = require("../../packages/reputation-miner/ReputationMinerClient");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

const useJsTree = true;
const { provider } = ethers;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation mining - client sync functionality", (accounts) => {
      const MINER1 = accounts[5];
      const MINER2 = accounts[6];

      let colonyNetwork;
      let tokenLocking;
      let metaColony;
      let clnyToken;
      let reputationMiner1;
      let reputationMiner2;
      let startingBlockNumber;

      before(async () => {
        const etherRouter = await EtherRouter.deployed();
        colonyNetwork = await IColonyNetwork.at(etherRouter.address);
        const tokenLockingAddress = await colonyNetwork.getTokenLocking();
        tokenLocking = await ITokenLocking.at(tokenLockingAddress);
        const metaColonyAddress = await colonyNetwork.getMetaColony();
        metaColony = await IMetaColony.at(metaColonyAddress);
        const clnyAddress = await metaColony.getToken();
        clnyToken = await Token.at(clnyAddress);

        reputationMiner1 = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, provider, useJsTree });
        reputationMiner2 = new ReputationMinerTestWrapper({ loader, minerAddress: MINER2, provider, useJsTree });
      });

      beforeEach(async () => {
        await reputationMiner1.initialise(colonyNetwork.address);
        await reputationMiner1.resetDB();

        const lock = await tokenLocking.getUserLock(clnyToken.address, MINER1);
        expect(lock.balance).to.eq.BN(DEFAULT_STAKE);

        // Advance two cycles to clear active and inactive state.
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, test: this });

        // The inactive reputation log now has the reward for this miner, and the accepted state is empty.
        // This is the same starting point for all tests.
        const repCycle = await getActiveRepCycle(colonyNetwork);
        const nInactiveLogEntries = await repCycle.getReputationUpdateLogLength();
        expect(nInactiveLogEntries).to.eq.BN(1);

        // Burn MAIN_ACCOUNTS accumulated mining rewards.
        const userBalance = await clnyToken.balanceOf(MINER1);
        await clnyToken.burn(userBalance, { from: MINER1 });

        const startingBlock = await currentBlock();
        startingBlockNumber = startingBlock.number;

        await giveUserCLNYTokensAndStake(colonyNetwork, MINER2, DEFAULT_STAKE);

        // Make multiple reputation cycles, with different numbers tasks and blocks in them.
        await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(5));
        for (let i = 0; i < 5; i += 1) {
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });
        }

        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

        // Advance four blocks
        await forwardTime(1, this);
        await forwardTime(1, this);
        await forwardTime(1, this);
        await forwardTime(1, this);

        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

        await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(5));
        for (let i = 0; i < 5; i += 1) {
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });
        }

        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

        await reputationMiner2.initialise(colonyNetwork.address);
        await reputationMiner2.resetDB();
      });

      describe("when synchronising reputation mining client", () => {
        // Because these tests rely on a custom, teeny-tiny-hacked version of ganache-cli, they don't work with solidity-coverage.
        // But that's okay, because these tests don't test anything meaningful in the contracts.
        it("should be able to correctly sync to the current state from scratch just from on-chain interactions", async () => {
          // Now sync reputationMiner2
          await reputationMiner2.sync(startingBlockNumber);

          // Require reputationMiner1 and reputationMiner2 have the same hashes.
          const client1Hash = await reputationMiner1.reputationTree.getRootHash();
          const client2Hash = await reputationMiner2.reputationTree.getRootHash();
          expect(client1Hash).to.equal(client2Hash);
        });

        it("should be able to correctly sync to the current state from an old, correct state", async () => {
          // Bring client up to date
          await reputationMiner2.sync(startingBlockNumber);

          // Do some additional updates.
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

          await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(5));
          for (let i = 0; i < 5; i += 1) {
            await setupClaimedExpenditure({ colonyNetwork, colony: metaColony });
          }
          await metaColony.emitDomainReputationPenalty(1, UINT256_MAX, 1, accounts[2], -100, { from: accounts[0] });

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

          // Advance four blocks
          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(1, this);
          await forwardTime(1, this);

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

          // Update it again - note that we're passing in the old startingBlockNumber still. If it applied
          // all of the updates from that block number, it would fail, because it would be replaying some
          // updates that it already knew about.
          await reputationMiner2.sync(startingBlockNumber);

          const client1Hash = await reputationMiner1.reputationTree.getRootHash();
          const client2Hash = await reputationMiner2.reputationTree.getRootHash();
          expect(client1Hash).to.equal(client2Hash);
        });

        it("should be able to correctly sync to the current state from an old, correct state loaded from the database", async () => {
          // Save to the database
          await reputationMiner1.saveCurrentState();
          const savedHash = await reputationMiner1.reputationTree.getRootHash();

          // Do some additional updates.
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

          // Tell reputationMiner to load from the database
          await reputationMiner2.loadState(savedHash);

          // Update it again - note that we're passing in the old startingBlockNumber still. If it applied
          // all of the updates from that block number, it would fail, because it would be replaying some
          // updates that it already knew about.
          await reputationMiner2.sync(startingBlockNumber);

          // And load a state on a client that's not using the JS Tree
          const reputationMiner3 = new ReputationMinerTestWrapper({ loader, minerAddress: MINER2, provider, useJsTree: !useJsTree });
          await reputationMiner3.initialise(colonyNetwork.address);
          await reputationMiner3.loadState(savedHash);
          await reputationMiner3.sync(startingBlockNumber);

          const client1Hash = await reputationMiner1.reputationTree.getRootHash();
          const client2Hash = await reputationMiner2.reputationTree.getRootHash();
          const client3Hash = await reputationMiner3.reputationTree.getRootHash();
          expect(client1Hash).to.equal(client2Hash);
          expect(client1Hash).to.equal(client3Hash);
        });

        it("should be able to successfully save the current state to the database and then load it", async () => {
          await reputationMiner1.saveCurrentState();

          const client1Hash = await reputationMiner1.reputationTree.getRootHash();
          await reputationMiner2.loadState(client1Hash);

          const client2Hash = await reputationMiner2.reputationTree.getRootHash();
          expect(client1Hash).to.equal(client2Hash);
        });

        it("should be able to correctly get the proof for a reputation in a historical state without affecting the current miner state", async () => {
          await reputationMiner1.saveCurrentState();

          const clientHash1 = await reputationMiner1.reputationTree.getRootHash();
          const key = Object.keys(reputationMiner1.reputations)[0];
          const value = reputationMiner1.reputations[key];
          const [branchMask, siblings] = await reputationMiner1.getProof(key);

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

          // So now we have a different state
          await reputationMiner1.saveCurrentState();
          const clientHash2 = await reputationMiner1.reputationTree.getRootHash();
          expect(clientHash1).to.not.equal(clientHash2);

          const [retrievedBranchMask, retrievedSiblings, retrievedValue] = await reputationMiner1.getHistoricalProofAndValue(clientHash1, key);

          // Check they're right
          expect(value).to.equal(retrievedValue);
          expect(branchMask).to.equal(retrievedBranchMask);
          expect(siblings.length).to.equal(retrievedSiblings.length);

          for (let i = 0; i < retrievedSiblings.length; i += 1) {
            expect(siblings[i]).to.equal(retrievedSiblings[i]);
          }

          const clientHash3 = await reputationMiner1.reputationTree.getRootHash();
          expect(clientHash2).to.equal(clientHash3);
        });

        it("should be able to download a sqlite file containing the latest state", async () => {
          const adapter = new TestAdapter();
          const client = new ReputationMinerClient({ loader, provider, minerAddress: MINER1, useJsTree: true, auto: false, adapter });
          await client.initialise(colonyNetwork.address, 1);

          await fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(100));
          await setupClaimedExpenditure({ colonyNetwork, colony: metaColony, token: clnyToken, worker: MINER1, manager: accounts[6] });

          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
          await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
          await reputationMiner1.saveCurrentState();

          const currentState = await colonyNetwork.getReputationRootHash();
          await colonyNetwork.getReputationRootHashNLeaves();

          const url = `http://127.0.0.1:3000/latestState`;
          const res = await request(url);
          expect(res.statusCode).to.equal(200);

          const fileName = "./latestConfirmed.sqlite";

          // Does it exist?
          expect(fs.existsSync(fileName)).to.equal(true);

          // Does it contain a valid state?
          const reputationMiner3 = new ReputationMinerTestWrapper({
            loader,
            minerAddress: MINER1,
            provider,
            useJsTree: true,
            dbPath: fileName,
          });

          await reputationMiner3.initialise(colonyNetwork.address);
          const latestBlock = await currentBlock();
          await reputationMiner3.sync(parseInt(latestBlock.number, 10));

          const loadedState = await reputationMiner3.getRootHash();
          expect(loadedState).to.equal(currentState);
          // delete it
          fs.unlinkSync(fileName);
          fs.unlinkSync(`${fileName}-shm`);
          fs.unlinkSync(`${fileName}-wal`);
          await client.close();
        });
      });
    });
