/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";

import { WAD, MINING_CYCLE_DURATION, DEFAULT_STAKE } from "../../helpers/constants";
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
  let domain2;
  let domain3;
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
    domain2 = await colony.getDomain(2);
    domain3 = await colony.getDomain(3);

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
    await reputationTree.insert(
      makeReputationKey(colony.address, domain2.skillId), // Colony total, domain 2
      makeReputationValue(WAD, 6)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain3.skillId), // Colony total, domain 3
      makeReputationValue(WAD, 7)
    );

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

  describe.only("creating funding proposals", async () => {
    it("can create a basic proposal", async () => {
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });

      const proposalId = await fundingQueue.getProposalCount();
      const proposal = await fundingQueue.getProposal(proposalId);
      expect(proposal.domainSkillId).to.eq.BN(domain1.skillId);
    });

    it("can update a basic proposal with the latest reputation state", async () => {
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });

      const proposalId = await fundingQueue.getProposalCount();
      await fundingQueue.updateProposalTotalRep(proposalId, colonyKey, colonyValue, colonyMask, colonySiblings);

      const proposal = await fundingQueue.getProposal(proposalId);
      expect(proposal.domainTotalRep).to.eq.BN(WAD.muln(3));
    });

    it("cannot create a basic proposal with bad inheritence", async () => {
      await checkErrorRevert(
        fundingQueue.createBasicProposal(1, 0, 0, 3, 1, WAD, token.address, { from: USER0 }),
        "funding-queue-bad-inheritence-from"
      );
      await checkErrorRevert(
        fundingQueue.createBasicProposal(1, 0, 0, 1, 3, WAD, token.address, { from: USER0 }),
        "funding-queue-bad-inheritence-to"
      );
    });
  });

  describe.only("backing funding proposals", async () => {
    let proposalId;

    beforeEach(async () => {
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      proposalId = await fundingQueue.getProposalCount();
    });

    it("can back a basic proposal", async () => {
      await fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const headId = await fundingQueue.getHeadId();
      expect(headId).to.eq.BN(proposalId);

      const support = await fundingQueue.getSupport(proposalId, USER0);
      expect(support).to.eq.BN(WAD);
    });

    it("cannot back a basic proposal with a bad reputation proof", async () => {
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, "0x0", "0x0", "0x0", [], { from: USER0 }),
        "funding-queue-invalid-root-hash"
      );
    });

    it("cannot back a basic proposal with the wrong user address", async () => {
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER1 }),
        "funding-queue-invalid-user-address"
      );
    });

    it("cannot back a basic proposal with the wrong domain skill id", async () => {
      const key = makeReputationKey(colony.address, 1234, USER0);
      const value = makeReputationValue(WAD, 4);
      const [mask, siblings] = await reputationTree.getProof(key);

      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, key, value, mask, siblings, { from: USER0 }),
        "funding-queue-invalid-skill-id"
      );
    });

    it("cannot back a basic proposal with the wrong colony address", async () => {
      const key = makeReputationKey(metaColony.address, domain1.skillId, USER0);
      const value = makeReputationValue(WAD, 3);
      const [mask, siblings] = await reputationTree.getProof(key);

      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, key, value, mask, siblings, { from: USER0 }),
        "funding-queue-invalid-colony-address"
      );
    });

    it("cannot back a nonexistent basic proposal", async () => {
      await checkErrorRevert(
        fundingQueue.backBasicProposal(0, 0, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-proposal-not-active"
      );
    });

    it("cannot back a basic proposal twice", async () => {
      await fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-already-supported"
      );
    });

    it("cannot put a basic proposal after itself", async () => {
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, 1, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-cannot-insert-after-self"
      );
    });

    it("cannot put a basic proposal after a nonexistent proposal", async () => {
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, 10, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-excess-support"
      );
    });

    it("cannot put a basic proposal before a more popular proposal", async () => {
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal2Id = await fundingQueue.getProposalCount();
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal3Id = await fundingQueue.getProposalCount();

      // Put proposal2 in position 1 (3 wad support) and proposal3 in position 2 (2 wad support)
      await fundingQueue.backBasicProposal(proposal2Id, proposal2Id, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backBasicProposal(proposal2Id, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await fundingQueue.backBasicProposal(proposal3Id, proposal3Id, proposal2Id, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      // Can't put proposal in position 1
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-insufficient-support"
      );

      // Can't put proposal in position 2
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, proposal2Id, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 }),
        "funding-queue-insufficient-support"
      );

      // But can in position 3 (1 wad support)
      await fundingQueue.backBasicProposal(proposalId, proposalId, proposal3Id, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      const nextProposalId = await fundingQueue.getNextProposalId(proposal3Id);
      expect(nextProposalId).to.eq.BN(proposalId);
    });

    it("cannot put a basic proposal after a less popular proposal", async () => {
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal2Id = await fundingQueue.getProposalCount();
      await fundingQueue.createBasicProposal(1, 0, 0, 1, 2, WAD, token.address, { from: USER0 });
      const proposal3Id = await fundingQueue.getProposalCount();

      // Put proposal2 in position 1 (3 wad support) and proposal3 in position 2 (1 wad support)
      await fundingQueue.backBasicProposal(proposal2Id, proposal2Id, HEAD, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await fundingQueue.backBasicProposal(proposal2Id, HEAD, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });
      await fundingQueue.backBasicProposal(proposal3Id, proposal3Id, proposal2Id, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      // Can't put proposal in position 1
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, HEAD, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "funding-queue-insufficient-support"
      );

      // Can't put proposal in position 3
      await checkErrorRevert(
        fundingQueue.backBasicProposal(proposalId, proposalId, proposal3Id, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 }),
        "funding-queue-excess-support"
      );

      // But can in position 2 (2 wad support) and bump proposal3 to position 3
      await fundingQueue.backBasicProposal(proposalId, proposalId, proposal2Id, user1Key, user1Value, user1Mask, user1Siblings, { from: USER1 });

      const nextProposalId = await fundingQueue.getNextProposalId(proposal2Id);
      expect(nextProposalId).to.eq.BN(proposalId);
    });
  });
});
