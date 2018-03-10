/* globals artifacts */
import {
  getTokenArgs,
  web3GetNetwork,
  web3GetBalance,
  checkErrorRevert,
  getRandomString,
  checkErrorNonPayableFunction,
  expectEvent,
  checkError
} from "../helpers/test-helper";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const EtherRouter = artifacts.require("EtherRouter");
const Colony = artifacts.require("Colony");
const Token = artifacts.require("Token");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const ColonyTransactionReviewer = artifacts.require("ColonyTransactionReviewer");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Resolver = artifacts.require("Resolver");

contract("ColonyNetwork", accounts => {
  const COLONY_KEY = "COLONY_TEST";
  const TOKEN_ARGS = getTokenArgs();
  const OTHER_ACCOUNT = accounts[1];
  let colonyFunding;
  let colonyTransactionReviewer;
  let colonyTask;
  let resolver;
  let resolverColonyNetworkDeployed;
  let colonyNetwork;
  let createColonyGas;
  let version;

  before(async () => {
    const network = await web3GetNetwork();
    createColonyGas = network === "coverage" ? "0xfffffffffff" : 4e6;
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colony = await Colony.new();
    version = await colony.version.call();
    resolver = await Resolver.new();
    colonyFunding = await ColonyFunding.new();
    colonyTask = await ColonyTask.new();
    colonyTransactionReviewer = await ColonyTransactionReviewer.new();

    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await setupColonyVersionResolver(colony, colonyFunding, colonyTask, colonyTransactionReviewer, resolver, colonyNetwork);
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colonyNetwork.send(1);
      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      assert.equal(colonyNetworkBalance.toNumber(), 1);
    });

    it("should have the correct current Colony version set", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it("should have the Resolver for current Colony version set", async () => {
      const currentResolver = await colonyNetwork.getColonyVersionResolver.call(version.toNumber());
      assert.equal(currentResolver, resolver.address);
    });

    it("should be able to register a higher Colony contract version", async () => {
      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const updatedVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(updatedVersion, sampleResolver);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      assert.equal(updatedColonyVersion.toNumber(), updatedVersion);
      const currentResolver = await colonyNetwork.getColonyVersionResolver.call(updatedVersion);
      assert.equal(currentResolver, sampleResolver);
    });

    it("when registering a lower version of the Colony contract, should NOT update the current (latest) colony version", async () => {
      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      await colonyNetwork.addColonyVersion(currentColonyVersion.sub(1).toNumber(), sampleResolver);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      assert.equal(updatedColonyVersion.toNumber(), currentColonyVersion.toNumber());
    });
  });

  describe("when creating new colonies", () => {
    it("should allow users to create new colonies", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const address = await colonyNetwork.getColony.call(COLONY_KEY);
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.notEqual(address, 0x0);
      assert.equal(colonyCount.toNumber(), 1);
    });

    it("should revert if colony key is not unique", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const colonyAddress1 = await colonyNetwork.getColony.call(COLONY_KEY);

      await checkErrorRevert(colonyNetwork.createColony(COLONY_KEY, token.address, { gas: createColonyGas }));
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.equal(colonyCount.toNumber(), 1);
      const colonyAddress2 = await colonyNetwork.getColony.call(COLONY_KEY);
      assert.equal(colonyAddress2, colonyAddress1);
    });

    it("should maintain correct count of colonies", async () => {
      const token = await Token.new(...getTokenArgs());
      await colonyNetwork.createColony(getRandomString(7), token.address);
      await colonyNetwork.createColony(getRandomString(7), token.address);
      await colonyNetwork.createColony(getRandomString(7), token.address);
      await colonyNetwork.createColony(getRandomString(7), token.address);
      await colonyNetwork.createColony(getRandomString(7), token.address);
      await colonyNetwork.createColony(getRandomString(7), token.address);
      await colonyNetwork.createColony(getRandomString(7), token.address);
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.equal(colonyCount.toNumber(), 7);
    });

    it("when common colony is created, should have the root global and local skills initialised", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony("Common Colony", token.address);
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 2);
      const rootGlobalSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootGlobalSkill[0].toNumber(), 0);
      assert.equal(rootGlobalSkill[1].toNumber(), 0);

      const globalSkill1 = await colonyNetwork.isGlobalSkill.call(1);
      assert.isTrue(globalSkill1);

      const globalSkill2 = await colonyNetwork.isGlobalSkill.call(2);
      assert.isFalse(globalSkill2);

      const rootGlobalSkillId = await colonyNetwork.getRootGlobalSkillId.call();
      assert.equal(rootGlobalSkillId, 1);
    });

    it("when any colony is created, should have the root local skill initialised", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const rootLocalSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootLocalSkill[0].toNumber(), 0);
      assert.equal(rootLocalSkill[1].toNumber(), 0);

      const isGlobal = await colonyNetwork.isGlobalSkill.call(2);
      assert.isFalse(isGlobal);

      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await Colony.at(colonyAddress);
      const rootDomain = await colony.getDomain.call(1);
      assert.equal(rootDomain[0].toNumber(), 1);
      assert.equal(rootDomain[1].toNumber(), 1);

      const domainCount = await colony.getDomainCount.call();
      assert.equal(domainCount.toNumber(), 1);
    });

    it("should fail if ETH is sent", async () => {
      try {
        const token = await Token.new(...TOKEN_ARGS);
        await colonyNetwork.createColony(COLONY_KEY, token.address, { value: 1, gas: createColonyGas });
      } catch (err) {
        checkErrorNonPayableFunction(err);
      }
      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      assert.equal(0, colonyNetworkBalance.toNumber());
    });

    it("should log a ColonyAdded event", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await expectEvent(colonyNetwork.createColony(COLONY_KEY, token.address), "ColonyAdded");
    });
  });

  describe("when getting existing colonies", () => {
    it("should allow users to get the address of a colony by its index", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony("Colony1", token.address);
      await colonyNetwork.createColony("Colony2", token.address);
      await colonyNetwork.createColony("Colony3", token.address);
      const colonyAddress = await colonyNetwork.getColonyAt.call(3);
      assert.notEqual(colonyAddress, "0x0000000000000000000000000000000000000000");
    });

    it("should return an empty address if there is no colony for the index provided", async () => {
      const colonyAddress = await colonyNetwork.getColonyAt.call(15);
      assert.equal(colonyAddress, "0x0000000000000000000000000000000000000000");
    });

    it("should be able to get the Colony version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });
  });

  describe("when upgrading a colony", () => {
    it("should be able to upgrade a colony, if a colony owner", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await EtherRouter.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await colonyNetwork.upgradeColony(COLONY_KEY, newVersion);
      const colonyResolver = await colony.resolver.call();
      assert.equal(colonyResolver, sampleResolver);
    });

    it("should NOT be able to upgrade a colony to a lower version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      await Colony.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.sub(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await checkErrorRevert(colonyNetwork.upgradeColony(COLONY_KEY, newVersion));
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it("should NOT be able to upgrade a colony to a nonexistent version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();

      await checkErrorRevert(colonyNetwork.upgradeColony(COLONY_KEY, newVersion));
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it("should NOT be able to upgrade a colony if not a colony owner", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const colonyAddress = await colonyNetwork.getColony.call(COLONY_KEY);
      const colony = await EtherRouter.at(colonyAddress);
      const colonyResolver = await colony.resolver.call();

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await checkErrorRevert(colonyNetwork.upgradeColony(COLONY_KEY, newVersion, { from: OTHER_ACCOUNT }));
      assert.notEqual(colonyResolver, sampleResolver);
    });
  });

  describe("when adding a skill", () => {
    beforeEach(async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(COLONY_KEY, token.address);
      const colony = await colonyNetwork.getColony.call(COLONY_KEY);
      await token.setOwner(colony);
    });

    it("should not be able to add a global skill, by an address that is not the common colony ", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1, true));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 1);
    });

    it("should NOT be able to add a local skill, by an address that is not a Colony", async () => {
      await checkError(colonyNetwork.addSkill(2, false));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 1);
    });
  });
});
