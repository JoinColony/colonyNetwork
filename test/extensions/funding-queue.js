/* globals artifacts */

import BN from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import { WAD, MINING_CYCLE_DURATION, DEFAULT_STAKE, SECONDS_PER_DAY } from "../../helpers/constants";
import { checkErrorRevert, makeReputationKey, makeReputationValue, getActiveRepCycle, forwardTime } from "../../helpers/test-helper";

import {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupRandomColony,
  giveUserCLNYTokensAndStake,
} from "../../helpers/test-data-generator";

import PatriciaTree from "../../packages/reputation-miner/patricia";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const FundingQueue = artifacts.require("FundingQueue");
const FundingQueueFactory = artifacts.require("FundingQueueFactory");

contract("Funding Queues", (accounts) => {
  let colony;
  let token;
  let domain1;
  // let domain2;
  // let domain3;
  let metaColony;
  let colonyNetwork;

  let fundingQueue;
  let fundingQueueFactory;

  let reputationTree;

  let colonyKey;
  let colonyValue;
  let colonyMask;
  let colonySiblings;

  let user0Key;
  let user0Value;
  let user0Mask;
  let user0Siblings;

  let user1Key;
  let user1Value;
  let user1Mask;
  let user1Siblings;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  const HEAD = 0;

  const STATE_INACTIVE = 0;
  const STATE_ACTIVE = 1;
  const STATE_COMPLETED = 2;
  const STATE_CANCELLED = 3;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    await giveUserCLNYTokensAndStake(colonyNetwork, MINER, DEFAULT_STAKE);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();

    fundingQueueFactory = await FundingQueueFactory.new();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // 1 => { 2, 3 }
    await colony.addDomain(1, 0, 1);
    await colony.addDomain(1, 0, 1);
    domain1 = await colony.getDomain(1);
    // domain2 = await colony.getDomain(2);
    // domain3 = await colony.getDomain(3);

    await fundingQueueFactory.deployExtension(colony.address);
    const fundingQueueAddress = await fundingQueueFactory.deployedExtensions(colony.address);
    fundingQueue = await FundingQueue.at(fundingQueueAddress);

    await colony.setFundingRole(1, 0, fundingQueue.address, 1, true);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total, domain 1
      makeReputationValue(WAD.muln(3), 1)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // User0
      makeReputationValue(WAD, 2)
    );
    await reputationTree.insert(
      makeReputationKey(metaColony.address, domain1.skillId, USER0), // Wrong colony
      makeReputationValue(WAD, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 1234, USER0), // Wrong skill
      makeReputationValue(WAD, 4)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER1), // User1 (and 2x value)
      makeReputationValue(WAD.muln(2), 5)
    );
    // await reputationTree.insert(
    //   makeReputationKey(colony.address, domain2.skillId), // Colony total, domain 2
    //   makeReputationValue(WAD, 6)
    // );
    // await reputationTree.insert(
    //   makeReputationKey(colony.address, domain3.skillId), // Colony total, domain 3
    //   makeReputationValue(WAD, 7)
    // );

    colonyKey = makeReputationKey(colony.address, domain1.skillId);
    colonyValue = makeReputationValue(WAD.muln(3), 1);
    [colonyMask, colonySiblings] = await reputationTree.getProof(colonyKey);

    user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
    user0Value = makeReputationValue(WAD, 2);
    [user0Mask, user0Siblings] = await reputationTree.getProof(user0Key);

    user1Key = makeReputationKey(colony.address, domain1.skillId, USER1);
    user1Value = makeReputationValue(WAD.muln(2), 5);
    [user1Mask, user1Siblings] = await reputationTree.getProof(user1Key);

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await repCycle.confirmNewHash(0);
  });

  describe("using the extension factory", async () => {
    it("can install the extension factory once if root and uninstall", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await checkErrorRevert(fundingQueueFactory.deployExtension(colony.address, { from: USER1 }), "colony-extension-user-not-root");
      await fundingQueueFactory.deployExtension(colony.address, { from: USER0 });
      await checkErrorRevert(fundingQueueFactory.deployExtension(colony.address, { from: USER0 }), "colony-extension-already-deployed");
      await fundingQueueFactory.removeExtension(colony.address, { from: USER0 });
    });
  });

  describe("creating funding proposals", async () => {
    it("can create a basic proposal", async () => {
      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposalId = await fundingQueue.getProposalCount();

      const proposal = await fundingQueue.getProposal(proposalId);
      expect(proposal.domainId).to.eq.BN(1);
      expect(proposal.state).to.eq.BN(STATE_INACTIVE);
    });

    it("cannot create a basic proposal with bad inheritence", async () => {
      await checkErrorRevert(fundingQueue.createProposal(1, 0, 0, 3, 1, WAD, token.address, { from: USER0 }), "funding-queue-bad-inheritence-from");
      await checkErrorRevert(fundingQueue.createProposal(1, 0, 0, 1, 3, WAD, token.address, { from: USER0 }), "funding-queue-bad-inheritence-to");
    });

    it("can stake a proposal", async () => {
      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposalId = await fundingQueue.getProposalCount();

      await checkErrorRevert(
        fundingQueue.stakeProposal(proposalId, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER1 }),
        "funding-queue-not-creator"
      );

      await fundingQueue.stakeProposal(proposalId, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });

      const proposal = await fundingQueue.getProposal(proposalId);
      expect(proposal.domainTotalRep).to.eq.BN(WAD.muln(3));
      expect(proposal.state).to.eq.BN(STATE_ACTIVE);

      // But can't stake twice
      await checkErrorRevert(
        fundingQueue.stakeProposal(proposalId, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 }),
        "funding-queue-not-inactive"
      );
    });

    it("can cancel a proposal, if creator", async () => {
      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposalId = await fundingQueue.getProposalCount();

      await checkErrorRevert(fundingQueue.cancelProposal(proposalId, proposalId, { from: USER1 }), "funding-queue-not-creator");
      await checkErrorRevert(fundingQueue.cancelProposal(proposalId, HEAD, { from: USER0 }), "funding-queue-bad-prev-id");

      await fundingQueue.cancelProposal(proposalId, proposalId, { from: USER0 });

      const proposal = await fundingQueue.getProposal(proposalId);
      expect(proposal.state).to.eq.BN(STATE_CANCELLED);

      const nextId = await fundingQueue.getNextProposalId(proposalId);
      expect(nextId).to.be.zero;

      // But can't cancel twice
      await checkErrorRevert(fundingQueue.cancelProposal(proposalId, proposalId, { from: USER0 }), "funding-queue-already-cancelled");
    });
  });

  describe("backing funding proposals", async () => {
    let proposalId;

    beforeEach(async () => {
      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      proposalId = await fundingQueue.getProposalCount();

      await fundingQueue.stakeProposal(proposalId, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });
    });

    it("can back a basic proposal", async () => {
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const headId = await fundingQueue.getHeadId();
      expect(headId).to.eq.BN(proposalId);

      const support = await fundingQueue.getSupport(proposalId, USER0);
      expect(support).to.eq.BN(WAD);
    });

    it("cannot back a basic proposal with a bad reputation proof", async () => {
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, "0x0", "0x0", "0x0", [], { from: USER0 }),
        "funding-queue-invalid-root-hash"
      );
    });

    it("cannot back a basic proposal with the wrong user address", async () => {
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER1 }),
        "funding-queue-invalid-user-address"
      );
    });

    it("cannot back a basic proposal with the wrong domain skill id", async () => {
      const key = makeReputationKey(colony.address, 1234, USER0);
      const value = makeReputationValue(WAD, 4);
      const [mask, siblings] = await reputationTree.getProof(key);

      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, key, value, mask, siblings, { from: USER0 }),
        "funding-queue-invalid-skill-id"
      );
    });

    it("cannot back a basic proposal with the wrong colony address", async () => {
      const key = makeReputationKey(metaColony.address, domain1.skillId, USER0);
      const value = makeReputationValue(WAD, 3);
      const [mask, siblings] = await reputationTree.getProof(key);

      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, key, value, mask, siblings, { from: USER0 }),
        "funding-queue-invalid-colony-address"
      );
    });

    it("cannot back a nonexistent basic proposal", async () => {
      await checkErrorRevert(
        fundingQueue.backProposal(0, 0, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-proposal-not-active"
      );
    });

    it("cannot back a basic proposal twice", async () => {
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-already-supported"
      );
    });

    it("cannot put a basic proposal after itself", async () => {
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, proposalId, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-cannot-insert-after-self"
      );
    });

    it("cannot put a basic proposal after a nonexistent proposal", async () => {
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, 10, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-excess-support"
      );
    });

    it("cannot pass a false current location", async () => {
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, 10, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-bad-prev-id"
      );
    });

    it("cannot put a basic proposal before a more popular proposal", async () => {
      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal2Id = await fundingQueue.getProposalCount();
      await fundingQueue.stakeProposal(proposal2Id, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });

      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal3Id = await fundingQueue.getProposalCount();
      await fundingQueue.stakeProposal(proposal3Id, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });

      // Put proposal2 in position 1 (3 wad support) and proposal3 in position 2 (2 wad support)
      await fundingQueue.backProposal(proposal2Id, proposal2Id, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backProposal(proposal2Id, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await fundingQueue.backProposal(proposal3Id, proposal3Id, proposal2Id, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // Can't put proposal in position 1
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-insufficient-support"
      );

      // Can't put proposal in position 2
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, proposal2Id, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-insufficient-support"
      );

      // But can in position 3 (1 wad support)
      await fundingQueue.backProposal(proposalId, proposalId, proposal3Id, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const nextProposalId = await fundingQueue.getNextProposalId(proposal3Id);
      expect(nextProposalId).to.eq.BN(proposalId);
    });

    it("cannot put a basic proposal after a less popular proposal", async () => {
      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal2Id = await fundingQueue.getProposalCount();
      await fundingQueue.stakeProposal(proposal2Id, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });

      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal3Id = await fundingQueue.getProposalCount();
      await fundingQueue.stakeProposal(proposal3Id, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });

      // Put proposal2 in position 1 (3 wad support) and proposal3 in position 2 (1 wad support)
      await fundingQueue.backProposal(proposal2Id, proposal2Id, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backProposal(proposal2Id, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await fundingQueue.backProposal(proposal3Id, proposal3Id, proposal2Id, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Can't put proposal in position 1
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "funding-queue-insufficient-support"
      );

      // Can't put proposal in position 3
      await checkErrorRevert(
        fundingQueue.backProposal(proposalId, proposalId, proposal3Id, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "funding-queue-excess-support"
      );

      // But can in position 2 (2 wad support) and bump proposal3 to position 3
      await fundingQueue.backProposal(proposalId, proposalId, proposal2Id, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const nextProposalId = await fundingQueue.getNextProposalId(proposal2Id);
      expect(nextProposalId).to.eq.BN(proposalId);
    });
  });

  describe("pinging funding proposals", async () => {
    let proposalId;

    beforeEach(async () => {
      await token.mint(colony.address, WAD);
      await colony.claimColonyFunds(token.address);

      await fundingQueue.createProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      proposalId = await fundingQueue.getProposalCount();

      await fundingQueue.stakeProposal(proposalId, colonyKey, colonyValue, colonyMask, colonySiblings, { from: USER0 });
    });

    it("can transfer 1/2 of funds after one week, with full backing", async () => {
      // Back proposal with 100% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backProposal(proposalId, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance one week
      await forwardTime(SECONDS_PER_DAY * 7, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So half the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("499999999999999922"); // close enough
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can transfer 3/4 of funds after two weeks, with full backing", async () => {
      // Back proposal with 100% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backProposal(proposalId, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance two weeks
      await forwardTime(SECONDS_PER_DAY * 14, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So 3/4 of the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("749999999999999922"); // close enough
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can transfer 3/4 of funds after two weeks, one week at a time, with full backing", async () => {
      // Back proposal with 100% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backProposal(proposalId, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance one week
      await forwardTime(SECONDS_PER_DAY * 7, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // Advance another week
      await forwardTime(SECONDS_PER_DAY * 7, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So 3/4 of the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("749999999999999922"); // close enough
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can transfer ~1/6 of funds after one week, with 1/3 reputation backing", async () => {
      // Back proposal with 33% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance two weeks
      await forwardTime(SECONDS_PER_DAY * 7, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So 1/3 * 1/2 = ~1/6 (16.6%) of the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("206047343492625919"); // Actually 20%, +4%
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can transfer ~2/6 of funds after one week, with 2/3 reputation backing", async () => {
      // Back proposal with 66% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance one week
      await forwardTime(SECONDS_PER_DAY * 7, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So 2/3 * 1/2 = ~1/3 (33.3%) of the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("369839175331723310"); // Actually 37%, +4%
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can transfer ~1/3 of funds after two weeks, with 1/3 reputation backing", async () => {
      // Back proposal with 33% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance two weeks
      await forwardTime(SECONDS_PER_DAY * 14, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So 1/3 * 1/2 * 2 = ~1/3 (33.3%) of the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("369639179224883664"); // Actually 37%, +4%
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can transfer ~2/3 of funds after two weeks, with 2/3 reputation backing", async () => {
      // Back proposal with 66% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      const balanceBefore = await colony.getFundingPotBalance(1, token.address);

      // Advance two weeks
      await forwardTime(SECONDS_PER_DAY * 14, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      // So (2/3 * 1/2) **  2 = ~2/3 (66.6%) of the balance should be transferred
      const balanceAfter = await colony.getFundingPotBalance(1, token.address);
      const amountTransferred = balanceBefore.sub(balanceAfter);
      const expectedTransferred = new BN("602897335053397444"); // Actually 60%, -6%
      expect(amountTransferred).to.eq.BN(expectedTransferred);
    });

    it("can close a proposal once fulfilled", async () => {
      // Set balance to 2 WAD
      await token.mint(colony.address, WAD);
      await colony.claimColonyFunds(token.address);

      // Back proposal with 100% of reputation
      await fundingQueue.backProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backProposal(proposalId, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // Actually just the null proposal but let's ignore that for now
      const nextId = await fundingQueue.getNextProposalId(proposalId);

      // Advance a little more than one week
      await forwardTime(SECONDS_PER_DAY * 8, this);
      await fundingQueue.pingProposal(proposalId, 1, 0, 0);

      const proposal = await fundingQueue.getProposal(proposalId);
      expect(proposal.state).to.eq.BN(STATE_COMPLETED);

      const headId = await fundingQueue.getHeadId();
      expect(headId).to.eq.BN(nextId);

      // Make sure the next proposal's timestamp is also updated
      const nextProposal = await fundingQueue.getProposal(headId);
      expect(proposal.lastUpdated).to.eq.BN(nextProposal.lastUpdated);

      // Can't cancel once completed
      await checkErrorRevert(fundingQueue.cancelProposal(proposalId, proposalId, { from: USER0 }), "funding-queue-already-completed");

      // TODO: Check that stake is automatically returned
    });

    it("cannot ping a proposal if it not at the head of the queue", async () => {
      await checkErrorRevert(fundingQueue.pingProposal(proposalId, 1, 0, 0), "funding-queue-proposal-not-head");
    });
  });
});
