/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import { checkErrorRevert } from "../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const MultiSigWallet = artifacts.require("gnosis/MultiSigWallet");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const ColonyNetwork = artifacts.require("ColonyNetwork");

contract("EtherRouter / Resolver", accounts => {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let multisig;

  before(async () => {
    resolver = await Resolver.deployed();
  });

  beforeEach(async () => {
    etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    // Need at least 2 confirmations for EtherRouter owner-required transactions
    multisig = await MultiSigWallet.new([ACCOUNT_TWO, ACCOUNT_THREE], 2);
    await etherRouter.setOwner(multisig.address);
  });

  describe("EtherRouter", () => {
    it("should revert if non-owner tries to change the Resolver on EtherRouter", async () => {
      await checkErrorRevert(
        etherRouter.setResolver("0xb3e2b6020926af4763d706b5657446b95795de57", { from: COINBASE_ACCOUNT }),
        "ds-auth-unauthorized"
      );
      const resolverUpdated = await etherRouter.resolver();
      expect(resolverUpdated).to.equal(resolver.address);
    });

    it("should not change resolver on EtherRouter if there have been insufficient number of confirmations", async () => {
      const txData = await etherRouter.contract.methods.setResolver("0xb3e2b6020926af4763d706b5657446b95795de57").encodeABI();
      const tx = await multisig.submitTransaction(etherRouter.address, 0, txData, { from: ACCOUNT_TWO });
      const { transactionId } = tx.logs[0].args;
      const isConfirmed = await multisig.isConfirmed(transactionId);
      const resolverUpdated = await etherRouter.resolver();
      expect(isConfirmed).to.be.false;
      expect(resolverUpdated).to.equal(resolver.address);
    });

    it("should revert if destination contract does not exist", async () => {
      // Let's pretend it's registered as a multisig and try to call something
      const notAMultisig = await MultiSigWallet.at(etherRouter.address);
      await checkErrorRevert(notAMultisig.submitTransaction(etherRouter.address, 0, "0x00000000"));
      // I wanted this test to just be the following, but until https://github.com/trufflesuite/truffle/issues/1586 is fixed,
      // if it's even being considered a bug, it's not possible.
      // await checkErrorRevert(
      //   etherRouter.sendTransaction({data: "0xdeadbeef"})
      // );
    });
  });

  describe("Resolver", () => {
    it("should return correct destination for given function", async () => {
      const deployedColonyNetwork = await ColonyNetwork.deployed();
      const signature = await resolver.stringToSig("createColony(address)");
      const destination = await resolver.lookup(signature);
      expect(destination).to.equal(deployedColonyNetwork.address);
    });

    it("when checking destination for a function that doesn't exist, should return 0", async () => {
      const destination = await resolver.lookup("0xdeadbeef");
      expect(destination).to.equal(ethers.constants.AddressZero);
    });

    it("should return correctly encoded function signature", async () => {
      const signature = await resolver.stringToSig("transferFrom(address,address,uint256)");
      expect(signature).to.equal("0x23b872dd");
    });
  });
});
