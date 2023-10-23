/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");
const BN = require("bn.js");

const {
  UINT256_MAX,
  UINT128_MAX,
  WAD,
  ADDRESS_ZERO,
  MINING_CYCLE_DURATION,
  CHALLENGE_RESPONSE_WINDOW_DURATION,
  SECONDS_PER_DAY,
} = require("../../helpers/constants");
const { setupRandomColony, fundColonyWithTokens } = require("../../helpers/test-data-generator");
const {
  checkErrorRevert,
  web3GetCode,
  expectEvent,
  expectNoEvent,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
  encodeTxData,
  bn2bytes32,
} = require("../../helpers/test-helper");

const PatriciaTree = require("../../packages/reputation-miner/patricia");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const EtherRouter = artifacts.require("EtherRouter");
const StagedExpenditure = artifacts.require("StagedExpenditure");
const StakedExpenditure = artifacts.require("StakedExpenditure");
const IVotingReputation = artifacts.require("IVotingReputation");
const VotingReputation = artifacts.require("VotingReputation");

const STAGED_EXPENDITURE = soliditySha3("StagedExpenditure");

contract("Staged Expenditure", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let stagedExpenditure;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const MINER = accounts[5];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const extension = await StagedExpenditure.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(STAGED_EXPENDITURE, version);

    const stagedExpenditureAddress = await colonyNetwork.getExtensionInstallation(STAGED_EXPENDITURE, colony.address);
    stagedExpenditure = await StagedExpenditure.at(stagedExpenditureAddress);

    await colony.setArbitrationRole(1, UINT256_MAX, stagedExpenditure.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, stagedExpenditure.address, 1, true);
    await colony.setFundingRole(1, UINT256_MAX, USER0, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      stagedExpenditure = await StagedExpenditure.new();
      await stagedExpenditure.install(colony.address);

      await checkErrorRevert(stagedExpenditure.install(colony.address), "extension-already-installed");

      const identifier = await stagedExpenditure.identifier();
      expect(identifier).to.equal(STAGED_EXPENDITURE);

      const capabilityRoles = await stagedExpenditure.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await stagedExpenditure.finishUpgrade();
      await stagedExpenditure.deprecate(true);
      await stagedExpenditure.uninstall();

      const code = await web3GetCode(stagedExpenditure.address);
      expect(code).to.equal("0x");
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(stagedExpenditure.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stagedExpenditure.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stagedExpenditure.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stagedExpenditure.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(STAGED_EXPENDITURE, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(STAGED_EXPENDITURE, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(STAGED_EXPENDITURE, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(STAGED_EXPENDITURE, { from: USER0 });
    });
  });

  describe("using the extension", async () => {
    it("can create a staged payment via permissions", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);
      const domain1 = await colony.getDomain(1);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 },
      );

      // Cannot release stage if not finalized
      await checkErrorRevert(
        stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 }),
        "expenditure-not-finalized",
      );

      await colony.finalizeExpenditure(expenditureId);

      // Cannot claim until the slot is released
      await checkErrorRevert(colony.claimExpenditurePayout(expenditureId, 0, token.address), "colony-expenditure-cannot-claim");

      // Cannot release stage if not owner
      await checkErrorRevert(
        stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER1 }),
        "staged-expenditure-not-owner",
      );

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 });
      await colony.claimExpenditurePayout(expenditureId, 0, token.address);
    });

    it("can't mark an expenditure as staged if extension is deprecated", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.deprecateExtension(STAGED_EXPENDITURE, true);
      await checkErrorRevert(stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 }), "colony-extension-deprecated");
    });

    it("can create a staged payment via a stake", async () => {
      const STAKED_EXPENDITURE = soliditySha3("StakedExpenditure");
      const extension = await StakedExpenditure.new();
      const stakedExpenditureVersion = await extension.version();

      const reputationTree = new PatriciaTree();
      const domain1 = await colony.getDomain(1);
      reputationTree.insert(makeReputationKey(colony.address, domain1.skillId), makeReputationValue(WAD, 1));

      const rootHash = await reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER });

      await colony.installExtension(STAKED_EXPENDITURE, stakedExpenditureVersion);

      const stakedExpenditureAddress = await colonyNetwork.getExtensionInstallation(STAKED_EXPENDITURE, colony.address);
      const stakedExpenditure = await StakedExpenditure.at(stakedExpenditureAddress);
      await stakedExpenditure.initialise(WAD.divn(10));
      await colony.setAdministrationRole(1, UINT256_MAX, stakedExpenditure.address, 1, true);

      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);
      await token.mint(USER0, WAD);
      await token.approve(tokenLocking.address, WAD, { from: USER0 });
      await tokenLocking.deposit(token.address, WAD, false, { from: USER0 });
      await colony.approveStake(stakedExpenditure.address, 1, WAD.divn(10), { from: USER0 });

      const domain1Key = makeReputationKey(colony.address, domain1.skillId);
      const domain1Value = makeReputationValue(WAD, 1);
      const [domain1Mask, domain1Siblings] = reputationTree.getProof(domain1Key);

      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 },
      );

      await colony.finalizeExpenditure(expenditureId);

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 });

      await colony.claimExpenditurePayout(expenditureId, 0, token.address);
    });

    it("non-owners cannot set an expenditure to a staged payment", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER1 }), "staged-expenditure-not-owner");
    });

    it("if an expenditure is not in draft state, cannot be turned in to staged expenditure", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.finalizeExpenditure(expenditureId, { from: USER0 });
      await checkErrorRevert(stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 }), "expenditure-not-draft");
    });

    it("should emit an event only when an expenditure changes to or from a staged expenditure", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      let tx = await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });
      await expectEvent(tx, "ExpenditureMadeStaged", [expenditureId, true]);

      tx = await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });
      await expectNoEvent(tx, "ExpenditureMadeStaged", [expenditureId, true]);

      tx = await stagedExpenditure.setExpenditureStaged(expenditureId, false, { from: USER0 });
      await expectEvent(tx, "ExpenditureMadeStaged", [expenditureId, false]);

      tx = await stagedExpenditure.setExpenditureStaged(expenditureId, false, { from: USER0 });
      await expectNoEvent(tx, "ExpenditureMadeStaged", [expenditureId, false]);
    });

    it("can release, but not claim, a staged payment", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);
      const domain1 = await colony.getDomain(1);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, {
        from: USER0,
      });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 },
      );

      await colony.finalizeExpenditure(expenditureId);

      let slotBefore = await colony.getExpenditureSlot(expenditureId, 0);

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [], { from: USER0 });

      let slotAfter = await colony.getExpenditureSlot(expenditureId, 0);

      expect(slotBefore.claimDelay).to.equal(UINT128_MAX.toString());
      expect(slotAfter.claimDelay).to.equal("0");

      let slotPayout = await colony.getExpenditureSlotPayout(expenditureId, 0, token.address);
      expect(slotPayout).to.eq.BN(WAD);

      slotBefore = await colony.getExpenditureSlot(expenditureId, 1);

      await stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 1, [], { from: USER0 });

      slotAfter = await colony.getExpenditureSlot(expenditureId, 1);

      expect(slotBefore.claimDelay).to.equal(UINT128_MAX.toString());
      expect(slotAfter.claimDelay).to.equal("0");

      slotPayout = await colony.getExpenditureSlotPayout(expenditureId, 1, token.address);
      expect(slotPayout).to.eq.BN(WAD.muln(2));
    });

    it("cannot release a stage if not a staged payment", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(
        stagedExpenditure.releaseStagedPayment(1, UINT256_MAX, expenditureId, 0, [token.address], { from: USER0 }),
        "staged-expenditure-not-staged-expenditure",
      );
    });
  });

  describe("Interactions with other extensions", async () => {
    let domain1;
    let domain2;
    let domain3;
    let domain4;
    let voting;
    let reputationTree;
    let domain1Key;
    let domain1Value;
    let domain1Mask;
    let domain1Siblings;

    beforeEach(async () => {
      // Set up a colony with both extensions installed
      const VOTING_REPUTATION = soliditySha3("VotingReputation");

      const { colony: colony2 } = await setupRandomColony(colonyNetwork);
      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenLocking = await ITokenLocking.at(tokenLockingAddress);

      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);
      await colony.addDomain(1, UINT256_MAX, 1);
      domain1 = await colony.getDomain(1);
      domain2 = await colony.getDomain(2);
      domain3 = await colony.getDomain(3);
      domain4 = await colony.getDomain(4);

      // Install motion extension
      const extension = await VotingReputation.new();
      version = await extension.version();

      await colony.installExtension(VOTING_REPUTATION, version);
      const votingAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
      voting = await IVotingReputation.at(votingAddress);

      const TOTAL_STAKE_FRACTION = WAD.divn(1000); // 0.1 %
      const USER_MIN_STAKE_FRACTION = WAD.divn(10); // 10 %

      const MAX_VOTE_FRACTION = WAD.divn(10).muln(8); // 80 %
      const VOTER_REWARD_FRACTION = WAD.divn(10); // 10 %

      const STAKE_PERIOD = SECONDS_PER_DAY * 3;
      const SUBMIT_PERIOD = SECONDS_PER_DAY * 2;
      const REVEAL_PERIOD = SECONDS_PER_DAY * 2;
      const ESCALATION_PERIOD = SECONDS_PER_DAY;
      const REQUIRED_STAKE = WAD.muln(3).divn(1000);

      await voting.initialise(
        TOTAL_STAKE_FRACTION,
        VOTER_REWARD_FRACTION,
        USER_MIN_STAKE_FRACTION,
        MAX_VOTE_FRACTION,
        STAKE_PERIOD,
        SUBMIT_PERIOD,
        REVEAL_PERIOD,
        ESCALATION_PERIOD,
      );
      await colony.setRootRole(voting.address, true);
      await colony.setArbitrationRole(1, UINT256_MAX, voting.address, 1, true);
      await colony.setAdministrationRole(1, UINT256_MAX, voting.address, 1, true);

      await token.mint(USER0, WAD);
      await token.mint(USER1, WAD);
      await token.mint(USER2, WAD);
      await token.approve(tokenLocking.address, WAD, { from: USER0 });
      await token.approve(tokenLocking.address, WAD, { from: USER1 });
      await token.approve(tokenLocking.address, WAD, { from: USER2 });
      await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER0 });
      await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER1 });
      await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER2 });
      await colony.approveStake(voting.address, 1, WAD, { from: USER0 });
      await colony.approveStake(voting.address, 1, WAD, { from: USER1 });
      await colony.approveStake(voting.address, 1, WAD, { from: USER2 });

      reputationTree = new PatriciaTree();
      reputationTree.insert(
        makeReputationKey(colony.address, domain1.skillId), // Colony total
        makeReputationValue(WAD.muln(3), 1),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain1.skillId, USER0), // User0
        makeReputationValue(WAD, 2),
      );
      reputationTree.insert(
        makeReputationKey(colony2.address, domain1.skillId, USER0), // Wrong colony
        makeReputationValue(WAD, 3),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, 1234, USER0), // Wrong skill
        makeReputationValue(WAD, 4),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain1.skillId, USER1), // User1 (and 2x value)
        makeReputationValue(WAD.muln(2), 5),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain2.skillId), // Colony total, domain 2
        makeReputationValue(WAD, 6),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain3.skillId), // Colony total, domain 3
        makeReputationValue(WAD.muln(3), 7),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain1.skillId, USER2), // User2, very little rep
        makeReputationValue(REQUIRED_STAKE.subn(1), 8),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain2.skillId, USER0), // User0, domain 2
        makeReputationValue(WAD.divn(3), 9),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain2.skillId, USER1), // User1, domain 2
        makeReputationValue(WAD.divn(3).muln(2), 10),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain3.skillId, USER0), // User0, domain 3
        makeReputationValue(WAD, 11),
      );
      reputationTree.insert(
        makeReputationKey(colony.address, domain3.skillId, USER1), // User1, domain 3
        makeReputationValue(WAD.muln(2), 12),
      );

      reputationTree.insert(
        makeReputationKey(colony.address, domain4.skillId), // Colony total, domain 4
        makeReputationValue(0, 13),
      );

      reputationTree.insert(
        makeReputationKey(colony.address, domain4.skillId, USER1), // User1, domain 4
        makeReputationValue(0, 14),
      );

      domain1Key = makeReputationKey(colony.address, domain1.skillId);
      domain1Value = makeReputationValue(WAD.muln(3), 1);
      [domain1Mask, domain1Siblings] = reputationTree.getProof(domain1Key);

      const rootHash = reputationTree.getRootHash();
      const repCycle = await getActiveRepCycle(colonyNetwork);
      await forwardTime(MINING_CYCLE_DURATION, this);
      await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
      await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
      await repCycle.confirmNewHash(0, { from: MINER });
    });

    it("can release a staked expenditure via a motion, even if owner has no permissions", async () => {
      // Set up a staked expenditure
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      await colony.makeExpenditure(1, UINT256_MAX, 1, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      const expenditure = await colony.getExpenditure(expenditureId);

      await stagedExpenditure.setExpenditureStaged(expenditureId, true, { from: USER0 });

      await colony.setExpenditureRecipients(expenditureId, [0, 1], [USER1, USER1], { from: USER0 });
      await colony.setExpenditureClaimDelays(expenditureId, [0, 1], [UINT128_MAX, UINT128_MAX], { from: USER0 });
      await colony.setExpenditurePayouts(expenditureId, [0, 1], token.address, [WAD, WAD.muln(2)], { from: USER0 });

      await colony.lockExpenditure(expenditureId, { from: USER0 });

      await colony.moveFundsBetweenPots(
        1,
        UINT256_MAX,
        1,
        UINT256_MAX,
        UINT256_MAX,
        domain1.fundingPotId,
        expenditure.fundingPotId,
        WAD.muln(3),
        token.address,
        { from: USER0 },
      );

      await colony.finalizeExpenditure(expenditureId);

      // Remove all roles from user
      await colony.setUserRoles(1, UINT256_MAX, USER0, 1, bn2bytes32(new BN(0)));
      const roles = await colony.getUserRoles(USER0, 1);
      expect(roles).to.equal(bn2bytes32(new BN(0)));

      // Create a motion to release the staged payment and claim it
      const action1 = await encodeTxData(colony, "setExpenditureState", [
        1,
        UINT256_MAX,
        expenditureId,
        26,
        [false, true],
        [bn2bytes32(new BN(0)), bn2bytes32(new BN(1))],
        bn2bytes32(new BN(0)),
      ]);

      const action2 = await encodeTxData(colony, "claimExpenditurePayout", [expenditureId, 0, token.address]);
      const multicall = await encodeTxData(colony, "multicall", [[action1, action2]]);

      // Create a motion for this
      await voting.createMotion(1, UINT256_MAX, ADDRESS_ZERO, multicall, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      const user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
      const user0Value = makeReputationValue(WAD, 2);
      const [user0Mask, user0Siblings] = reputationTree.getProof(user0Key);
      const YAY = 1;
      const REQUIRED_STAKE = WAD.muln(3).divn(1000);

      const STAKE_PERIOD = SECONDS_PER_DAY * 3;

      await voting.stakeMotion(motionId, 1, UINT256_MAX, YAY, REQUIRED_STAKE, user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });
      await forwardTime(STAKE_PERIOD, this);

      const balanceBefore = await token.balanceOf(USER1);

      const { logs } = await voting.finalizeMotion(motionId);
      expect(logs[0].args.executed).to.be.true;

      const balanceAfter = await token.balanceOf(USER1);

      expect(balanceAfter.sub(balanceBefore)).to.eq.BN(WAD.sub(WAD.divn(100).addn(1))); // Network fee
    });
  });
});
