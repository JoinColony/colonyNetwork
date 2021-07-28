/* eslint-disable no-underscore-dangle */
/* global artifacts */

import path from "path";
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";
import TruffleLoader from "../../packages/reputation-miner/TruffleLoader";
import { setupEtherRouter } from "../../helpers/upgradable-contracts";

import MetatransactionBroadcaster from "../../packages/metatransaction-broadcaster/MetatransactionBroadcaster";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, getMetatransactionParameters, setupColony } from "../../helpers/test-data-generator";

const axios = require("axios");

const { expect } = chai;
const ganacheAccounts = require("../../ganache-accounts.json"); // eslint-disable-line import/no-unresolved

const ColonyExtension = artifacts.require("ColonyExtension");
const CoinMachine = artifacts.require("CoinMachine");
const MetaTxToken = artifacts.require("MetaTxToken");
const Resolver = artifacts.require("Resolver");

chai.use(bnChai(web3.utils.BN));

const realProviderPort = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${realProviderPort}`);

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "..", "build", "contracts"),
});

contract("Metatransaction broadcaster", (accounts) => {
  const USER0 = accounts[0];
  const USER1 = accounts[1];

  let colonyNetwork;
  let colony;

  let broadcaster;
  let metaTxToken;

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    metaTxToken = await MetaTxToken.new("Test", "TEST", 18);
    colony = await setupColony(colonyNetwork, metaTxToken.address);

    broadcaster = new MetatransactionBroadcaster({
      privateKey: `0x${ganacheAccounts.private_keys[accounts[0].toLowerCase()]}`,
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
      const valid = await broadcaster.isAddressValid(colony.address);
      expect(valid).to.be.equal(true);
    });

    it("transactions to an extension are accepted", async function () {
      const COIN_MACHINE = soliditySha3("CoinMachine");

      const coinMachineImplementation = await CoinMachine.new();
      const resolver = await Resolver.new();
      await setupEtherRouter("CoinMachine", { CoinMachine: coinMachineImplementation.address }, resolver);

      const { metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
      await metaColony.addExtensionToNetwork(COIN_MACHINE, resolver.address);

      const versionSig = await resolver.stringToSig("version()");
      const target = await resolver.lookup(versionSig);
      const extensionImplementation = await ColonyExtension.at(target);
      const coinMachineVersion = await extensionImplementation.version();

      await colony.installExtension(COIN_MACHINE, coinMachineVersion);
      const coinMachineAddress = await colonyNetwork.getExtensionInstallation(COIN_MACHINE, colony.address);

      const valid = await broadcaster.isAddressValid(coinMachineAddress);
      expect(valid).to.be.equal(true);
    });

    it("transactions to a token are not accepted based on address", async function () {
      const tokenAddress = await colony.getToken();

      const valid = await broadcaster.isAddressValid(tokenAddress);
      expect(valid).to.be.equal(false);
    });

    it("transactions to a token are accepted base on destination address for transfer", async function () {
      // A random user address is rejected
      let txData = await metaTxToken.contract.methods.transfer(USER1, 300000).encodeABI();
      let valid = await broadcaster.isTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(false);

      // Going to a colony is okay though
      txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();
      valid = await broadcaster.isTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(true);
    });
    it("transactions to a token are accepted base on destination address for transferFrom", async function () {
      // A random user address is rejected
      let txData = await metaTxToken.contract.methods.transferFrom(USER0, USER1, 300000).encodeABI();
      let valid = await broadcaster.isTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(false);

      // Going to a colony is okay though
      txData = await metaTxToken.contract.methods.transferFrom(USER0, colony.address, 300000).encodeABI();
      valid = await broadcaster.isTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(true);
    });

    it("transactions to a token are accepted base on destination address for approve", async function () {
      // A random user address is rejected
      let txData = await metaTxToken.contract.methods.approve(USER1, 300000).encodeABI();
      let valid = await broadcaster.isTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(false);

      // Going to a colony is okay though
      txData = await metaTxToken.contract.methods.approve(colony.address, 300000).encodeABI();
      valid = await broadcaster.isTransactionValid(metaTxToken.address, txData);

      expect(valid).to.be.equal(true);
    });
  });

  describe("should correctly respond to POSTs to the /broadcast endpoint", function () {
    it("a valid transaction is broadcast and mined", async function () {
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(colony.address, 300000).encodeABI();

      const { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

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

    it("an invalid transaction is rejected and not mined", async function () {
      await metaTxToken.mint(USER0, 1500000, { from: USER0 });

      const txData = await metaTxToken.contract.methods.transfer(USER1, 300000).encodeABI();

      const { r, s, v } = await getMetatransactionParameters(txData, USER0, metaTxToken.address);

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
  });
});
