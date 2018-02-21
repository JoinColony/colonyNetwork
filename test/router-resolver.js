/* globals artifacts */
import testHelper from "../helpers/test-helper";

const SimpleMultiSig = artifacts.require("SimpleMultiSig");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");

contract("EtherRouter / Resolver", accounts => {
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  let etherRouter;
  let resolver;
  let multisig;
  let signers;

  before(async () => {
    resolver = await Resolver.new();
    signers = [ACCOUNT_TWO, ACCOUNT_THREE];
    signers.sort();
  });

  beforeEach(async () => {
    etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    // Need at least 2 confirmations for EtherRouter owner-required transactions
    multisig = await SimpleMultiSig.new(2, signers);
    await etherRouter.setOwner(multisig.address);
  });

  describe("EtherRouter", () => {
    it("should revert if non-owner tries to change the Resolver on EtherRouter", async () => {
      await testHelper.checkErrorRevert(etherRouter.setResolver("0xb3e2b6020926af4763d706b5657446b95795de57"));
      const resolverUpdated = await etherRouter.resolver.call();
      assert.equal(resolverUpdated, resolver.address);
    });

    it("should change resolver on EtherRouter if there have been sufficient number of confirmations", async () => {
      let nonce = await multisig.nonce.call();
      const newResolver = await Resolver.new();
      const data = await etherRouter.contract.setResolver.getData(newResolver.address);

      const sigs = await testHelper.createSignatures(signers, multisig.address, nonce, etherRouter.address, 0, data);
      await multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, etherRouter.address, 0, data);

      const resolverUpdated = await etherRouter.resolver.call();
      assert.equal(resolverUpdated, newResolver.address);

      nonce = await multisig.nonce.call();
      assert.equal(nonce.toNumber(), 1);
    });

    it("should NOT change resolver on EtherRouter if there have NOT been sufficient number of confirmations", async () => {
      let nonce = await multisig.nonce.call();
      const newResolver = await Resolver.new();
      const data = await etherRouter.contract.setResolver.getData(newResolver.address);

      const singleSigner = [ACCOUNT_THREE];
      const sigs = await testHelper.createSignatures(singleSigner, multisig.address, nonce, etherRouter.address, 0, data);
      await testHelper.checkErrorRevert(multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, etherRouter.address, 0, data));

      const resolverUpdated = await etherRouter.resolver.call();
      assert.notEqual(resolverUpdated, newResolver.address);

      nonce = await multisig.nonce.call();
      assert.equal(nonce.toNumber(), 0);
    });
  });

  describe("Resolver", () => {
    it("when checking outsize, should return correct return param size for given function", async () => {
      const outsize = await resolver.outsize.call("0x18160ddd");
      assert.equal(outsize, 32);
    });

    it("when checking outsize for a function that doesn't exist, should return default of 32", async () => {
      const outsize = await resolver.outsize.call("0x18118aaa");
      assert.equal(outsize, 32);
    });

    it("should return correctly encoded function signature", async () => {
      const signature = await resolver.stringToSig.call("transferFrom(address,address,uint256)");
      assert.equal(signature, "0x23b872dd");
    });
  });
});
