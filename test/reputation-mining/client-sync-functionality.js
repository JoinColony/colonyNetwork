/* globals artifacts */

import path from "path";
import chai from "chai";
import bnChai from "bn-chai";
import { TruffleLoader } from "@colony/colony-js-contract-loader-fs";

import { DEFAULT_STAKE, INITIAL_FUNDING } from "../../helpers/constants";
import { forwardTime, currentBlock, advanceMiningCycleNoContest, getActiveRepCycle } from "../../helpers/test-helper";
import { giveUserCLNYTokensAndStake, setupFinalizedTask, fundColonyWithTokens } from "../../helpers/test-data-generator";
import ReputationMinerTestWrapper from "../../packages/reputation-miner/test/ReputationMinerTestWrapper";

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
const useJsTree = true;

process.env.SOLIDITY_COVERAGE
  ? contract.skip
  : contract("Reputation mining - client sync functionality", accounts => {
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

        reputationMiner1 = new ReputationMinerTestWrapper({ loader, minerAddress: MINER1, realProviderPort, useJsTree });
        reputationMiner2 = new ReputationMinerTestWrapper({ loader, minerAddress: MINER2, realProviderPort, useJsTree });
      });

      beforeEach(async () => {
        await reputationMiner1.resetDB();
        await reputationMiner1.initialise(colonyNetwork.address);

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
          await setupFinalizedTask({ colonyNetwork, colony: metaColony });
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
          await setupFinalizedTask({ colonyNetwork, colony: metaColony });
        }

        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });
        await advanceMiningCycleNoContest({ colonyNetwork, client: reputationMiner1, test: this });

        await reputationMiner2.resetDB();
        await reputationMiner2.initialise(colonyNetwork.address);
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

          fundColonyWithTokens(metaColony, clnyToken, INITIAL_FUNDING.muln(5));
          for (let i = 0; i < 5; i += 1) {
            await setupFinalizedTask({ colonyNetwork, colony: metaColony });
          }

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

          const client1Hash = await reputationMiner1.reputationTree.getRootHash();
          const client2Hash = await reputationMiner2.reputationTree.getRootHash();
          expect(client1Hash).to.equal(client2Hash);
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
      });
    });
