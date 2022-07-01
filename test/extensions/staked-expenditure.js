/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, MINING_CYCLE_DURATION, CHALLENGE_RESPONSE_WINDOW_DURATION, ADDRESS_ZERO } = require("../../helpers/constants");
const { setupRandomColony } = require("../../helpers/test-data-generator");
const {
  checkErrorRevert,
  web3GetCode,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
} = require("../../helpers/test-helper");

const PatriciaTree = require("../../packages/reputation-miner/patricia");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");
const EtherRouter = artifacts.require("EtherRouter");
const StakedExpenditure = artifacts.require("StakedExpenditure");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");

const STAKED_EXPENDITURE = soliditySha3("StakedExpenditure");

contract("StakedExpenditure", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let tokenLocking;
  let stakedExpenditure;
  let version;

  let reputationTree;
  let domain1Key;
  let domain1Value;
  let domain1Mask;
  let domain1Siblings;

  let requiredStake;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const MINER = accounts[5];

  const CANCELLED = 1;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    const extension = await StakedExpenditure.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(STAKED_EXPENDITURE, version);

    const stakedExpenditureAddress = await colonyNetwork.getExtensionInstallation(STAKED_EXPENDITURE, colony.address);
    stakedExpenditure = await StakedExpenditure.at(stakedExpenditureAddress);

    await colony.setArbitrationRole(1, UINT256_MAX, stakedExpenditure.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, stakedExpenditure.address, 1, true);

    const domain1 = await colony.getDomain(1);

    reputationTree = new PatriciaTree();
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(WAD.muln(3), 1)
    );

    // Used to create invalid proofs
    await reputationTree.insert(
      makeReputationKey(ADDRESS_ZERO, domain1.skillId), // Bad colony
      makeReputationValue(WAD, 2)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, 100), // Bad skill
      makeReputationValue(WAD, 3)
    );
    await reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // Bad user
      makeReputationValue(WAD, 4)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(WAD.muln(3), 1);
    [domain1Mask, domain1Siblings] = await reputationTree.getProof(domain1Key);

    const rootHash = await reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
    await repCycle.confirmNewHash(0, { from: MINER });
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      stakedExpenditure = await StakedExpenditure.new();
      await stakedExpenditure.install(colony.address);

      await checkErrorRevert(stakedExpenditure.install(colony.address), "extension-already-installed");

      const identifier = await stakedExpenditure.identifier();
      expect(identifier).to.equal(STAKED_EXPENDITURE);

      const capabilityRoles = await stakedExpenditure.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await stakedExpenditure.finishUpgrade();
      await stakedExpenditure.deprecate(true);
      await stakedExpenditure.uninstall();

      const code = await web3GetCode(stakedExpenditure.address);
      expect(code).to.equal("0x");
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      await checkErrorRevert(stakedExpenditure.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stakedExpenditure.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stakedExpenditure.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(stakedExpenditure.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(STAKED_EXPENDITURE, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(STAKED_EXPENDITURE, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(STAKED_EXPENDITURE, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(STAKED_EXPENDITURE, { from: USER0 });
    });
  });

  describe("using stakes to manage expenditures", async () => {
    beforeEach(async () => {
      await stakedExpenditure.setStakeFraction(WAD.divn(10)); // Stake of .3 WADs
      requiredStake = WAD.muln(3).divn(10);

      await token.mint(USER0, WAD);
      await token.approve(tokenLocking.address, WAD, { from: USER0 });
      await tokenLocking.deposit(token.address, WAD, false, { from: USER0 });
      await colony.approveStake(stakedExpenditure.address, 1, WAD, { from: USER0 });

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("can set the stake fraction", async () => {
      await stakedExpenditure.setStakeFraction(WAD, { from: USER0 });

      const stakeFraction = await stakedExpenditure.getStakeFraction();
      expect(stakeFraction).to.eq.BN(WAD);

      // But not if not root!
      await checkErrorRevert(stakedExpenditure.setStakeFraction(WAD, { from: USER1 }), "staked-expenditure-caller-not-root");

      // Also not greater than WAD!
      await checkErrorRevert(stakedExpenditure.setStakeFraction(WAD.addn(1), { from: USER0 }), "staked-expenditure-value-too-large");
    });

    it("can create an expenditure by submitting a stake", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      const { owner } = await colony.getExpenditure(expenditureId);
      expect(owner).to.equal(USER0);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.eq.BN(requiredStake);

      const stake = await stakedExpenditure.getStake(expenditureId);
      expect(stake.creator).to.equal(USER0);
      expect(stake.amount).to.eq.BN(requiredStake);
    });

    it("cannot create an expenditure with an invalid proof", async () => {
      const domain1 = await colony.getDomain(1);

      let key;
      let value;
      let mask;
      let siblings;

      key = makeReputationKey(colony.address, domain1.skillId);
      value = makeReputationValue(WAD, 10);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(
        stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, key, value, mask, siblings),
        "staked-expenditure-invalid-root-hash"
      );

      key = makeReputationKey(ADDRESS_ZERO, domain1.skillId);
      value = makeReputationValue(WAD, 2);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(
        stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, key, value, mask, siblings),
        "staked-expenditure-invalid-colony-address"
      );

      key = makeReputationKey(colony.address, 100);
      value = makeReputationValue(WAD, 3);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(
        stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, key, value, mask, siblings),
        "staked-expenditure-invalid-skill-id"
      );

      key = makeReputationKey(colony.address, domain1.skillId, USER0);
      value = makeReputationValue(WAD, 4);
      [mask, siblings] = await reputationTree.getProof(key);
      await checkErrorRevert(
        stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, key, value, mask, siblings),
        "staked-expenditure-invalid-user-address"
      );
    });

    it("cannot create an expenditure if the extension is deprecated", async () => {
      await colony.deprecateExtension(STAKED_EXPENDITURE, true);

      await checkErrorRevert(
        stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 }),
        "colony-extension-deprecated"
      );
    });

    it("can slash the stake with the arbitration permission", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      await colony.lockExpenditure(expenditureId);

      await stakedExpenditure.cancelAndPunish(1, UINT256_MAX, 1, UINT256_MAX, expenditureId, true);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD.sub(requiredStake));

      // Creator gets a reputation penalty
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numUpdates = await repCycle.getReputationUpdateLogLength();
      const repUpdate = await repCycle.getReputationUpdateLogEntry(numUpdates.subn(1));
      const domain1 = await colony.getDomain(1);

      expect(repUpdate.user).to.equal(USER0);
      expect(repUpdate.amount).to.eq.BN(requiredStake.neg());
      expect(repUpdate.skillId).to.eq.BN(domain1.skillId);

      // And the expenditure is automatically cancelled
      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(CANCELLED);
    });

    it("cannot slash the stake without the arbitration permission", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      await colony.lockExpenditure(expenditureId);

      await checkErrorRevert(
        stakedExpenditure.cancelAndPunish(1, UINT256_MAX, 1, UINT256_MAX, expenditureId, true, { from: USER1 }),
        "staked-expenditure-caller-not-arbitration"
      );
    });

    it("can cancel the expenditure without penalty", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      await colony.lockExpenditure(expenditureId);

      await stakedExpenditure.cancelAndPunish(1, UINT256_MAX, 1, UINT256_MAX, expenditureId, false);

      let obligation;
      let userLock;

      obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.eq.BN(requiredStake);

      userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);

      const expenditure = await colony.getExpenditure(expenditureId);
      expect(expenditure.status).to.eq.BN(CANCELLED);

      // User can reclaim the stake
      await stakedExpenditure.reclaimStake(expenditureId);

      obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("if ownership is transferred, the original owner is still slashed", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();
      await colony.lockExpenditure(expenditureId);

      await colony.transferExpenditure(expenditureId, USER1, { from: USER0 });

      await stakedExpenditure.cancelAndPunish(1, UINT256_MAX, 1, UINT256_MAX, expenditureId, true);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD.sub(requiredStake));
    });

    it("cannot slash a nonexistent stake", async () => {
      await colony.makeExpenditure(1, UINT256_MAX, 1);
      const expenditureId = await colony.getExpenditureCount();
      await colony.lockExpenditure(expenditureId);

      await checkErrorRevert(
        stakedExpenditure.cancelAndPunish(1, UINT256_MAX, 1, UINT256_MAX, expenditureId, true),
        "staked-expenditure-nothing-to-slash"
      );
    });

    it("can reclaim the stake by cancelling the expenditure", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.cancelExpenditure(expenditureId);

      await stakedExpenditure.reclaimStake(expenditureId);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("can cancel and reclaim the stake in one transaction", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await stakedExpenditure.cancelAndReclaimStake(1, UINT256_MAX, expenditureId);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("cannot cancel and reclaim the stake in one transaction if not owner", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(
        stakedExpenditure.cancelAndReclaimStake(1, UINT256_MAX, expenditureId, { from: USER1 }),
        "staked-expenditure-must-be-owner"
      );
    });

    it("can reclaim the stake by finalizing the expenditure", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await colony.finalizeExpenditure(expenditureId);

      await stakedExpenditure.reclaimStake(expenditureId);

      const obligation = await tokenLocking.getObligation(USER0, token.address, colony.address);
      expect(obligation).to.be.zero;

      const userLock = await tokenLocking.getUserLock(token.address, USER0);
      expect(userLock.balance).to.eq.BN(WAD);
    });

    it("cannot reclaim the stake while the expenditure is in progress", async () => {
      await stakedExpenditure.makeExpenditureWithStake(1, UINT256_MAX, 1, domain1Key, domain1Value, domain1Mask, domain1Siblings, { from: USER0 });
      const expenditureId = await colony.getExpenditureCount();

      await checkErrorRevert(stakedExpenditure.reclaimStake(expenditureId), "staked-expenditure-expenditure-invalid-state");
    });

    it("cannot reclaim a nonexistent stake", async () => {
      await checkErrorRevert(stakedExpenditure.reclaimStake(0), "staked-expenditure-nothing-to-claim");
    });
  });
});
