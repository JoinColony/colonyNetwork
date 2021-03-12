/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD } from "../../helpers/constants";
import { checkErrorRevert, encodeTxData } from "../../helpers/test-helper";
import { setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const CoinMachine = artifacts.require("CoinMachine");
const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ITokenLocking = artifacts.require("ITokenLocking");

contract("Colony Arbitrary Transactions", (accounts) => {
  let colony;
  let token;
  let colonyNetwork;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
  });

  it("should be able to make arbitrary transactions", async () => {
    const action = await encodeTxData(token, "mint", [WAD]);
    const balancePre = await token.balanceOf(colony.address);

    await colony.makeArbitraryTransaction(token.address, action);

    const balancePost = await token.balanceOf(colony.address);
    expect(balancePost.sub(balancePre)).to.eq.BN(WAD);
  });

  it("should not be able to make arbitrary transactions if not root", async () => {
    const action = await encodeTxData(token, "mint", [WAD]);

    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action, { from: USER1 }), "ds-auth-unauthorized");
  });

  it("should not be able to make arbitrary transactions to a colony itself", async () => {
    await checkErrorRevert(colony.makeArbitraryTransaction(colony.address, "0x0"), "colony-cannot-target-self");
  });

  it("should not be able to make arbitrary transactions to a user address", async () => {
    await checkErrorRevert(colony.makeArbitraryTransaction(accounts[0], "0x0"), "colony-to-must-be-contract");
  });

  it("should not be able to make arbitrary transactions to network or token locking", async () => {
    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    const tokenLocking = await ITokenLocking.at(tokenLockingAddress);

    const action1 = await encodeTxData(colonyNetwork, "addSkill", [0]);
    const action2 = await encodeTxData(tokenLocking, "lockToken", [token.address]);

    await checkErrorRevert(colony.makeArbitraryTransaction(colonyNetwork.address, action1), "colony-cannot-target-network");
    await checkErrorRevert(colony.makeArbitraryTransaction(tokenLocking.address, action2), "colony-cannot-target-token-locking");
  });

  it("should not be able to make arbitrary transactions to transfer tokens", async () => {
    const action1 = await encodeTxData(token, "approve", [USER0, WAD]);
    const action2 = await encodeTxData(token, "transfer", [USER0, WAD]);
    const action3 = await encodeTxData(token, "transferFrom", [USER0, USER0, WAD]);
    const action4 = await encodeTxData(token, "burn", [WAD]);
    const action5 = await encodeTxData(token, "burn(address,uint256)", [USER0, WAD]);

    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action1), "colony-cannot-call-erc20-approve");
    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action2), "colony-cannot-call-erc20-transfer");
    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action3), "colony-cannot-call-erc20-transfer-from");
    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action4), "colony-cannot-call-burn");
    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action5), "colony-cannot-call-burn-guy");
  });

  it("if an arbitrary transaction is made to approve tokens, then tokens needed for approval cannot be moved out of the main pot", async () => {
    await fundColonyWithTokens(colony, token, 100);
    const action1 = await encodeTxData(token, "approve", [USER0, 50]);
    await colony.makeArbitraryTransaction(token.address, action1);
    await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 50, token.address);
    await checkErrorRevert(colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 50, token.address), "colony-funding-too-many-approvals");
    const approval = await colony.getTokenApproval(token.address, USER0);
    expect(approval).to.be.eq.BN(50);
    const allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.be.eq.BN(50);
  });

  it(`if an allowance is used against a colony, then if moving tokens from the main pot,
   tokens can only be moved from main pot that weren't part of the allowance`, async () => {
    await fundColonyWithTokens(colony, token, 100);
    const action1 = await encodeTxData(token, "approve", [USER0, 20]);
    await colony.makeArbitraryTransaction(token.address, action1);
    // Use allowance
    await token.transferFrom(colony.address, USER0, 20, { from: USER0 });
    // Approval tracking still thinks it has to reserve 20
    let approval = await colony.getTokenApproval(token.address, USER0);
    expect(approval).to.eq.BN(20);
    let allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.eq.BN(20);
    await checkErrorRevert(colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 81, token.address), "colony-funding-too-many-approvals");
    await colony.moveFundsBetweenPots(1, UINT256_MAX, UINT256_MAX, 1, 0, 80, token.address);
    // Pot still thinks it has 20 tokens in it
    let potBalance = await colony.getFundingPotBalance(1, token.address);
    expect(potBalance).to.eq.BN(20);
    // Tell it to check
    await colony.updateApprovalAmount(token.address, USER0);
    // Pot now knows its empty
    potBalance = await colony.getFundingPotBalance(1, token.address);
    expect(potBalance).to.be.zero;
    // And approvals are now 0
    approval = await colony.getTokenApproval(token.address, USER0);
    expect(approval).to.be.zero;
    allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.be.zero;
  });

  it("an approval cannot be given via arbitrary transaction if it cannot be covered exclusively from unreserved tokens in root pot", async () => {
    await fundColonyWithTokens(colony, token, 100);
    const action1 = await encodeTxData(token, "approve", [USER0, 300]);
    // Not enough tokens at all
    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action1), "colony-too-many-approvals");
    await fundColonyWithTokens(colony, token, 1000);
    await colony.makeArbitraryTransaction(token.address, action1);
    // They are now approved for 300.
    let approval = await colony.getTokenApproval(token.address, USER0);
    expect(approval).to.be.eq.BN(300);
    let allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.be.eq.BN(300);

    const action2 = await encodeTxData(token, "approve", [USER0, 900]);
    // User was approved for 300, we now approve them for 900. There are enough tokens to cover this, even though 900 + 300 > 1100, the balance of the pot
    await colony.makeArbitraryTransaction(token.address, action2);
    approval = await colony.getTokenApproval(token.address, USER0);
    expect(approval).to.be.eq.BN(900);
    allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.be.eq.BN(900);

    // Set them back to 300
    await colony.makeArbitraryTransaction(token.address, action1);
    approval = await colony.getTokenApproval(token.address, USER0);
    expect(approval).to.be.eq.BN(300);
    allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.be.eq.BN(300);

    // Cannot approve someone else for 900
    const action3 = await encodeTxData(token, "approve", [USER1, 900]);
    await checkErrorRevert(colony.makeArbitraryTransaction(token.address, action3), "colony-too-many-approvals");
    // But can for 800
    const action4 = await encodeTxData(token, "approve", [USER1, 800]);
    await colony.makeArbitraryTransaction(token.address, action4);
    approval = await colony.getTokenApproval(token.address, USER1);
    expect(approval).to.be.eq.BN(800);
    allApprovals = await colony.getTotalTokenApproval(token.address);
    expect(allApprovals).to.be.eq.BN(1100);
  });

  it("should not be able to make arbitrary transactions to the colony's own extensions", async () => {
    const COIN_MACHINE = soliditySha3("CoinMachine");
    await colony.installExtension(COIN_MACHINE, 1);

    const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);
    const coinMachine = await CoinMachine.at(coinMachineAddress);
    await coinMachine.initialise(ethers.constants.AddressZero, 60 * 60, 10, WAD.muln(100), WAD.muln(200), UINT256_MAX, WAD);

    const action = await encodeTxData(coinMachine, "buyTokens", [WAD]);

    await checkErrorRevert(colony.makeArbitraryTransaction(coinMachine.address, action), "colony-cannot-target-extensions");

    // But other colonies can
    const { colony: otherColony } = await setupRandomColony(colonyNetwork);
    await otherColony.makeArbitraryTransaction(coinMachine.address, action);
  });
});
