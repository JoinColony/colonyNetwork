/* global artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import {
  WAD,
  ZERO_ADDRESS
} from "../helpers/constants";

import {
  getTokenArgs,
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  expectAllEvents,
  forwardTime,
  currentBlockTime,
  createSignatures
} from "../helpers/test-helper";

import {
  fundColonyWithTokens,
  setupFinalizedTask,
  setupRatedTask,
  setupAssignedTask,
  setupFundedTask,
  executeSignedTaskChange,
  executeSignedRoleAssignment,
  getSigsAndTransactionData,
  makeTask,
  setupRandomColony
} from "../helpers/test-data-generator";

const ethers = require("ethers");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IMetaColony = artifacts.require("IMetaColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const DSToken = artifacts.require("DSToken");

contract("Colony Payment", accounts => {
  const PAYMENT_ADMIN = accounts[1];
  const RECIPIENT = accounts[3];
  const COLONY_ADMIN = accounts[4];

  let colony;
  let metaColony;
  let token;
  let otherToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);

    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
    await colony.setAdminRole(COLONY_ADMIN);

    const otherTokenArgs = getTokenArgs();
    otherToken = await DSToken.new(otherTokenArgs[1]);
    await fundColonyWithTokens(colony, token, WAD);
  });

  describe("when adding payments", () => {
    it("should allow admins to add payment", async () => {
      const paymentsCountBefore = await colony.getPaymentCount();
      await colony.addPayment(RECIPIENT, 0, 0, token.address, WAD);

      const paymentsCountAfter = await colony.getPaymentCount();
      expect(paymentsCountAfter.sub(paymentsCountBefore)).to.eq.BN(1);

      const fundingPotId = await colony.getFundingPotCount();
      const payment = await colony.getPayment(paymentsCountAfter);
      expect(payment[0]).to.equal(RECIPIENT);
      expect(payment[1]).to.eq.BN(fundingPotId);
      expect(payment[2]).to.be.zero;
    });
  });

  describe("when funding payments", () => {
    it("should allow admins to fund a payment", async () => {
      await colony.addPayment(RECIPIENT, 0, 0, token.address, WAD);
      const paymentId = await colony.getPaymentCount();
      const payment = await colony.getPayment(paymentId);
      const fundingPotId = payment[1];

      await colony.moveFundsBetweenPots(1, fundingPotId, 40, token.address);
    });
  });
});