/* globals artifacts */
import { getTokenArgs, web3GetNetwork, web3GetBalance, checkErrorRevert, checkErrorNonPayableFunction, expectEvent } from "../helpers/test-helper";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const EtherRouter = artifacts.require("EtherRouter");
const Colony = artifacts.require("Colony");
const Token = artifacts.require("Token");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Resolver = artifacts.require("Resolver");

contract("ColonyNetwork", accounts => {
  const TOKEN_ARGS = getTokenArgs();
  const OTHER_ACCOUNT = accounts[1];
  let colonyFunding;
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

    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
    await setupColonyVersionResolver(colony, colonyFunding, colonyTask, resolver, colonyNetwork);
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
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.notEqual(colonyAddress, 0x0);
      assert.equal(colonyCount.toNumber(), 1);
    });

    it("should maintain correct count of colonies", async () => {
      const token = await Token.new(...getTokenArgs());
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      const colonyCount = await colonyNetwork.getColonyCount.call();
      assert.equal(colonyCount.toNumber(), 7);
    });

    it("when meta colony is created, should have the root global and local skills initialised, plus the local mining skill", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createMetaColony(token.address);
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 3);
      const rootGlobalSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootGlobalSkill[0].toNumber(), 0);
      assert.equal(rootGlobalSkill[1].toNumber(), 0);

      const globalSkill1 = await colonyNetwork.isGlobalSkill.call(1);
      assert.isTrue(globalSkill1);

      const globalSkill2 = await colonyNetwork.isGlobalSkill.call(2);
      assert.isFalse(globalSkill2);

      const localSkill1 = await colonyNetwork.isGlobalSkill.call(3);
      assert.isFalse(localSkill1);

      const rootGlobalSkillId = await colonyNetwork.getRootGlobalSkillId.call();
      assert.equal(rootGlobalSkillId, 1);
    });

    it("should fail to create meta colony if it already exists", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createMetaColony(token.address);
      const metaColonyAddress1 = await colonyNetwork.getMetaColony.call();

      await checkErrorRevert(colonyNetwork.createMetaColony(token.address));
      const metaColonyAddress2 = await colonyNetwork.getMetaColony.call();
      assert.equal(metaColonyAddress1, metaColonyAddress2);
    });

    it("when any colony is created, should have the root local skill initialised", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const rootLocalSkill = await colonyNetwork.getSkill.call(1);
      assert.equal(rootLocalSkill[0].toNumber(), 0);
      assert.equal(rootLocalSkill[1].toNumber(), 0);

      const isGlobal = await colonyNetwork.isGlobalSkill.call(2);
      assert.isFalse(isGlobal);

      const { colonyAddress } = logs[0].args;
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
        await colonyNetwork.createColony(token.address, { value: 1, gas: createColonyGas });
      } catch (err) {
        checkErrorNonPayableFunction(err);
      }
      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      assert.equal(0, colonyNetworkBalance.toNumber());
    });

    it("should log a ColonyAdded event", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await expectEvent(colonyNetwork.createColony(token.address), "ColonyAdded");
    });
  });

  describe("when getting existing colonies", () => {
    it("should allow users to get the address of a colony by its index", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      const colonyAddress = await colonyNetwork.getColony.call(3);
      assert.notEqual(colonyAddress, "0x0000000000000000000000000000000000000000");
    });

    it("should return an empty address if there is no colony for the index provided", async () => {
      const colonyAddress = await colonyNetwork.getColony.call(15);
      assert.equal(colonyAddress, "0x0000000000000000000000000000000000000000");
    });

    it("should be able to get the Colony version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version.call();
      assert.equal(version.toNumber(), actualColonyVersion.toNumber());
    });
  });

  describe("when upgrading a colony", () => {
    it("should be able to upgrade a colony, if a colony owner", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyId, colonyAddress } = logs[0].args;
      const colony = await EtherRouter.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await colonyNetwork.upgradeColony(colonyId, newVersion);
      const colonyResolver = await colony.resolver.call();
      assert.equal(colonyResolver, sampleResolver);
    });

    it("should NOT be able to upgrade a colony to a lower version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyId, colonyAddress } = logs[0].args;
      await Colony.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.sub(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await checkErrorRevert(colonyNetwork.upgradeColony(colonyId, newVersion));
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it("should NOT be able to upgrade a colony to a nonexistent version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyId } = logs[0].args;
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();

      await checkErrorRevert(colonyNetwork.upgradeColony(colonyId, newVersion));
      assert.equal(version.toNumber(), currentColonyVersion.toNumber());
    });

    it("should NOT be able to upgrade a colony if not a colony owner", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyId, colonyAddress } = logs[0].args;
      const colony = await EtherRouter.at(colonyAddress);
      const colonyResolver = await colony.resolver.call();

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
      const newVersion = currentColonyVersion.add(1).toNumber();
      await colonyNetwork.addColonyVersion(newVersion, sampleResolver);

      await checkErrorRevert(colonyNetwork.upgradeColony(colonyId, newVersion, { from: OTHER_ACCOUNT }));
      assert.notEqual(colonyResolver, sampleResolver);
    });
  });

  describe("when adding a skill", () => {
    beforeEach(async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      await token.setOwner(colonyAddress);
    });

    it("should not be able to add a global skill, by an address that is not the meta colony ", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1, true));
      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 1);
    });

    it("should NOT be able to add a local skill, by an address that is not a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(2, false));

      const skillCount = await colonyNetwork.getSkillCount.call();
      assert.equal(skillCount.toNumber(), 1);
    });
  });
});
