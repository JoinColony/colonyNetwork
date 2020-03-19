/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { WAD, INITIAL_FUNDING } from "../../helpers/constants";
import { fundColonyWithTokens, setupRandomColony, setupColony } from "../../helpers/test-data-generator";
import { checkErrorRevert } from "../../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");

contract("ColonyPermissions", accounts => {
  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colonyNetwork;
  let tokenLocking;
  let colony;
  let token;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, 0, 1);
    await colony.setArbitrationRole(1, 0, USER2, 1, true);

    await colony.makeExpenditure(1, 0, 1);
    await colony.setExpenditureRecipient(1, 0, USER0);
    await colony.setExpenditureRecipient(1, 1, USER1);

    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
    await colony.moveFundsBetweenPots(1, 0, 0, 1, 3, WAD.muln(200), token.address);
    await colony.setExpenditurePayout(1, 0, token.address, WAD.muln(100));
    await colony.setExpenditurePayout(1, 1, token.address, WAD.muln(100));

    await colony.finalizeExpenditure(1);
    await colony.claimExpenditurePayout(1, 0, token.address);
    await colony.claimExpenditurePayout(1, 1, token.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    await token.approve(tokenLockingAddress, WAD.muln(50), { from: USER0 });
    await token.approve(tokenLockingAddress, WAD.muln(50), { from: USER1 });

    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    await tokenLocking.deposit(token.address, WAD.muln(50), false, { from: USER0 });
    await tokenLocking.deposit(token.address, WAD.muln(50), false, { from: USER1 });
  });

  describe("when managing stakes", () => {
    it("should let users approve, obligate, and deobligate each other", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.deobligateStake(USER1, 1, WAD, { from: USER0 });
    });

    it("should let users approve, obligate, and slash each other", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.slashStake(1, 0, USER0, USER1, 1, WAD, ethers.constants.AddressZero, { from: USER2 });

      const deposit = await tokenLocking.getUserLock(token.address, USER1);
      expect(deposit.balance).to.eq.BN(WAD.muln(49));
    });

    it("should not let users obligate more than is approved for obligator", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(2), { from: USER1 });

      await checkErrorRevert(colony.obligateStake(USER1, 1, WAD.addn(1), { from: USER0 }), "ds-math-sub-underflow");
    });

    it("should not let users obligate more than is approved for colony", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });

      await checkErrorRevert(colony.obligateStake(USER1, 1, WAD.addn(1), { from: USER0 }), "ds-math-sub-underflow");
    });

    it("should not let cumulative obligations be larger than token deposit, with one colony", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(100), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(100), { from: USER1 });

      await checkErrorRevert(colony.obligateStake(USER1, 1, WAD.muln(100), { from: USER0 }), "colony-token-locking-insufficient-deposit");
    });

    it("should not let cumulative obligations be larger than token deposit, with two colonies", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(50), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(50), { from: USER1 });

      const newColony = await setupColony(colonyNetwork, token.address);
      await newColony.approveStake(USER0, 1, WAD.muln(50), { from: USER1 });
      await tokenLocking.approveStake(newColony.address, WAD.muln(50), { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD.muln(50), { from: USER0 });

      await checkErrorRevert(newColony.obligateStake(USER1, 1, WAD.muln(50), { from: USER0 }), "colony-token-locking-insufficient-deposit");
    });

    it("should not let users deobligate more than is obligated", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(2), { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await checkErrorRevert(colony.deobligateStake(USER1, 1, WAD.addn(1), { from: USER0 }), "ds-math-sub-underflow");
    });

    it("should not let users slash more than is obligated", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(2), { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await checkErrorRevert(
        colony.slashStake(1, 0, USER0, USER1, 1, WAD.addn(1), ethers.constants.AddressZero, { from: USER2 }),
        "ds-math-sub-underflow"
      );
    });

    it("should correctly accumulate multiple approvals", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD.muln(2), { from: USER0 });
    });

    it("should correctly accumulate multiple obligations", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(2), { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await colony.deobligateStake(USER1, 1, WAD.muln(2), { from: USER0 });
    });

    it("should correctly accumulate multiple deobligations", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(2), { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD.muln(2), { from: USER0 });

      await colony.deobligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.deobligateStake(USER1, 1, WAD, { from: USER0 });
    });

    it("should correctly accumulate multiple slashes", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD.muln(2), { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD.muln(2), { from: USER0 });

      await colony.slashStake(1, 0, USER0, USER1, 1, WAD, ethers.constants.AddressZero, { from: USER2 });
      await colony.slashStake(1, 0, USER0, USER1, 1, WAD, ethers.constants.AddressZero, { from: USER2 });

      const deposit = await tokenLocking.getUserLock(token.address, USER1);
      expect(deposit.balance).to.eq.BN(WAD.muln(48));
    });

    it("should allow for a slashed stake to be sent to a beneficiary", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await tokenLocking.approveStake(colony.address, WAD, { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await colony.slashStake(1, 0, USER0, USER1, 1, WAD, USER2, { from: USER2 });

      const deposit = await tokenLocking.getUserLock(token.address, USER2);
      expect(deposit.pendingBalance).to.eq.BN(WAD);
    });
  });
});
