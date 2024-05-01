/* global artifacts */
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const { UINT256_MAX, WAD, INITIAL_FUNDING, ADDRESS_ZERO, SLOT0, SLOT1 } = require("../../helpers/constants");
const { fundColonyWithTokens, setupRandomColony, setupColony } = require("../../helpers/test-data-generator");
const { checkErrorRevert, expectEvent } = require("../../helpers/test-helper");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ToggleableToken = artifacts.require("ToggleableToken");
const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");

contract("Colony Staking", (accounts) => {
  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  const DEPOSIT = WAD.muln(50);

  let colonyNetwork;
  let tokenLocking;
  let colony;
  let token;

  before(async () => {
    const cnAddress = (await EtherRouter.deployed()).address;

    const etherRouter = await EtherRouter.at(cnAddress);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.addDomain(1, UINT256_MAX, 1);
    await colony.setArbitrationRole(1, UINT256_MAX, USER2, 1, true);

    await colony.makeExpenditure(1, UINT256_MAX, 1);
    await colony.setExpenditureRecipient(1, SLOT0, USER0);
    await colony.setExpenditureRecipient(1, SLOT1, USER1);

    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
    await colony.moveFundsBetweenPots(1, UINT256_MAX, 1, UINT256_MAX, UINT256_MAX, 1, 3, WAD.muln(200), token.address);
    await colony.setExpenditurePayout(1, SLOT0, token.address, WAD.muln(100));
    await colony.setExpenditurePayout(1, SLOT1, token.address, WAD.muln(100));

    await colony.finalizeExpenditure(1);
    await colony.claimExpenditurePayout(1, SLOT0, token.address);
    await colony.claimExpenditurePayout(1, SLOT1, token.address);

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    await token.approve(tokenLockingAddress, DEPOSIT, { from: USER0 });
    await token.approve(tokenLockingAddress, DEPOSIT, { from: USER1 });

    tokenLocking = await ITokenLocking.at(tokenLockingAddress);
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, DEPOSIT, true, { from: USER0 });
    await tokenLocking.methods["deposit(address,uint256,bool)"](token.address, DEPOSIT, true, { from: USER1 });
  });

  describe("when managing stakes", () => {
    it("should let users approve, obligate, and deobligate each other", async () => {
      let approval;
      let obligation;

      const tokenAddress = await colony.getToken();

      let tx = await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await expectEvent(tx, "UserTokenApproved(address,address,address,uint256)", [tokenAddress, USER1, colony.address, WAD]);

      approval = await colony.getApproval(USER1, USER0, 1);
      const tokenLockingApproval = await tokenLocking.getApproval(USER1, token.address, colony.address);
      expect(approval).to.eq.BN(WAD);
      expect(tokenLockingApproval).to.eq.BN(WAD);

      tx = await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await expectEvent(tx, "UserTokenObligated(address,address,address,uint256)", [tokenAddress, USER1, colony.address, WAD]);

      approval = await colony.getApproval(USER1, USER0, 1);
      obligation = await colony.getObligation(USER1, USER0, 1);
      const tokenLockingObligation = await tokenLocking.getObligation(USER1, token.address, colony.address);

      expect(approval).to.be.zero;
      expect(obligation).to.eq.BN(WAD);
      expect(tokenLockingObligation).to.eq.BN(WAD);

      tx = await colony.deobligateStake(USER1, 1, WAD, { from: USER0 });
      await expectEvent(tx, "UserTokenDeobligated(address,address,address,uint256)", [tokenAddress, USER1, colony.address, WAD]);

      obligation = await colony.getObligation(USER1, USER0, 1);
      expect(obligation).to.be.zero;
    });

    it("should let users approve, obligate, and slash each other", async () => {
      let approval;
      let obligation;

      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      const tokenAddress = await colony.getToken();

      approval = await colony.getApproval(USER1, USER0, 1);
      expect(approval).to.eq.BN(WAD);

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      approval = await colony.getApproval(USER1, USER0, 1);
      obligation = await colony.getObligation(USER1, USER0, 1);
      expect(approval).to.be.zero;
      expect(obligation).to.eq.BN(WAD);

      const tx = await colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD, ethers.constants.AddressZero, { from: USER2 });
      await expectEvent(tx, "StakeTransferred(address,address,address,address,uint256)", [
        tokenAddress,
        colony.address,
        USER1,
        ethers.constants.AddressZero,
        WAD,
      ]);

      obligation = await colony.getObligation(USER1, USER0, 1);
      expect(obligation).to.be.zero;

      const deposit = await tokenLocking.getUserLock(token.address, USER1);
      expect(deposit.balance).to.eq.BN(WAD.muln(49));
    });

    it("should not let users call stake management functions on tokenLocking directly", async () => {
      await checkErrorRevert(
        tokenLocking.approveStake(USER1, WAD, token.address, { from: USER0 }),
        "colony-token-locking-sender-not-colony-or-network",
      );
      await checkErrorRevert(
        tokenLocking.obligateStake(USER1, WAD, token.address, { from: USER0 }),
        "colony-token-locking-sender-not-colony-or-network",
      );
      await checkErrorRevert(
        tokenLocking.deobligateStake(USER1, WAD, token.address, { from: USER0 }),
        "colony-token-locking-sender-not-colony-or-network",
      );
      await checkErrorRevert(
        tokenLocking.transferStake(USER1, WAD, token.address, USER0, { from: USER0 }),
        "colony-token-locking-sender-not-colony-or-network",
      );
    });

    it("should not let users obligate more than is approved for obligator", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });

      await checkErrorRevert(colony.obligateStake(USER1, 1, WAD.addn(1), { from: USER0 }), "Panic: Arithmetic overflow");
    });

    it("should not let cumulative obligations be larger than token deposit, with one colony", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(100), { from: USER1 });

      await checkErrorRevert(colony.obligateStake(USER1, 1, WAD.muln(100), { from: USER0 }), "colony-token-locking-insufficient-deposit");
    });

    it("should not let cumulative obligations be larger than token deposit, with two colonies", async () => {
      await colony.approveStake(USER0, 1, DEPOSIT, { from: USER1 });

      const newColony = await setupColony(colonyNetwork, token.address);
      await newColony.approveStake(USER0, 1, DEPOSIT, { from: USER1 });

      await colony.obligateStake(USER1, 1, DEPOSIT, { from: USER0 });

      await checkErrorRevert(newColony.obligateStake(USER1, 1, DEPOSIT, { from: USER0 }), "colony-token-locking-insufficient-deposit");
    });

    it("should not let users deobligate more than is obligated", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await checkErrorRevert(colony.deobligateStake(USER1, 1, WAD.addn(1), { from: USER0 }), "Panic: Arithmetic overflow");
    });

    it("should not let users slash more than is obligated", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });

      await checkErrorRevert(
        colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD.addn(1), ethers.constants.AddressZero, { from: USER2 }),
        "Panic: Arithmetic overflow",
      );
    });

    it("should not let users withdraw more than the unobligated balance", async () => {
      await colony.approveStake(USER0, 1, DEPOSIT, { from: USER1 });
      await colony.obligateStake(USER1, 1, DEPOSIT, { from: USER0 });

      await checkErrorRevert(
        tokenLocking.methods["withdraw(address,uint256,bool)"](token.address, 1, false, { from: USER1 }),
        "colony-token-locking-excess-obligation",
      );
    });

    it("should not let users transfer more than the unobligated balance", async () => {
      await colony.approveStake(USER0, 1, DEPOSIT, { from: USER1 });
      await colony.obligateStake(USER1, 1, DEPOSIT, { from: USER0 });

      await checkErrorRevert(
        tokenLocking.transfer(token.address, 1, ethers.constants.AddressZero, false, { from: USER1 }),
        "colony-token-locking-excess-obligation",
      );
    });

    it("should correctly accumulate multiple approvals", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD.muln(2), { from: USER0 });
    });

    it("should correctly accumulate multiple obligations", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.deobligateStake(USER1, 1, WAD.muln(2), { from: USER0 });
    });

    it("should correctly accumulate multiple deobligations", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD.muln(2), { from: USER0 });
      await colony.deobligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.deobligateStake(USER1, 1, WAD, { from: USER0 });
    });

    it("should correctly accumulate multiple slashes", async () => {
      await colony.approveStake(USER0, 1, WAD.muln(2), { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD.muln(2), { from: USER0 });
      await colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD, ethers.constants.AddressZero, { from: USER2 });
      await colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD, ethers.constants.AddressZero, { from: USER2 });

      const deposit = await tokenLocking.getUserLock(token.address, USER1);
      expect(deposit.balance).to.eq.BN(WAD.muln(48));
    });

    it("should correctly accumulate multiple obligations across colonies", async () => {
      const otherColony = await setupColony(colonyNetwork, token.address);

      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await otherColony.approveStake(USER0, 1, WAD, { from: USER1 });

      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await otherColony.obligateStake(USER1, 1, WAD, { from: USER0 });

      const obligation = await tokenLocking.getTotalObligation(USER1, token.address);
      expect(obligation).to.eq.BN(WAD.muln(2));
    });

    it("should allow for a slashed stake to be sent to a beneficiary", async () => {
      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD, USER2, { from: USER2 });

      const { balance } = await tokenLocking.getUserLock(token.address, USER2);
      expect(balance).to.eq.BN(WAD);
    });

    it.skip("should burn the stake if sent to address(0x0) and the token supports burning", async () => {
      const supplyBefore = await token.totalSupply();

      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD, ADDRESS_ZERO, { from: USER2 });

      const supplyAfter = await token.totalSupply();
      expect(supplyBefore.sub(supplyAfter)).to.eq.BN(WAD);
    });

    it.skip("should send the stake to address(0x0) if the token does not support burning", async () => {
      // This token does not support burning
      token = await ToggleableToken.new(WAD, { from: USER1 });
      colony = await setupColony(colonyNetwork, token.address);
      await colony.setArbitrationRole(1, UINT256_MAX, USER2, 1, true);

      await token.approve(tokenLocking.address, WAD, { from: USER1 });
      await tokenLocking.deposit(token.address, WAD, true, { from: USER1 });

      const supplyBefore = await token.balanceOf(tokenLocking.address);

      await colony.approveStake(USER0, 1, WAD, { from: USER1 });
      await colony.obligateStake(USER1, 1, WAD, { from: USER0 });
      await colony.transferStake(1, UINT256_MAX, USER0, USER1, 1, WAD, ADDRESS_ZERO, { from: USER2 });

      const supplyAfter = await token.balanceOf(tokenLocking.address);
      expect(supplyBefore.sub(supplyAfter)).to.eq.BN(WAD);

      const nullBalance = await token.balanceOf(ADDRESS_ZERO);
      expect(nullBalance).to.eq.BN(WAD);
    });
  });
});
