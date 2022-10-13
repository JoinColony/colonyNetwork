/* eslint-disable no-underscore-dangle */
/* global artifacts */

const path = require("path");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");
const axios = require("axios");
const { TruffleLoader } = require("../../packages/package-utils");
const { setupEtherRouter } = require("../../helpers/upgradable-contracts");
const { UINT256_MAX } = require("../../helpers/constants");

const MetatransactionBroadcaster = require("../../packages/metatransaction-broadcaster/MetatransactionBroadcaster");
const { getMetaTransactionParameters, getPermitParameters, setupColony } = require("../../helpers/test-data-generator");

const { expect } = chai;
const ganacheAccounts = require("../../ganache-accounts.json"); // eslint-disable-line import/no-unresolved

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const ColonyExtension = artifacts.require("ColonyExtension");
const CoinMachine = artifacts.require("CoinMachine");
const MetaTxToken = artifacts.require("MetaTxToken");
const Resolver = artifacts.require("Resolver");
const GasGuzzler = artifacts.require("GasGuzzler");

chai.use(bnChai(web3.utils.BN));

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${realProviderPort}`);

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts"),
});

contract("Metatransaction broadcaster", (accounts) => {
  const USER0 = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colonyNetwork;
  let colony;

  let broadcaster;
  let metaTxToken;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    metaTxToken = await MetaTxToken.new("Test", "TEST", 18);
    colony = await setupColony(colonyNetwork, metaTxToken.address);

    broadcaster = new MetatransactionBroadcaster({
      privateKey: `${ganacheAccounts.private_keys[accounts[0].toLowerCase()]}`,
      loader,
      provider,
    });
    await broadcaster.initialise(colonyNetwork.address);
  });

  afterEach(async () => {
    await broadcaster.close();
  });

  describe("should correctly identify transactions as valid or not", function () {
    it("transactions to network, token locking are accepted", async function () {
      let valid = await broadcaster.isAddressValid(colonyNetwork.address);
      expect(valid).to.be.equal(true);

      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      valid = await broadcaster.isAddressValid(tokenLockingAddress);
      expect(valid).to.be.equal(true);
    });

    it("transactions to a colony are accepted", async function () {
      let valid = await broadcaster.isAddressValid(colony.address);
      expect(valid).to.be.equal(true);
      // This second call hits the cache
      valid = await broadcaster.isAddressValid(colony.address);
      expect(valid).to.be.equal(true);
    });

    it("transactions to an extension are accepted", async function () {
      const COIN_MACHINE = soliditySha3("CoinMachine");

      const coinMachineImplementation = await CoinMachine.new();
      const resolver = await Resolver.new();
      await setupEtherRouter("CoinMachine", { CoinMachine: coinMachineImplementation.address }, resolver);

      const versionSig = await resolver.stringToSig("version()");
      const target = await resolver.lookup(versionSig);
      const extensionImplementation = await ColonyExtension.at(target);
      const coinMachineVersion = await extensionImplementation.version();

      await colony.installExtension(COIN_MACHINE, coinMachineVersion);
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);

      const valid = await broadcaster.isAddressValid(coinMachineAddress);
      expect(valid).to.be.equal(true);
    });

    it("transactions that try to execute a forbidden method on a Colony are rejected", async function () {
      let txData = await colony.contract.methods.makeArbitraryTransaction(colony.address, "0x00000000").encodeABI();
      let valid = await broadcaster.isColonyFamilyTransactionAllowed(colony.address, txData);
      expect(valid).to.be.equal(false);

      txData = await colony.contract.methods.makeArbitraryTransactions([colony.address], ["0x00000000"], false).encodeABI();
      valid = await broadcaster.isColonyFamilyTransactionAllowed(colony.address, txData);
      expect(valid).to.be.equal(false);

      txData = await colony.contract.methods.makeSingleArbitraryTransaction(colony.address, "0x00000000").encodeABI();
      valid = await broadcaster.isColonyFamilyTransactionAllowed(colony.address, txData);
      expect(valid).to.be.equal(false);
    });

    it("transactions to a token are not accepted based on address", async function () {
      const tokenAddress = await colony.getToken();

      const valid = await broadcaster.isAddressValid(tokenAddress);
      expect(valid).to.be.equal(false);
    });

    it("transactions to a user's address are invalid", async function () {
      const valid = await broadcaster.isAddressValid(USER0);
      expect(valid).to.be.equal(false);
    });

    it("transactions to a token are accepted base on destination address for transfer", async function () {
      // A random user address is rejected
      let txData = await metaTxToken.contract.methods.transfer(USER1, 300000).encodeABI();
      let valid = await broadcaster.isTokenTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(false);

      // Going to a colony is okay though
      txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();
      valid = await broadcaster.isTokenTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(true);
    });

    it("transactions to a token are accepted base on destination address for transferFrom", async function () {
      // A random user address is rejected
      let txData = await metaTxToken.contract.methods.transferFrom(USER0, USER1, 300000).encodeABI();
      let valid = await broadcaster.isTokenTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(false);

      // Going to a colony is okay though
      txData = await metaTxToken.contract.methods.transferFrom(USER0, colony.address, 300000).encodeABI();
      valid = await broadcaster.isTokenTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(true);
    });

    it("transactions to a token are accepted based on destination address for approve", async function () {
      // A random user address is rejected
      let txData = await metaTxToken.contract.methods.approve(USER1, 300000).encodeABI();
      let valid = await broadcaster.isTokenTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(false);

      // Going to a colony is okay though
      txData = await metaTxToken.contract.methods.approve(colony.address, 300000).encodeABI();
      valid = await broadcaster.isTokenTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(true);
    });
  });

  describe("should correctly respond to POSTs to the /broadcast endpoint", function () {
    it("a valid transaction is broadcast and mined", async function () {
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };

      const res = await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const { txHash } = res.data.data;

      expect(txHash.length).to.be.equal(66);

      expect(res.data).to.be.deep.equal({
        status: "success",
        data: {
          txHash,
        },
      });

      // Check the transaction happened
      const balanceAccount1 = await metaTxToken.balanceOf(USER0);
      expect(balanceAccount1).to.eq.BN(1200000);
      const balanceAccount2 = await metaTxToken.balanceOf(colony.address);
      expect(balanceAccount2).to.eq.BN(300000);
    });

    it("valid transactions broadcast near-simultaneously are still mined", async function () {
      await metaTxToken.unlock();
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });
      await metaTxToken.mint(USER1, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, metaTxToken.address);
      const { r: r2, s: s2, v: v2 } = await getMetaTransactionParameters(txData, USER1, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };

      const req = axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      jsonData.r = r2;
      jsonData.s = s2;
      jsonData.v = v2;
      jsonData.userAddress = USER1;

      const req2 = axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const res = await req;
      const res2 = await req2;

      const { txHash } = res.data.data;
      const { txHash: txHash2 } = res2.data.data;

      expect(txHash.length).to.be.equal(66);

      expect(res.data).to.be.deep.equal({
        status: "success",
        data: {
          txHash,
        },
      });

      expect(res2.data).to.be.deep.equal({
        status: "success",
        data: {
          txHash: txHash2,
        },
      });

      // Check the transaction happened
      const balanceAccount1 = await metaTxToken.balanceOf(USER0);
      expect(balanceAccount1).to.eq.BN(1200000);
      const balanceAccount2 = await metaTxToken.balanceOf(USER1);
      expect(balanceAccount2).to.eq.BN(1200000);
      const balanceColony = await metaTxToken.balanceOf(colony.address);
      expect(balanceColony).to.eq.BN(600000);
    });

    it("a valid transaction is broadcast and mined, even if the broadcaster's nonce manager fell behind", async function () {
      await metaTxToken.unlock();
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });
      await metaTxToken.mint(USER1, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, metaTxToken.address);
      const { r: r2, s: s2, v: v2 } = await getMetaTransactionParameters(txData, USER1, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };

      const res = await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Make an unexpected transaction
      await metaTxToken.mint(USER2, 1500000, { from: USER0 });

      jsonData.r = r2;
      jsonData.s = s2;
      jsonData.v = v2;
      jsonData.userAddress = USER1;

      await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const { txHash } = res.data.data;

      expect(txHash.length).to.be.equal(66);

      expect(res.data).to.be.deep.equal({
        status: "success",
        data: {
          txHash,
        },
      });

      // Check the transaction happened
      const balanceAccount1 = await metaTxToken.balanceOf(USER0);
      expect(balanceAccount1).to.eq.BN(1200000);
      const balanceAccount2 = await metaTxToken.balanceOf(colony.address);
      expect(balanceAccount2).to.eq.BN(600000);
    });

    it("a valid transaction is broadcast and mined, even if the broadcaster's nonce manager got ahead", async function () {
      await metaTxToken.unlock();
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });
      await metaTxToken.mint(USER1, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, metaTxToken.address);
      const { r: r2, s: s2, v: v2 } = await getMetaTransactionParameters(txData, USER1, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };

      let res = await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Set the nonce
      const txCount = await provider.getTransactionCount(accounts[0]);
      await broadcaster.nonceManager.setTransactionCount(txCount + 1);

      jsonData.r = r2;
      jsonData.s = s2;
      jsonData.v = v2;
      jsonData.userAddress = USER1;

      res = await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const { txHash } = res.data.data;

      expect(txHash.length).to.be.equal(66);

      expect(res.data).to.be.deep.equal({
        status: "success",
        data: {
          txHash,
        },
      });

      // Check the transaction happened
      const balanceAccount1 = await metaTxToken.balanceOf(USER0);
      expect(balanceAccount1).to.eq.BN(1200000);
      const balanceAccount2 = await metaTxToken.balanceOf(colony.address);
      expect(balanceAccount2).to.eq.BN(600000);
    });

    it("a valid EIP712 transaction is broadcast and mined", async function () {
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });

      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const { r, s, v } = await getPermitParameters(USER0, colony.address, 1, deadline, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        owner: USER0,
        spender: colony.address,
        value: 1,
        deadline,
        r,
        s,
        v,
      };

      const res = await axios.post("http://127.0.0.1:3000/broadcast/", jsonData, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      const { txHash } = res.data.data;

      expect(txHash.length).to.be.equal(66);

      expect(res.data).to.be.deep.equal({
        status: "success",
        data: {
          txHash,
        },
      });

      // Check the transaction happened
      const allowed = await metaTxToken.allowance(USER0, colony.address);
      expect(allowed).to.eq.BN(1);
    });

    it("an EIP712 transaction with an invalid spender is not broadcast and mined", async function () {
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });

      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const { r, s, v } = await getPermitParameters(USER0, USER1, 1, deadline, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        owner: USER0,
        spender: USER1,
        value: 1,
        deadline,
        r,
        s,
        v,
      };

      let errored = false;

      try {
        await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        errored = true;
        expect(err.response.data).to.be.deep.equal({
          status: "fail",
          data: {
            payload: "Not a spender we pay metatransactions for",
          },
        });
      }
      expect(errored).to.be.equal(true);

      // Check the transaction did not happen
      const allowed = await metaTxToken.allowance(USER0, USER1);
      expect(allowed).to.eq.BN(0);
    });

    it("a valid transaction that uses multicall is broadcast and mined", async function () {
      await colony.contract.methods.setArchitectureRole(1, UINT256_MAX, USER1, 1, true).send({ from: USER0 });
      const awardPermission1 = await colony.contract.methods.setArchitectureRole(1, UINT256_MAX, USER1, 1, true).encodeABI();
      const awardPermission2 = await colony.contract.methods.setFundingRole(1, UINT256_MAX, USER1, 1, true).encodeABI();

      const txData = await colony.contract.methods.multicall([awardPermission1, awardPermission2]).encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, colony.address);
      // Send to endpoint

      const jsonData = {
        target: colony.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };
      try {
        const res = await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });

        const { txHash } = res.data.data;

        expect(txHash.length).to.be.equal(66);

        expect(res.data).to.be.deep.equal({
          status: "success",
          data: {
            txHash,
          },
        });
      } catch (err) {
        console.log(err.response.data);
      }

      // Check the transaction happened
      const roles = await colony.getUserRoles(USER1, 1);
      const roleArchitecture = ethers.BigNumber.from(2 ** 3).toHexString();
      const roleFunding = ethers.BigNumber.from(2 ** 5).toHexString();

      const expectedRoles = roleArchitecture | roleFunding; // eslint-disable-line no-bitwise
      expect(roles).to.equal(ethers.utils.hexZeroPad(ethers.BigNumber.from(expectedRoles).toHexString(), 32));
    });

    it("a multicall transaction that calls something invalid is rejected", async function () {
      const txData1 = await colony.contract.methods.setArchitectureRole(1, UINT256_MAX, USER1, 1, true).encodeABI();

      const colonyAsEtherRouter = await EtherRouter.at(colony.address);
      const resolverAddress = await colonyAsEtherRouter.resolver();

      // The invalid transaction is this one, which uses makeArbitraryTransaction to try and call owner() on the
      // colony itself.
      const txData2 = await colony.contract.methods
        .makeArbitraryTransaction(resolverAddress, web3.utils.soliditySha3("owner()").slice(0, 10))
        .encodeABI();
      const txData = await colony.contract.methods.multicall([txData1, txData2]).encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, colony.address);
      // Send to endpoint

      const jsonData = {
        target: colony.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };
      let failed = false;
      try {
        await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        failed = true;
      }
      expect(failed).to.be.equal(true);
    });

    it("a multicall transaction that calls a multicall that does something invalid is rejected", async function () {
      const txData1 = await colony.contract.methods.setArchitectureRole(1, UINT256_MAX, USER1, 1, true).encodeABI();

      const colonyAsEtherRouter = await EtherRouter.at(colony.address);
      const resolverAddress = await colonyAsEtherRouter.resolver();

      const txData2 = await colony.contract.methods
        .makeArbitraryTransaction(resolverAddress, web3.utils.soliditySha3("owner()").slice(0, 10))
        .encodeABI();
      const txDataCombined = await colony.contract.methods.multicall([txData1, txData2]).encodeABI();
      const txData = await colony.contract.methods.multicall([txData1, txDataCombined]).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, colony.address);
      // Send to endpoint

      const jsonData = {
        target: colony.address,
        payload: txDataCombined,
        userAddress: USER0,
        r,
        s,
        v,
      };
      let failed = false;
      try {
        await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        failed = true;
      }
      expect(failed).to.be.equal(true);
    });

    it("an invalid transaction is rejected and not mined", async function () {
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(USER1, 300000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, metaTxToken.address);

      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };
      let errored = false;
      try {
        await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        errored = true;
        expect(err.response.data).to.be.deep.equal({
          status: "fail",
          data: {
            payload: "Not a transaction we pay metatransactions for",
            target: "Not a contract we pay metatransactions for",
          },
        });
      }
      expect(errored).to.be.equal(true);

      // Check the transaction did not happen
      const balanceAccount1 = await metaTxToken.balanceOf(USER0);
      expect(balanceAccount1).to.eq.BN(1500000);
      const balanceAccount2 = await metaTxToken.balanceOf(colony.address);
      expect(balanceAccount2).to.eq.BN(0);
    });

    it("a transaction that would be valid but errors is rejected and not mined", async function () {
      await metaTxToken.mint(USER0, 100000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, metaTxToken.address);

      const ethBalanceBefore = await web3.eth.getBalance(USER0);
      // Send to endpoint

      const jsonData = {
        target: metaTxToken.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };
      let errored = false;
      try {
        await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        errored = true;
        expect(err.response.data).to.be.deep.equal({
          status: "fail",
          data: {
            payload: "Transaction reverts and will not be broadcast. It either fails outright, or uses too much gas.",
            reason: "VM Exception while processing transaction: revert colony-metatx-function-call-unsuccessful",
          },
        });
      }
      expect(errored).to.be.equal(true);

      // Check the transaction did not happen
      const balanceAccount1 = await metaTxToken.balanceOf(USER0);
      expect(balanceAccount1).to.eq.BN(100000);
      const balanceAccount2 = await metaTxToken.balanceOf(colony.address);
      expect(balanceAccount2).to.eq.BN(0);

      const ethBalanceAfter = await web3.eth.getBalance(USER0);

      expect(ethBalanceAfter).to.eq.BN(ethBalanceBefore);
    });

    it("a transaction that would be valid but is too expensive is rejected and not mined", async function () {
      const extensionImplementation = await GasGuzzler.new();
      const resolver = await Resolver.new();
      await setupEtherRouter("GasGuzzler", { GasGuzzler: extensionImplementation.address }, resolver);
      const TEST_EXTENSION = soliditySha3("GasGuzzler");

      const mcAddress = await colonyNetwork.getMetaColony();
      const metaColony = await IMetaColony.at(mcAddress);

      await metaColony.addExtensionToNetwork(TEST_EXTENSION, resolver.address);

      await colony.installExtension(TEST_EXTENSION, 1);

      const extensionAddress = await colonyNetwork.getExtensionInstallation(TEST_EXTENSION, colony.address);
      const guzzler = await GasGuzzler.at(extensionAddress);

      const txData = await guzzler.contract.methods.fun(10000).encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, USER0, guzzler.address);

      const ethBalanceBefore = await web3.eth.getBalance(USER0);
      // Send to endpoint

      const jsonData = {
        target: guzzler.address,
        payload: txData,
        userAddress: USER0,
        r,
        s,
        v,
      };
      let errored = false;
      try {
        await axios.post("http://127.0.0.1:3000/broadcast", jsonData, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        errored = true;
        expect(err.response.data).to.be.deep.equal({
          status: "fail",
          data: {
            payload: "Transaction reverts and will not be broadcast. It either fails outright, or uses too much gas.",
            reason: "VM Exception while processing transaction: revert colony-metatx-function-call-unsuccessful",
          },
        });
      }
      expect(errored).to.be.equal(true);

      // Check the transaction did not happen
      const ethBalanceAfter = await web3.eth.getBalance(USER0);
      expect(ethBalanceAfter).to.eq.BN(ethBalanceBefore);
    });
  });
});
