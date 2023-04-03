/* globals artifacts */

const { BN } = require("bn.js");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");

const { UINT256_MAX, WAD, MINING_CYCLE_DURATION, SECONDS_PER_DAY, CHALLENGE_RESPONSE_WINDOW_DURATION } = require("../../helpers/constants");

const {
  checkErrorRevert,
  web3GetCode,
  makeReputationKey,
  makeReputationValue,
  getActiveRepCycle,
  forwardTime,
  getBlockTime,
  expectEvent,
  encodeTxData,
} = require("../../helpers/test-helper");

const { setupRandomColony, getMetaTransactionParameters } = require("../../helpers/test-data-generator");

const PatriciaTree = require("../../packages/reputation-miner/patricia");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IReputationMiningCycle = artifacts.require("IReputationMiningCycle");
const IVotingReputation = artifacts.require("IVotingReputation");
const Korporatio = artifacts.require("Korporatio");
const TokenLocking = artifacts.require("TokenLocking");

const KORPORATIO = soliditySha3("Korporatio");
const VOTING_REPUTATION = soliditySha3("VotingReputation");

contract("Korporatio", (accounts) => {
  let colony;
  let token;
  let domain1;
  let colonyNetwork;
  let tokenLocking;

  let korporatio;
  let version;

  let reputationTree;

  let domain1Key;
  let domain1Value;
  let domain1Mask;
  let domain1Siblings;

  let user0Key;
  let user0Value;
  let user0Mask;
  let user0Siblings;

  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];
  const MINER = accounts[5];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);

    const extension = await Korporatio.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    domain1 = await colony.getDomain(1);

    await colony.installExtension(KORPORATIO, version);
    const korporatioAddress = await colonyNetwork.getExtensionInstallation(KORPORATIO, colony.address);
    korporatio = await Korporatio.at(korporatioAddress);

    await colony.setArchitectureRole(1, UINT256_MAX, USER0, 1, true);
    await colony.setArbitrationRole(1, UINT256_MAX, USER1, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, USER1, 1, true);
    await colony.setArbitrationRole(1, UINT256_MAX, korporatio.address, 1, true);

    await token.mint(USER0, WAD);
    await token.approve(tokenLocking.address, WAD, { from: USER0 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, WAD, true, { from: USER0 });

    reputationTree = new PatriciaTree();
    reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId), // Colony total
      makeReputationValue(WAD.muln(3), 1)
    );
    reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER0), // User0
      makeReputationValue(WAD.muln(2), 2)
    );
    reputationTree.insert(
      makeReputationKey(colony.address, domain1.skillId, USER1), // User1
      makeReputationValue(WAD, 3)
    );

    domain1Key = makeReputationKey(colony.address, domain1.skillId);
    domain1Value = makeReputationValue(WAD.muln(3), 1);
    [domain1Mask, domain1Siblings] = reputationTree.getProof(domain1Key);

    user0Key = makeReputationKey(colony.address, domain1.skillId, USER0);
    user0Value = makeReputationValue(WAD.muln(2), 2);
    [user0Mask, user0Siblings] = reputationTree.getProof(user0Key);

    const rootHash = reputationTree.getRootHash();
    const repCycle = await getActiveRepCycle(colonyNetwork);
    await forwardTime(MINING_CYCLE_DURATION, this);
    await repCycle.submitRootHash(rootHash, 0, "0x00", 10, { from: MINER });
    await forwardTime(CHALLENGE_RESPONSE_WINDOW_DURATION + 1, this);
    await repCycle.confirmNewHash(0, { from: MINER });
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      korporatio = await Korporatio.new();
      await korporatio.install(colony.address);

      await checkErrorRevert(korporatio.install(colony.address), "extension-already-installed");

      const identifier = await korporatio.identifier();
      expect(identifier).to.equal(KORPORATIO);

      const capabilityRoles = await korporatio.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await korporatio.finishUpgrade();
      await korporatio.deprecate(true);
      await korporatio.uninstall();

      const code = await web3GetCode(korporatio.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(KORPORATIO, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(KORPORATIO, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(KORPORATIO, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(KORPORATIO, { from: USER0 });
    });

    it("can deprecate the extension if root", async () => {
      let deprecated = await korporatio.getDeprecated();
      expect(deprecated).to.equal(false);

      await checkErrorRevert(colony.deprecateExtension(KORPORATIO, true, { from: USER1 }), "ds-auth-unauthorized");
      await colony.deprecateExtension(KORPORATIO, true);

      deprecated = await korporatio.getDeprecated();
      expect(deprecated).to.equal(true);
    });

    it("can't use the network-level functions if installed via ColonyNetwork", async () => {
      // await checkErrorRevert(korporatio.install(ADDRESS_ZERO, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(korporatio.finishUpgrade({ from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(korporatio.deprecate(true, { from: USER1 }), "ds-auth-unauthorized");
      await checkErrorRevert(korporatio.uninstall({ from: USER1 }), "ds-auth-unauthorized");
    });

    it("cannot create applications unless initialised", async () => {
      await checkErrorRevert(
        korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
          from: USER0,
        }),
        "korporatio-not-initialised"
      );
    });
  });

  describe("creating applications", async () => {
    beforeEach(async () => {
      await colony.approveStake(korporatio.address, 1, WAD, { from: USER0 });

      await korporatio.initialise(WAD.divn(100), SECONDS_PER_DAY, { from: USER0 });
    });

    it("can query for configuration params", async () => {
      const stakeFraction = await korporatio.getStakeFraction();
      const claimDelay = await korporatio.getClaimDelay();

      expect(stakeFraction).to.eq.BN(WAD.divn(100));
      expect(claimDelay).to.eq.BN(SECONDS_PER_DAY);
    });

    it("cannot set configuration params if not root architect", async () => {
      await checkErrorRevert(korporatio.initialise(WAD.divn(100), SECONDS_PER_DAY, { from: USER1 }), "korporatio-not-root-architect");
    });

    it("can create an application", async () => {
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const applicationId = await korporatio.getNumApplications();
      const application = await korporatio.getApplication(applicationId);
      expect(application.applicant).to.equal(USER0);
      expect(application.stakeAmount).to.eq.BN(WAD.divn(100).muln(3));
      expect(application.cancelledAt).to.eq.BN(UINT256_MAX);

      const obligation = await colony.getObligation(USER0, korporatio.address, 1);
      expect(obligation).to.eq.BN(WAD.divn(100).muln(3));
    });

    it("can create a free application if root or admin", async () => {
      await korporatio.createFreeApplication({ from: USER1 });

      const applicationId = await korporatio.getNumApplications();
      const application = await korporatio.getApplication(applicationId);
      expect(application.applicant).to.equal(USER1);
      expect(application.stakeAmount).to.be.zero;
      expect(application.cancelledAt).to.eq.BN(UINT256_MAX);

      // Must have root or admin role
      await checkErrorRevert(korporatio.createFreeApplication({ from: USER2 }), "korporatio-must-submit-stake");
    });

    it("cannot create an application with insufficient rep", async () => {
      await korporatio.initialise(WAD, SECONDS_PER_DAY, { from: USER0 });

      await checkErrorRevert(
        korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
          from: USER0,
        }),
        "korporatio-insufficient-rep"
      );
    });

    it("cannot create an application if deprecated", async () => {
      await colony.deprecateExtension(KORPORATIO, true);

      await checkErrorRevert(
        korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
          from: USER0,
        }),
        "colony-extension-deprecated"
      );

      await checkErrorRevert(korporatio.createFreeApplication({ from: USER1 }), "colony-extension-deprecated");
    });

    it("can cancel an application", async () => {
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const applicationId = await korporatio.getNumApplications();

      // Only applicant can cancel
      await checkErrorRevert(korporatio.cancelApplication(applicationId, { from: USER1 }), "korporatio-not-applicant");

      const tx = await korporatio.cancelApplication(applicationId, { from: USER0 });
      const blockTime = await getBlockTime(tx.receipt.blockNumber);

      const application = await korporatio.getApplication(applicationId);
      expect(application.cancelledAt).to.eq.BN(blockTime);
    });

    it("can reclaim a stake", async () => {
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const applicationId = await korporatio.getNumApplications();
      await korporatio.cancelApplication(applicationId, { from: USER0 });

      // Cannot reclaim before claim delay elapses
      await checkErrorRevert(korporatio.reclaimStake(applicationId), "korporatio-cannot-reclaim");

      await forwardTime(SECONDS_PER_DAY, this);

      await korporatio.reclaimStake(applicationId, { from: USER0 });

      const obligation = await colony.getObligation(USER0, korporatio.address, 1);
      expect(obligation).to.be.zero;
    });

    it("can slash a stake", async () => {
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const applicationId = await korporatio.getNumApplications();
      await korporatio.slashStake(applicationId, false, { from: USER1 });

      const obligation = await colony.getObligation(USER0, korporatio.address, 1);
      expect(obligation).to.be.zero;
    });

    it("can slash a stake and punish", async () => {
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const applicationId = await korporatio.getNumApplications();
      await korporatio.slashStake(applicationId, true, { from: USER1 });

      const obligation = await colony.getObligation(USER0, korporatio.address, 1);
      expect(obligation).to.be.zero;

      // Staker gets a reputation penalty
      const addr = await colonyNetwork.getReputationMiningCycle(false);
      const repCycle = await IReputationMiningCycle.at(addr);
      const numUpdates = await repCycle.getReputationUpdateLogLength();
      const repUpdate = await repCycle.getReputationUpdateLogEntry(numUpdates.subn(1));

      expect(repUpdate.user).to.equal(USER0);
      expect(repUpdate.amount).to.eq.BN(WAD.divn(100).muln(3).neg());
      expect(repUpdate.skillId).to.eq.BN(domain1.skillId);
    });

    it("cannot slash a nonexistent stake", async () => {
      await checkErrorRevert(korporatio.slashStake(10, false, { from: USER1 }), "korporatio-cannot-slash");
    });

    it("cannot slash if not an arbitration user", async () => {
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const applicationId = await korporatio.getNumApplications();
      await checkErrorRevert(korporatio.slashStake(applicationId, false, { from: USER2 }), "korporatio-caller-not-arbitration");
    });

    it("can reclaim a stake via arbitration if the extension is deleted", async () => {
      const korporatioAddress = korporatio.address;
      await korporatio.createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings, {
        from: USER0,
      });

      const lockPre = await tokenLocking.getUserLock(token.address, USER0);
      const obligationPre = await colony.getObligation(USER0, korporatioAddress, 1);
      expect(obligationPre).to.eq.BN(WAD.divn(100).muln(3));

      await colony.uninstallExtension(KORPORATIO, { from: USER0 });

      await colony.transferStake(1, UINT256_MAX, korporatioAddress, USER0, 1, obligationPre, USER0, { from: USER1 });

      const lockPost = await tokenLocking.getUserLock(token.address, USER0);
      const obligationPost = await colony.getObligation(USER0, korporatioAddress, 1);

      // Obligation is zeroed out, but token balance is unchanged
      expect(obligationPost).to.be.zero;
      expect(new BN(lockPre.balance)).to.eq.BN(lockPost.balance);
    });

    it("can update an application", async () => {
      await korporatio.createFreeApplication({ from: USER0 });

      const applicationId = await korporatio.getNumApplications();
      const ipfsHash = soliditySha3("IPFS Hash");

      const tx = await korporatio.updateApplication(applicationId, ipfsHash, { from: USER0 });
      await expectEvent(tx, "ApplicationUpdated", [applicationId, ipfsHash]);

      // Cannot update if not applicant
      await checkErrorRevert(korporatio.updateApplication(applicationId, ipfsHash, { from: USER1 }), "korporatio-not-applicant");

      // Cannot update once cancelled
      await korporatio.cancelApplication(applicationId, { from: USER0 });
      await checkErrorRevert(korporatio.updateApplication(applicationId, ipfsHash, { from: USER0 }), "korporatio-stake-cancelled");
    });

    it("can submit an application", async () => {
      await korporatio.createFreeApplication({ from: USER0 });

      const applicationId = await korporatio.getNumApplications();

      // Cannot submit if not root
      await checkErrorRevert(korporatio.submitApplication(applicationId, { from: USER1 }), "korporatio-caller-not-root");

      const tx = await korporatio.submitApplication(applicationId, { from: USER0 });
      await expectEvent(tx, "ApplicationSubmitted", [applicationId]);

      // Cannot submit twice
      await checkErrorRevert(korporatio.submitApplication(applicationId, { from: USER0 }), "korporatio-stake-cancelled");
    });

    it("can submit an application via a motion", async () => {
      await colony.installExtension(VOTING_REPUTATION, 9);
      const votingAddress = await colonyNetwork.getExtensionInstallation(VOTING_REPUTATION, colony.address);
      await colony.setArbitrationRole(1, UINT256_MAX, votingAddress, 1, true);
      await colony.setRootRole(votingAddress, true);
      const voting = await IVotingReputation.at(votingAddress);

      await voting.initialise(WAD.divn(1000), 0, 0, WAD, SECONDS_PER_DAY, SECONDS_PER_DAY, SECONDS_PER_DAY, SECONDS_PER_DAY);

      await korporatio.createFreeApplication({ from: USER0 });
      const applicationId = await korporatio.getNumApplications();

      const action = await encodeTxData(korporatio, "submitApplication", [applicationId]);

      // Can't create a motion in a subdomain
      await colony.addDomain(1, UINT256_MAX, 1);
      await checkErrorRevert(
        voting.createMotion(2, UINT256_MAX, korporatio.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings),
        "voting-rep-invalid-domain-id"
      );

      // Only in the root domain
      await voting.createMotion(1, UINT256_MAX, korporatio.address, action, domain1Key, domain1Value, domain1Mask, domain1Siblings);
      const motionId = await voting.getMotionCount();

      await colony.approveStake(voting.address, 1, WAD, { from: USER0 });
      await voting.stakeMotion(motionId, 1, UINT256_MAX, 1, WAD.muln(3).divn(1000), user0Key, user0Value, user0Mask, user0Siblings, { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);

      const tx = await voting.finalizeMotion(motionId);
      const finalizedAt = await getBlockTime(tx.blockNumber);

      const application = await korporatio.getApplication(applicationId);
      expect(application.cancelledAt).to.eq.BN(finalizedAt);
    });

    it("can submit a stake via metatransactions", async () => {
      await colony.approveStake(korporatio.address, 1, WAD, { from: USER0 });

      const txData = await korporatio.contract.methods
        .createApplication(domain1Key, domain1Value, domain1Mask, domain1Siblings, user0Key, user0Value, user0Mask, user0Siblings)
        .encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, korporatio.address);
      await korporatio.executeMetaTransaction(USER0, txData, r, s, v, { from: USER0 });

      const applicationId = await korporatio.getNumApplications();
      const application = await korporatio.getApplication(applicationId);
      expect(application.applicant).to.equal(USER0);
    });
  });
});
