/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { web3GetBalance, checkErrorRevert, expectEvent } from "../../helpers/test-helper";
import { getMetatransactionParameters, getPermitParameters } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const MetaTxToken = artifacts.require("MetaTxToken");

const ADDRESS_ZERO = ethers.constants.AddressZero;

contract("MetaTxToken", (accounts) => {
  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colony;
  let metaTxToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    metaTxToken = await MetaTxToken.new("Test", "TEST", 18);
    const { logs } = await colonyNetwork.createColony(metaTxToken.address, 0, "", "");
    const { colonyAddress } = logs.filter((x) => x.event === "ColonyAdded")[0].args;
    colony = await IColony.at(colonyAddress);
    await colony.setRewardInverse(100);
  });

  describe("when using the contract directly", () => {
    describe("when working with MetaTxToken, should behave like normal token", () => {
      beforeEach("mint 1500000 tokens", async () => {
        await metaTxToken.unlock({ from: USER0 });
        await metaTxToken.mint(USER0, 1500000, { from: USER0 });
      });

      it("should be able to get total supply", async () => {
        const total = await metaTxToken.totalSupply();
        expect(total).to.eq.BN(1500000);
      });

      it("should be able to get token balance", async () => {
        const balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500000);
      });

      it("should be able to get allowance for address", async () => {
        await metaTxToken.approve(USER1, 200000, { from: USER0 });
        const allowance = await metaTxToken.allowance(USER0, USER1);
        expect(allowance).to.eq.BN(200000);
      });

      it("should be able to transfer tokens from own address", async () => {
        const success = await metaTxToken.transfer.call(USER1, 300000, { from: USER0 });
        expect(success).to.be.true;
        await expectEvent(metaTxToken.transfer(USER1, 300000, { from: USER0 }), "Transfer", [USER0, USER1, 300000]);
        const balanceAccount1 = await metaTxToken.balanceOf(USER0);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.eq.BN(300000);
      });

      it("should NOT be able to transfer more tokens than they have", async () => {
        await checkErrorRevert(metaTxToken.transfer(USER1, 1500001, { from: USER0 }), "ds-token-insufficient-balance");
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to transfer pre-approved tokens from address different than own", async () => {
        await metaTxToken.approve(USER1, 300000, { from: USER0 });
        const success = await metaTxToken.transferFrom.call(USER0, USER1, 300000, { from: USER1 });
        expect(success).to.be.true;

        await expectEvent(metaTxToken.transferFrom(USER0, USER1, 300000, { from: USER1 }), "Transfer", [USER0, USER1, 300000]);
        const balanceAccount1 = await metaTxToken.balanceOf(USER0);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.eq.BN(300000);
        const allowance = await metaTxToken.allowance(USER0, USER1);
        expect(allowance).to.be.zero;
      });

      it("should NOT be able to transfer tokens from another address if NOT pre-approved", async () => {
        await checkErrorRevert(metaTxToken.transferFrom(USER0, USER1, 300000, { from: USER1 }), "ds-token-insufficient-approval");
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than pre-approved", async () => {
        await metaTxToken.approve(USER1, 300000);
        await checkErrorRevert(metaTxToken.transferFrom(USER0, USER1, 300001, { from: USER1 }), "ds-token-insufficient-approval");

        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than the source balance", async () => {
        await metaTxToken.approve(USER1, 300000, { from: USER0 });
        await metaTxToken.transfer(USER2, 1500000, { from: USER0 });

        await checkErrorRevert(metaTxToken.transferFrom(USER0, USER1, 300000, { from: USER1 }), "ds-token-insufficient-balance");
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to approve token transfer for other accounts", async () => {
        const success = await metaTxToken.approve.call(USER1, 200000, { from: USER0 });
        expect(success).to.be.true;

        await expectEvent(metaTxToken.approve(USER1, 200000, { from: USER0 }), "Approval", [USER0, USER1, 200000]);
        const allowance = await metaTxToken.allowance(USER0, USER1);
        expect(allowance).to.eq.BN(200000);
      });
    });

    describe("when working with ERC20 functions and token is locked", () => {
      beforeEach(async () => {
        await metaTxToken.mint(USER0, 1500000, { from: USER0 });
        await metaTxToken.transfer(USER1, 1500000, { from: USER0 });
      });

      it("shouldn't be able to transfer tokens from own address", async () => {
        await checkErrorRevert(metaTxToken.transfer(USER2, 300000, { from: USER1 }), "colony-token-unauthorised");

        const balanceAccount1 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER2);
        expect(balanceAccount2).to.be.zero;
      });

      it("shouldn't be able to transfer pre-approved tokens", async () => {
        await metaTxToken.approve(USER2, 300000, { from: USER1 });
        await checkErrorRevert(metaTxToken.transferFrom(USER1, USER2, 300000, { from: USER2 }), "colony-token-unauthorised");

        const balanceAccount1 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER2);
        expect(balanceAccount2).to.be.zero;
        const allowance = await metaTxToken.allowance(USER1, USER2);
        expect(allowance).to.eq.BN(300000);
      });
    });

    describe("when working with additional functions", () => {
      it("should be able to get the token decimals", async () => {
        const decimals = await metaTxToken.decimals();
        expect(decimals).to.eq.BN(18);
      });

      it("should be able to get the token symbol", async () => {
        const symbol = await metaTxToken.symbol();
        expect(symbol).to.equal("TEST");
      });

      it("should be able to get the token name", async () => {
        const name = await metaTxToken.name();
        expect(name).to.equal("Test");
      });

      it("should be able to mint new tokens, when called by the Token owner", async () => {
        await metaTxToken.mint(USER0, 1500000, { from: USER0 });

        let totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        let balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500000);

        // Mint some more tokens
        await expectEvent(metaTxToken.mint(USER0, 1, { from: USER0 }), "Mint", [USER0, 1]);
        totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500001);

        balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500001);
      });

      it("should be able to mint new tokens directly to sender, when called by the Token owner", async () => {
        // How truffle supports function overloads apparently
        await metaTxToken.methods["mint(uint256)"](1500000, { from: USER0 });

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500000);
      });

      it("should emit a Mint event when minting tokens", async () => {
        await expectEvent(metaTxToken.mint(USER0, 1, { from: USER0 }), "Mint", [USER0, 1]);
        await expectEvent(metaTxToken.methods["mint(uint256)"](1, { from: USER0 }), "Mint", [USER0, 1]);
      });

      it("should emit a Transfer event when minting tokens", async () => {
        await expectEvent(metaTxToken.mint(USER0, 1, { from: USER0 }), "Transfer", [ADDRESS_ZERO, USER0, 1]);
        await expectEvent(metaTxToken.methods["mint(uint256)"](1, { from: USER0 }), "Transfer", [ADDRESS_ZERO, USER0, 1]);
      });

      it("should NOT be able to mint new tokens, when called by anyone NOT the Token owner", async () => {
        await checkErrorRevert(metaTxToken.mint(USER0, 1500000, { from: USER2 }), "ds-auth-unauthorized");
        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.be.zero;
      });

      it("should be able to burn others' tokens when they have approved them to do so", async () => {
        await metaTxToken.mint(USER1, 1500000, { from: USER0 });
        await metaTxToken.methods["approve(address,uint256)"](USER2, 500000, { from: USER1 });
        await metaTxToken.methods["burn(address,uint256)"](USER1, 500000, { from: USER2 });

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        const balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(1000000);
      });

      it("should NOT be able to burn others' tokens when the approved amount is less", async () => {
        await metaTxToken.mint(USER1, 1500000, { from: USER0 });
        await metaTxToken.methods["approve(address,uint256)"](USER2, 500000, { from: USER1 });
        await checkErrorRevert(metaTxToken.methods["burn(address,uint256)"](USER1, 500001, { from: USER2 }), "ds-token-insufficient-approval");

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(1500000);
      });

      it("should be able to burn own tokens", async () => {
        // How truffle supports function overloads apparently
        await metaTxToken.mint(USER1, 1500000, { from: USER0 });
        await metaTxToken.methods["burn(address,uint256)"](USER1, 500000, { from: USER1 });

        let totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        let balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(1000000);

        await metaTxToken.methods["burn(uint256)"](1000000, { from: USER1 });
        totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.be.zero;

        balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.be.zero;
      });

      it("should NOT be able to burn tokens if there's insufficient balance", async () => {
        await metaTxToken.mint(USER1, 5, { from: USER0 });
        await checkErrorRevert(metaTxToken.burn(6, { from: USER1 }), "ds-token-insufficient-balance");

        const balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(5);
      });

      it("should emit a Burn event when burning tokens", async () => {
        await metaTxToken.methods["mint(uint256)"](1, { from: USER0 });
        await expectEvent(metaTxToken.burn(1, { from: USER0 }), "Burn", [USER0, 1]);
      });

      it("should be able to unlock token by owner", async () => {
        // Note: due to an apparent bug, we cannot call a parameterless function with transaction params, e.g. { from: senderAccount }
        // So change the owner to coinbase so we are able to call it without params
        await metaTxToken.setOwner(USER0, { from: USER0 });
        await metaTxToken.unlock();
        await metaTxToken.setAuthority(USER0);

        const locked = await metaTxToken.locked();
        expect(locked).to.be.false;

        const tokenAuthorityLocal = await metaTxToken.authority();
        expect(tokenAuthorityLocal).to.equal(USER0);
      });

      it("shouldn't be able to unlock token by non-owner", async () => {
        await checkErrorRevert(metaTxToken.unlock({ from: USER2 }), "ds-auth-unauthorized");
        await checkErrorRevert(metaTxToken.setAuthority(USER0, { from: USER2 }), "ds-auth-unauthorized");

        const locked = await metaTxToken.locked();
        expect(locked).to.be.true;
      });
    });

    describe("when working with ether transfers", () => {
      it("should NOT accept eth", async () => {
        await checkErrorRevert(metaTxToken.send(2));
        const tokenBalance = await web3GetBalance(metaTxToken.address);
        expect(tokenBalance).to.be.zero;
      });
    });
  });

  describe("when using the contract through metatransactions", () => {
    describe("when working with MetaTxToken, should behave like normal token", () => {
      beforeEach("mint 1500000 tokens", async () => {
        await metaTxToken.unlock({ from: USER0 });
        await metaTxToken.mint(USER0, 1500000, { from: USER0 });
      });

      it("should be able to transfer tokens from own address", async () => {
        const txData = await metaTxToken.contract.methods.transfer(USER1, 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

        const tx = await metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

        await expectEvent(tx, "Transfer", [USER0, USER1, 300000]);
        const balanceAccount1 = await metaTxToken.balanceOf(USER0);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.eq.BN(300000);
      });

      it("should NOT be able to transfer more tokens than they have", async () => {
        const txData = await metaTxToken.contract.methods.transfer(USER1, 1500001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to transfer pre-approved tokens from address different than own", async () => {
        await metaTxToken.approve(USER1, 300000, { from: USER0 });
        const txData = await metaTxToken.contract.methods.transferFrom(USER0, USER1, 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await expectEvent(metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER2 }), "Transfer", [USER0, USER1, 300000]);
        const balanceAccount1 = await metaTxToken.balanceOf(USER0);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.eq.BN(300000);
        const allowance = await metaTxToken.allowance(USER0, USER1);
        expect(allowance).to.be.zero;
      });

      it("should NOT be able to transfer tokens from another address if NOT pre-approved", async () => {
        const txData = await metaTxToken.contract.methods.transferFrom(USER0, USER1, 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER2 }),
          "colony-metatx-function-call-unsuccessful"
        );
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than pre-approved", async () => {
        await metaTxToken.approve(USER1, 300000);
        const txData = await metaTxToken.contract.methods.transferFrom(USER0, USER1, 300001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER2 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than the source balance", async () => {
        await metaTxToken.approve(USER1, 300000, { from: USER0 });
        await metaTxToken.transfer(USER2, 1500000, { from: USER0 });
        const txData = await metaTxToken.contract.methods.transferFrom(USER0, USER1, 300001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER2 }),
          "colony-metatx-function-call-unsuccessful"
        );
        const balanceAccount2 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to approve token transfer for other accounts", async () => {
        const txData = await metaTxToken.contract.methods.approve(USER1, 200000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

        await expectEvent(metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER2 }), "Approval", [USER0, USER1, 200000]);
        const allowance = await metaTxToken.allowance(USER0, USER1);
        expect(allowance).to.eq.BN(200000);
      });
    });

    describe("when working with ERC20 functions and token is locked", () => {
      beforeEach(async () => {
        await metaTxToken.mint(USER0, 1500000, { from: USER0 });
        await metaTxToken.transfer(USER1, 1500000, { from: USER0 });
      });

      it("shouldn't be able to transfer tokens from own address", async () => {
        const txData = await metaTxToken.contract.methods.transfer(USER2, 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER2 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const balanceAccount1 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER2);
        expect(balanceAccount2).to.be.zero;
      });

      it("shouldn't be able to transfer pre-approved tokens", async () => {
        await metaTxToken.approve(USER2, 300000, { from: USER1 });

        const txData = await metaTxToken.contract.methods.transferFrom(USER1, USER2, 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER2, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER2, txData, r, s, v, { from: USER0 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const balanceAccount1 = await metaTxToken.balanceOf(USER1);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metaTxToken.balanceOf(USER2);
        expect(balanceAccount2).to.be.zero;
        const allowance = await metaTxToken.allowance(USER1, USER2);
        expect(allowance).to.eq.BN(300000);
      });
    });

    describe("when working with additional functions", () => {
      it("should be able to mint new tokens, when called by the Token owner", async () => {
        let txData = await metaTxToken.contract.methods.mint(USER0, 1500000).encodeABI();

        let { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

        await metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

        let totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        let balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500000);

        // Mint some more tokens
        txData = await metaTxToken.contract.methods.mint(USER0, 1).encodeABI();

        ({ r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address));

        const tx = metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

        await expectEvent(tx, "Mint", [USER0, 1]);
        totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500001);

        balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500001);
      });

      it("should be able to mint new tokens directly to sender, when called by the Token owner", async () => {
        const txData = await metaTxToken.contract.methods["mint(uint256)"](1500000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

        await metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metaTxToken.balanceOf(USER0);
        expect(balance).to.eq.BN(1500000);
      });

      it("should NOT be able to mint new tokens, when called by anyone NOT the Token owner", async () => {
        const txData = await metaTxToken.contract.methods.mint(USER0).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER0 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.be.zero;
      });

      it("should be able to burn others' tokens when they have approved them to do so", async () => {
        await metaTxToken.mint(USER1, 1500000, { from: USER0 });
        await metaTxToken.methods["approve(address,uint256)"](USER2, 500000, { from: USER1 });
        // await metaTxToken.approve(USER2, 500000, { FROM: USER1 });
        // await metaTxToken.burn(USER1, 500000, { from: USER2 });

        const txData = await metaTxToken.contract.methods["burn(address,uint256)"](USER1, 500000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER2, metaTxToken.address);

        await metaTxToken.executeMetaTransaction(USER2, txData, r, s, v, { from: USER0 });

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        const balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(1000000);
      });

      it("should NOT be able to burn others' tokens when the approved amount is less", async () => {
        await metaTxToken.mint(USER1, 1500000, { from: USER0 });
        await metaTxToken.methods["approve(address,uint256)"](USER2, 500000, { from: USER1 });

        const txData = await metaTxToken.contract.methods["burn(address,uint256)"](USER2, 500001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER2, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER2, txData, r, s, v, { from: USER0 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(1500000);
      });

      it("should be able to burn own tokens", async () => {
        // How truffle supports function overloads apparently
        await metaTxToken.mint(USER1, 1500000, { from: USER0 });

        const txData = await metaTxToken.contract.methods["burn(address,uint256)"](USER1, 500000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER0 });

        let totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        let balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(1000000);

        await metaTxToken.methods["burn(uint256)"](1000000, { from: USER1 });
        totalSupply = await metaTxToken.totalSupply();
        expect(totalSupply).to.be.zero;

        balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.be.zero;
      });

      it("should NOT be able to burn tokens if there's insufficient balance", async () => {
        await metaTxToken.mint(USER1, 5, { from: USER0 });

        const txData = await metaTxToken.contract.methods.burn(6).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER0 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const balance = await metaTxToken.balanceOf(USER1);
        expect(balance).to.eq.BN(5);
      });

      it("should be able to unlock token by owner", async () => {
        // Note: due to an apparent bug, we cannot call a parameterless function with transaction params, e.g. { from: senderAccount }
        // So change the owner to coinbase so we are able to call it without params
        await metaTxToken.setOwner(USER0, { from: USER0 });

        let txData = await metaTxToken.contract.methods.unlock().encodeABI();

        let { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

        await metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

        txData = await metaTxToken.contract.methods.setAuthority(USER0).encodeABI();
        ({ r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address));

        await metaTxToken.executeMetaTransaction(USER0, txData, r, s, v, { from: USER1 });

        const locked = await metaTxToken.locked();
        expect(locked).to.be.false;

        const tokenAuthorityLocal = await metaTxToken.authority();
        expect(tokenAuthorityLocal).to.equal(USER0);
      });

      it("shouldn't be able to unlock token by non-owner", async () => {
        let txData = await metaTxToken.contract.methods.unlock().encodeABI();

        let { r, s, v } = await getMetatransactionParameters(txData, USER2, metaTxToken.address);

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER2, txData, r, s, v, { from: USER0 }),
          "colony-metatx-function-call-unsuccessful"
        );

        txData = await metaTxToken.contract.methods.setAuthority(USER0).encodeABI();

        ({ r, s, v } = await getMetatransactionParameters(txData, USER1, metaTxToken.address));

        await checkErrorRevert(
          metaTxToken.executeMetaTransaction(USER1, txData, r, s, v, { from: USER0 }),
          "colony-metatx-function-call-unsuccessful"
        );

        const locked = await metaTxToken.locked();
        expect(locked).to.be.true;
        const tokenAuthorityLocal = await metaTxToken.authority();
        expect(tokenAuthorityLocal).to.equal(ADDRESS_ZERO);
      });
    });
  });

  describe("when using the permit functionality", () => {
    it("permit should work", async () => {
      await metaTxToken.unlock();

      let allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(0);

      const { r, s, v } = await getPermitParameters(USER0, USER1, 100, 1000000000000, metaTxToken.address);

      const tx = await metaTxToken.permit(USER0, USER1, 100, 1000000000000, v, r, s, { from: USER2 });

      await expectEvent(tx, "Approval", [USER0, USER1, 100]);

      allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(100);
    });

    it("permit with deadline in the past doesn't work", async () => {
      await metaTxToken.unlock();

      const { r, s, v } = await getPermitParameters(USER0, USER1, 100, 1, metaTxToken.address);

      await checkErrorRevert(metaTxToken.permit(USER0, USER1, 100, 1, v, r, s, { from: USER2 }), "colony-token-expired-deadline");

      const allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(0);
    });

    it("permit does not allow a tx to be replayed", async () => {
      await metaTxToken.unlock();

      let allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(0);

      const { r, s, v } = await getPermitParameters(USER0, USER1, 100, 1000000000000, metaTxToken.address);

      await metaTxToken.permit(USER0, USER1, 100, 1000000000000, v, r, s, { from: USER2 });

      await metaTxToken.approve(USER1, 300000, { from: USER0 });

      await checkErrorRevert(metaTxToken.permit(USER0, USER1, 100, 1000000000000, v, r, s, { from: USER2 }), "colony-token-invalid-signature");

      allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(300000);
    });

    it("permit expects a valid signature", async () => {
      await metaTxToken.unlock();

      let allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(0);

      const { r, s } = await getPermitParameters(USER0, USER1, 100, 1000000000000, metaTxToken.address);

      const v = 100;

      await checkErrorRevert(metaTxToken.permit(USER0, USER1, 100, 1000000000000, v, r, s, { from: USER2 }), "colony-token-invalid-signature");

      allowance = await metaTxToken.allowance(USER0, USER1);
      expect(allowance).to.eq.BN(0);
    });
  });
});
