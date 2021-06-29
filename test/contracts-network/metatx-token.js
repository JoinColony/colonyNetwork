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

contract("MetaTx token", (addresses) => {
  let colony;
  let metatxToken;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    metatxToken = await MetaTxToken.new("Test", "TEST", 18);
    const { logs } = await colonyNetwork.createColony(metatxToken.address, 0, "", "");
    const { colonyAddress } = logs.filter((x) => x.event === "ColonyAdded")[0].args;
    colony = await IColony.at(colonyAddress);
    await colony.setRewardInverse(100);
  });
  describe("when using the contract directly", () => {
    describe("when working with MetaTxToken, should behave like normal token", () => {
      beforeEach("mint 1500000 tokens", async () => {
        await metatxToken.unlock({ from: addresses[0] });
        await metatxToken.mint(addresses[0], 1500000, { from: addresses[0] });
      });

      it("should be able to get total supply", async () => {
        const total = await metatxToken.totalSupply();
        expect(total).to.eq.BN(1500000);
      });

      it("should be able to get token balance", async () => {
        const balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500000);
      });

      it("should be able to get allowance for address", async () => {
        await metatxToken.approve(addresses[1], 200000, { from: addresses[0] });
        const allowance = await metatxToken.allowance(addresses[0], addresses[1]);
        expect(allowance).to.eq.BN(200000);
      });

      it("should be able to transfer tokens from own address", async () => {
        const success = await metatxToken.transfer.call(addresses[1], 300000, { from: addresses[0] });
        expect(success).to.be.true;
        await expectEvent(metatxToken.transfer(addresses[1], 300000, { from: addresses[0] }), "Transfer", [addresses[0], addresses[1], 300000]);
        const balanceAccount1 = await metatxToken.balanceOf(addresses[0]);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.eq.BN(300000);
      });

      it("should NOT be able to transfer more tokens than they have", async () => {
        await checkErrorRevert(metatxToken.transfer(addresses[1], 1500001, { from: addresses[0] }), "ds-token-insufficient-balance");
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to transfer pre-approved tokens from address different than own", async () => {
        await metatxToken.approve(addresses[1], 300000, { from: addresses[0] });
        const success = await metatxToken.transferFrom.call(addresses[0], addresses[1], 300000, { from: addresses[1] });
        expect(success).to.be.true;

        await expectEvent(metatxToken.transferFrom(addresses[0], addresses[1], 300000, { from: addresses[1] }), "Transfer", [
          addresses[0],
          addresses[1],
          300000,
        ]);
        const balanceAccount1 = await metatxToken.balanceOf(addresses[0]);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.eq.BN(300000);
        const allowance = await metatxToken.allowance(addresses[0], addresses[1]);
        expect(allowance).to.be.zero;
      });

      it("should NOT be able to transfer tokens from another address if NOT pre-approved", async () => {
        await checkErrorRevert(
          metatxToken.transferFrom(addresses[0], addresses[1], 300000, { from: addresses[1] }),
          "ds-token-insufficient-approval"
        );
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than pre-approved", async () => {
        await metatxToken.approve(addresses[1], 300000);
        await checkErrorRevert(
          metatxToken.transferFrom(addresses[0], addresses[1], 300001, { from: addresses[1] }),
          "ds-token-insufficient-approval"
        );

        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than the source balance", async () => {
        await metatxToken.approve(addresses[1], 300000, { from: addresses[0] });
        await metatxToken.transfer(addresses[2], 1500000, { from: addresses[0] });

        await checkErrorRevert(metatxToken.transferFrom(addresses[0], addresses[1], 300000, { from: addresses[1] }), "ds-token-insufficient-balance");
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to approve token transfer for other accounts", async () => {
        const success = await metatxToken.approve.call(addresses[1], 200000, { from: addresses[0] });
        expect(success).to.be.true;

        await expectEvent(metatxToken.approve(addresses[1], 200000, { from: addresses[0] }), "Approval", [addresses[0], addresses[1], 200000]);
        const allowance = await metatxToken.allowance(addresses[0], addresses[1]);
        expect(allowance).to.eq.BN(200000);
      });
    });

    describe("when working with ERC20 functions and token is locked", () => {
      beforeEach(async () => {
        await metatxToken.mint(addresses[0], 1500000, { from: addresses[0] });
        await metatxToken.transfer(addresses[1], 1500000, { from: addresses[0] });
      });

      it("shouldn't be able to transfer tokens from own address", async () => {
        await checkErrorRevert(metatxToken.transfer(addresses[2], 300000, { from: addresses[1] }), "colony-token-unauthorised");

        const balanceAccount1 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[2]);
        expect(balanceAccount2).to.be.zero;
      });

      it("shouldn't be able to transfer pre-approved tokens", async () => {
        await metatxToken.approve(addresses[2], 300000, { from: addresses[1] });
        await checkErrorRevert(metatxToken.transferFrom(addresses[1], addresses[2], 300000, { from: addresses[2] }), "colony-token-unauthorised");

        const balanceAccount1 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[2]);
        expect(balanceAccount2).to.be.zero;
        const allowance = await metatxToken.allowance(addresses[1], addresses[2]);
        expect(allowance).to.eq.BN(300000);
      });
    });

    describe("when working with additional functions", () => {
      it("should be able to get the token decimals", async () => {
        const decimals = await metatxToken.decimals();
        expect(decimals).to.eq.BN(18);
      });

      it("should be able to get the token symbol", async () => {
        const symbol = await metatxToken.symbol();
        expect(symbol).to.equal("TEST");
      });

      it("should be able to get the token name", async () => {
        const name = await metatxToken.name();
        expect(name).to.equal("Test");
      });

      it("should be able to mint new tokens, when called by the Token owner", async () => {
        await metatxToken.mint(addresses[0], 1500000, { from: addresses[0] });

        let totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        let balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500000);

        // Mint some more tokens
        await expectEvent(metatxToken.mint(addresses[0], 1, { from: addresses[0] }), "Mint", [addresses[0], 1]);
        totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500001);

        balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500001);
      });

      it("should be able to mint new tokens directly to sender, when called by the Token owner", async () => {
        // How truffle supports function overloads apparently
        await metatxToken.methods["mint(uint256)"](1500000, { from: addresses[0] });

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500000);
      });

      it("should emit a Mint event when minting tokens", async () => {
        await expectEvent(metatxToken.mint(addresses[0], 1, { from: addresses[0] }), "Mint", [addresses[0], 1]);
        await expectEvent(metatxToken.methods["mint(uint256)"](1, { from: addresses[0] }), "Mint", [addresses[0], 1]);
      });

      it("should emit a Transfer event when minting tokens", async () => {
        await expectEvent(metatxToken.mint(addresses[0], 1, { from: addresses[0] }), "Transfer", [ADDRESS_ZERO, addresses[0], 1]);
        await expectEvent(metatxToken.methods["mint(uint256)"](1, { from: addresses[0] }), "Transfer", [ADDRESS_ZERO, addresses[0], 1]);
      });

      it("should NOT be able to mint new tokens, when called by anyone NOT the Token owner", async () => {
        await checkErrorRevert(metatxToken.mint(addresses[0], 1500000, { from: addresses[2] }), "ds-auth-unauthorized");
        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.be.zero;
      });

      it("should be able to burn others' tokens when they have approved them to do so", async () => {
        await metatxToken.mint(addresses[1], 1500000, { from: addresses[0] });
        await metatxToken.methods["approve(address,uint256)"](addresses[2], 500000, { from: addresses[1] });
        // await metatxToken.approve(addresses[2], 500000, { FROM: addresses[1] });
        // await metatxToken.burn(addresses[1], 500000, { from: addresses[2] });
        await metatxToken.methods["burn(address,uint256)"](addresses[1], 500000, { from: addresses[2] });

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        const balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(1000000);
      });

      it("should NOT be able to burn others' tokens when the approved amount is less", async () => {
        await metatxToken.mint(addresses[1], 1500000, { from: addresses[0] });
        await metatxToken.methods["approve(address,uint256)"](addresses[2], 500000, { from: addresses[1] });
        await checkErrorRevert(
          metatxToken.methods["burn(address,uint256)"](addresses[1], 500001, { from: addresses[2] }),
          "ds-token-insufficient-approval"
        );

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(1500000);
      });

      it("should be able to burn own tokens", async () => {
        // How truffle supports function overloads apparently
        await metatxToken.mint(addresses[1], 1500000, { from: addresses[0] });
        await metatxToken.methods["burn(address,uint256)"](addresses[1], 500000, { from: addresses[1] });

        let totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        let balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(1000000);

        await metatxToken.methods["burn(uint256)"](1000000, { from: addresses[1] });
        totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.be.zero;

        balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.be.zero;
      });

      it("should NOT be able to burn tokens if there's insufficient balance", async () => {
        await metatxToken.mint(addresses[1], 5, { from: addresses[0] });
        await checkErrorRevert(metatxToken.burn(6, { from: addresses[1] }), "ds-token-insufficient-balance");

        const balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(5);
      });

      it("should emit a Burn event when burning tokens", async () => {
        await metatxToken.methods["mint(uint256)"](1, { from: addresses[0] });
        await expectEvent(metatxToken.burn(1, { from: addresses[0] }), "Burn", [addresses[0], 1]);
      });

      it("should be able to unlock token by owner", async () => {
        // Note: due to an apparent bug, we cannot call a parameterless function with transaction params, e.g. { from: senderAccount }
        // So change the owner to coinbase so we are able to call it without params
        await metatxToken.setOwner(addresses[0], { from: addresses[0] });
        await metatxToken.unlock();
        await metatxToken.setAuthority(addresses[0]);

        const locked = await metatxToken.locked();
        expect(locked).to.be.false;

        const tokenAuthorityLocal = await metatxToken.authority();
        expect(tokenAuthorityLocal).to.equal(addresses[0]);
      });

      it("shouldn't be able to unlock token by non-owner", async () => {
        await checkErrorRevert(metatxToken.unlock({ from: addresses[2] }), "ds-auth-unauthorized");
        await checkErrorRevert(metatxToken.setAuthority(addresses[0], { from: addresses[2] }), "ds-auth-unauthorized");

        const locked = await metatxToken.locked();
        expect(locked).to.be.true;
      });
    });

    describe("when working with ether transfers", () => {
      it("should NOT accept eth", async () => {
        await checkErrorRevert(metatxToken.send(2));
        const tokenBalance = await web3GetBalance(metatxToken.address);
        expect(tokenBalance).to.be.zero;
      });
    });
  });

  describe("when using the contract through metatransactions", () => {
    describe("when working with MetaTxToken, should behave like normal token", () => {
      beforeEach("mint 1500000 tokens", async () => {
        await metatxToken.unlock({ from: addresses[0] });
        await metatxToken.mint(addresses[0], 1500000, { from: addresses[0] });
      });

      it("should be able to transfer tokens from own address", async () => {
        const txData = await metatxToken.contract.methods.transfer(addresses[1], 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address);

        const tx = await metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] });

        await expectEvent(tx, "Transfer", [addresses[0], addresses[1], 300000]);
        const balanceAccount1 = await metatxToken.balanceOf(addresses[0]);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.eq.BN(300000);
      });

      it("should NOT be able to transfer more tokens than they have", async () => {
        const txData = await metatxToken.contract.methods.transfer(addresses[1], 1500001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] }),
          "Function call not successful"
        );

        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to transfer pre-approved tokens from address different than own", async () => {
        await metatxToken.approve(addresses[1], 300000, { from: addresses[0] });
        const txData = await metatxToken.contract.methods.transferFrom(addresses[0], addresses[1], 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await expectEvent(metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[2] }), "Transfer", [
          addresses[0],
          addresses[1],
          300000,
        ]);
        const balanceAccount1 = await metatxToken.balanceOf(addresses[0]);
        expect(balanceAccount1).to.eq.BN(1200000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.eq.BN(300000);
        const allowance = await metatxToken.allowance(addresses[0], addresses[1]);
        expect(allowance).to.be.zero;
      });

      it("should NOT be able to transfer tokens from another address if NOT pre-approved", async () => {
        const txData = await metatxToken.contract.methods.transferFrom(addresses[0], addresses[1], 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[2] }),
          "Function call not successful"
        );
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than pre-approved", async () => {
        await metatxToken.approve(addresses[1], 300000);
        const txData = await metatxToken.contract.methods.transferFrom(addresses[0], addresses[1], 300001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[2] }),
          "Function call not successful"
        );

        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should NOT be able to transfer from another address more tokens than the source balance", async () => {
        await metatxToken.approve(addresses[1], 300000, { from: addresses[0] });
        await metatxToken.transfer(addresses[2], 1500000, { from: addresses[0] });
        const txData = await metatxToken.contract.methods.transferFrom(addresses[0], addresses[1], 300001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[2] }),
          "Function call not successful"
        );
        const balanceAccount2 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount2).to.be.zero;
      });

      it("should be able to approve token transfer for other accounts", async () => {
        const txData = await metatxToken.contract.methods.approve(addresses[1], 200000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address);

        await expectEvent(metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[2] }), "Approval", [
          addresses[0],
          addresses[1],
          200000,
        ]);
        const allowance = await metatxToken.allowance(addresses[0], addresses[1]);
        expect(allowance).to.eq.BN(200000);
      });
    });

    describe("when working with ERC20 functions and token is locked", () => {
      beforeEach(async () => {
        await metatxToken.mint(addresses[0], 1500000, { from: addresses[0] });
        await metatxToken.transfer(addresses[1], 1500000, { from: addresses[0] });
      });

      it("shouldn't be able to transfer tokens from own address", async () => {
        const txData = await metatxToken.contract.methods.transfer(addresses[2], 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[2] }),
          "Function call not successful"
        );

        const balanceAccount1 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[2]);
        expect(balanceAccount2).to.be.zero;
      });

      it("shouldn't be able to transfer pre-approved tokens", async () => {
        await metatxToken.approve(addresses[2], 300000, { from: addresses[1] });

        const txData = await metatxToken.contract.methods.transferFrom(addresses[1], addresses[2], 300000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[2], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[2], txData, r, s, v, { from: addresses[0] }),
          "Function call not successful"
        );

        const balanceAccount1 = await metatxToken.balanceOf(addresses[1]);
        expect(balanceAccount1).to.eq.BN(1500000);
        const balanceAccount2 = await metatxToken.balanceOf(addresses[2]);
        expect(balanceAccount2).to.be.zero;
        const allowance = await metatxToken.allowance(addresses[1], addresses[2]);
        expect(allowance).to.eq.BN(300000);
      });
    });

    describe("when working with additional functions", () => {
      it("should be able to mint new tokens, when called by the Token owner", async () => {
        let txData = await metatxToken.contract.methods.mint(addresses[0], 1500000).encodeABI();

        let { r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address);

        await metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] });

        let totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        let balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500000);

        // Mint some more tokens
        txData = await metatxToken.contract.methods.mint(addresses[0], 1).encodeABI();

        ({ r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address));

        const tx = metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] });

        await expectEvent(tx, "Mint", [addresses[0], 1]);
        totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500001);

        balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500001);
      });

      it("should be able to mint new tokens directly to sender, when called by the Token owner", async () => {
        const txData = await metatxToken.contract.methods["mint(uint256)"](1500000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address);

        await metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] });

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metatxToken.balanceOf(addresses[0]);
        expect(balance).to.eq.BN(1500000);
      });

      it("should NOT be able to mint new tokens, when called by anyone NOT the Token owner", async () => {
        const txData = await metatxToken.contract.methods.mint(addresses[0]).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[0] }),
          "Function call not successful"
        );

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.be.zero;
      });

      it("should be able to burn others' tokens when they have approved them to do so", async () => {
        await metatxToken.mint(addresses[1], 1500000, { from: addresses[0] });
        await metatxToken.methods["approve(address,uint256)"](addresses[2], 500000, { from: addresses[1] });
        // await metatxToken.approve(addresses[2], 500000, { FROM: addresses[1] });
        // await metatxToken.burn(addresses[1], 500000, { from: addresses[2] });

        const txData = await metatxToken.contract.methods["burn(address,uint256)"](addresses[1], 500000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[2], metatxToken.address);

        await metatxToken.executeMetaTransaction(addresses[2], txData, r, s, v, { from: addresses[0] });

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        const balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(1000000);
      });

      it("should NOT be able to burn others' tokens when the approved amount is less", async () => {
        await metatxToken.mint(addresses[1], 1500000, { from: addresses[0] });
        await metatxToken.methods["approve(address,uint256)"](addresses[2], 500000, { from: addresses[1] });

        const txData = await metatxToken.contract.methods["burn(address,uint256)"](addresses[2], 500001).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[2], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[2], txData, r, s, v, { from: addresses[0] }),
          "Function call not successful"
        );

        const totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1500000);

        const balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(1500000);
      });

      it("should be able to burn own tokens", async () => {
        // How truffle supports function overloads apparently
        await metatxToken.mint(addresses[1], 1500000, { from: addresses[0] });

        const txData = await metatxToken.contract.methods["burn(address,uint256)"](addresses[1], 500000).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[0] });

        let totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.eq.BN(1000000);

        let balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(1000000);

        await metatxToken.methods["burn(uint256)"](1000000, { from: addresses[1] });
        totalSupply = await metatxToken.totalSupply();
        expect(totalSupply).to.be.zero;

        balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.be.zero;
      });

      it("should NOT be able to burn tokens if there's insufficient balance", async () => {
        await metatxToken.mint(addresses[1], 5, { from: addresses[0] });

        const txData = await metatxToken.contract.methods.burn(6).encodeABI();

        const { r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[0] }),
          "Function call not successful"
        );

        const balance = await metatxToken.balanceOf(addresses[1]);
        expect(balance).to.eq.BN(5);
      });

      it("should be able to unlock token by owner", async () => {
        // Note: due to an apparent bug, we cannot call a parameterless function with transaction params, e.g. { from: senderAccount }
        // So change the owner to coinbase so we are able to call it without params
        await metatxToken.setOwner(addresses[0], { from: addresses[0] });

        let txData = await metatxToken.contract.methods.unlock().encodeABI();

        let { r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address);

        await metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] });

        txData = await metatxToken.contract.methods.setAuthority(addresses[0]).encodeABI();
        ({ r, s, v } = await getMetatransactionParameters(txData, addresses[0], metatxToken.address));

        await metatxToken.executeMetaTransaction(addresses[0], txData, r, s, v, { from: addresses[1] });

        const locked = await metatxToken.locked();
        expect(locked).to.be.false;

        const tokenAuthorityLocal = await metatxToken.authority();
        expect(tokenAuthorityLocal).to.equal(addresses[0]);
      });

      it("shouldn't be able to unlock token by non-owner", async () => {
        let txData = await metatxToken.contract.methods.unlock().encodeABI();

        let { r, s, v } = await getMetatransactionParameters(txData, addresses[2], metatxToken.address);

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[2], txData, r, s, v, { from: addresses[0] }),
          "Function call not successful"
        );

        txData = await metatxToken.contract.methods.setAuthority(addresses[0]).encodeABI();

        ({ r, s, v } = await getMetatransactionParameters(txData, addresses[1], metatxToken.address));

        await checkErrorRevert(
          metatxToken.executeMetaTransaction(addresses[1], txData, r, s, v, { from: addresses[0] }),
          "Function call not successful"
        );

        const locked = await metatxToken.locked();
        expect(locked).to.be.true;
        const tokenAuthorityLocal = await metatxToken.authority();
        expect(tokenAuthorityLocal).to.equal(ADDRESS_ZERO);
      });
    });
  });

  describe("when using the permit functionality", () => {
    it("permit should work", async () => {
      await metatxToken.unlock();

      let allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(0);

      const { r, s, v } = await getPermitParameters(addresses[0], addresses[1], 100, 1000000000000, metatxToken.address);

      const tx = await metatxToken.permit(addresses[0], addresses[1], 100, 1000000000000, v, r, s, { from: addresses[2] });

      await expectEvent(tx, "Approval", [addresses[0], addresses[1], 100]);

      allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(100);
    });

    it("permit with deadline in the past doesn't work", async () => {
      await metatxToken.unlock();

      const { r, s, v } = await getPermitParameters(addresses[0], addresses[1], 100, 1, metatxToken.address);

      await checkErrorRevert(
        metatxToken.permit(addresses[0], addresses[1], 100, 1, v, r, s, { from: addresses[2] }),
        "colony-token-expired-deadline"
      );

      const allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(0);
    });

    it("permit does not allow a tx to be replayed", async () => {
      await metatxToken.unlock();

      let allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(0);

      const { r, s, v } = await getPermitParameters(addresses[0], addresses[1], 100, 1000000000000, metatxToken.address);

      await metatxToken.permit(addresses[0], addresses[1], 100, 1000000000000, v, r, s, { from: addresses[2] });

      await metatxToken.approve(addresses[1], 300000, { from: addresses[0] });

      await checkErrorRevert(
        metatxToken.permit(addresses[0], addresses[1], 100, 1000000000000, v, r, s, { from: addresses[2] }),
        "colony-token-invalid-signature"
      );

      allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(300000);
    });

    it("permit expects a valid signature", async () => {
      await metatxToken.unlock();

      let allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(0);

      const { r, s } = await getPermitParameters(addresses[0], addresses[1], 100, 1000000000000, metatxToken.address);

      const v = 100;

      await checkErrorRevert(
        metatxToken.permit(addresses[0], addresses[1], 100, 1000000000000, v, r, s, { from: addresses[2] }),
        "colony-token-invalid-signature"
      );

      allowance = await metatxToken.allowance(addresses[0], addresses[1]);
      expect(allowance).to.eq.BN(0);
    });
  });
});
