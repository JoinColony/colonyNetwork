/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import { getTokenArgs, web3GetNetwork, web3GetBalance, checkErrorRevert, expectEvent } from "../helpers/test-helper";

import { setupColonyVersionResolver } from "../helpers/upgradable-contracts";

const namehash = require("eth-ens-namehash");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ENSRegistry = artifacts.require("ENSRegistry");
const EtherRouter = artifacts.require("EtherRouter");
const Colony = artifacts.require("Colony");
const IMetaColony = artifacts.require("IMetaColony");
const Token = artifacts.require("Token");
const ColonyFunding = artifacts.require("ColonyFunding");
const ColonyTask = artifacts.require("ColonyTask");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Resolver = artifacts.require("Resolver");
const ContractRecovery = artifacts.require("ContractRecovery");

contract("Colony Network", accounts => {
  const TOKEN_ARGS = getTokenArgs();
  const OTHER_ACCOUNT = accounts[1];
  let colonyFunding;
  let colonyTask;
  let resolver;
  let resolverColonyNetworkDeployed;
  let colonyNetwork;
  let metaColony;
  let createColonyGas;
  let version;
  let contractRecovery;

  before(async () => {
    const network = await web3GetNetwork();
    createColonyGas = network === "1999" ? "0xfffffffffff" : 4e6;
    resolverColonyNetworkDeployed = await Resolver.deployed();
  });

  beforeEach(async () => {
    const colony = await Colony.new();
    version = await colony.version();
    resolver = await Resolver.new();
    colonyFunding = await ColonyFunding.new();
    colonyTask = await ColonyTask.new();
    contractRecovery = await ContractRecovery.new();

    const etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    await setupColonyVersionResolver(colony, colonyFunding, colonyTask, contractRecovery, resolver);
    await colonyNetwork.initialise(resolver.address);

    const metaColonyToken = await Token.new("Colony Network Token", "CLNY", 18);
    await colonyNetwork.createMetaColony(metaColonyToken.address);
    const metaColonyAddress = await colonyNetwork.getMetaColony();
    metaColony = await IMetaColony.at(metaColonyAddress);
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colonyNetwork.send(1);
      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      assert.equal(colonyNetworkBalance, 1);
    });

    it("should have the correct current Colony version set", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(currentColonyVersion).to.eq.BN(1);
    });

    it("should have the Resolver for current Colony version set", async () => {
      const currentResolver = await colonyNetwork.getColonyVersionResolver(version.toNumber());
      assert.equal(currentResolver, resolver.address);
    });

    it("should be able to register a higher Colony contract version", async () => {
      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const updatedVersion = currentColonyVersion.addn(1).toNumber();
      await metaColony.addNetworkColonyVersion(updatedVersion, sampleResolver);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      assert.equal(updatedColonyVersion.toNumber(), updatedVersion);
      const currentResolver = await colonyNetwork.getColonyVersionResolver(updatedVersion);
      assert.equal(currentResolver.toLowerCase(), sampleResolver);
    });

    it("when registering a lower version of the Colony contract, should NOT update the current (latest) colony version", async () => {
      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      await metaColony.addNetworkColonyVersion(currentColonyVersion.subn(1).toNumber(), sampleResolver);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      assert.equal(updatedColonyVersion.toNumber(), currentColonyVersion.toNumber());
    });
  });

  describe("when creating new colonies", () => {
    it("should allow users to create new colonies", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colonyCount = await colonyNetwork.getColonyCount();
      assert.notEqual(colonyAddress, 0x0);
      expect(colonyCount).to.eq.BN(2);
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
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colonyCount).to.eq.BN(8);
    });

    it("when meta colony is created, should have the root global and local skills initialised, plus the local mining skill", async () => {
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);
      const rootGlobalSkill = await colonyNetwork.getSkill(1);
      expect(rootGlobalSkill[0]).to.be.zero;
      expect(rootGlobalSkill[1]).to.be.zero;

      const globalSkill1 = await colonyNetwork.getSkill(1);
      expect(globalSkill1[2]).to.be.true;

      const globalSkill2 = await colonyNetwork.getSkill(2);
      expect(globalSkill2[2]).to.be.false;

      const localSkill1 = await colonyNetwork.getSkill(3);
      expect(localSkill1[2]).to.be.false;

      const rootGlobalSkillId = await colonyNetwork.getRootGlobalSkillId();
      expect(rootGlobalSkillId).to.eq.BN(1);
    });

    it("should fail to create meta colony if it already exists", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await checkErrorRevert(colonyNetwork.createMetaColony(token.address), "colony-meta-colony-exists-already");
    });

    it("when any colony is created, should have the root local skill initialised", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const rootLocalSkill = await colonyNetwork.getSkill(1);
      expect(rootLocalSkill[0]).to.be.zero;
      expect(rootLocalSkill[1]).to.be.zero;

      const skillCount = await colonyNetwork.getSkillCount();
      const skill = await colonyNetwork.getSkill(skillCount.addn(1));
      expect(skill[2]).to.be.false;

      const { colonyAddress } = logs[0].args;
      const colony = await Colony.at(colonyAddress);
      const rootDomain = await colony.getDomain(1);
      expect(rootDomain[0]).to.eq.BN(4);
      expect(rootDomain[1]).to.eq.BN(1);

      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);
    });

    it("should fail if ETH is sent", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await checkErrorRevert(colonyNetwork.createColony(token.address, { value: 1, gas: createColonyGas }));

      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      expect(colonyNetworkBalance).to.be.zero;
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
      const colonyAddress = await colonyNetwork.getColony(3);
      expect(colonyAddress).to.not.equal("0x0000000000000000000000000000000000000000");
    });

    it("should return an empty address if there is no colony for the index provided", async () => {
      const colonyAddress = await colonyNetwork.getColony(15);
      expect(colonyAddress).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("should be able to get the Colony version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colony = await Colony.at(colonyAddress);
      const actualColonyVersion = await colony.version();
      expect(version).to.eq.BN(actualColonyVersion);
    });
  });

  describe("when upgrading a colony", () => {
    it("should be able to upgrade a colony, if a sender has owner role", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colonyEtherRouter = await EtherRouter.at(colonyAddress);
      const colony = await Colony.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1).toNumber();
      await metaColony.addNetworkColonyVersion(newVersion, sampleResolver);

      await colony.upgrade(newVersion);
      const colonyResolver = await colonyEtherRouter.resolver();
      assert.equal(colonyResolver.toLowerCase(), sampleResolver);
    });

    it("should not be able to set colony resolver by directly calling `setResolver`", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colony = await EtherRouter.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1).toNumber();
      await metaColony.addNetworkColonyVersion(newVersion, sampleResolver);
      await checkErrorRevert(colony.setResolver(sampleResolver));
    });

    it("should NOT be able to upgrade a colony to a lower version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colony = await Colony.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.subn(1).toNumber();
      await metaColony.addNetworkColonyVersion(newVersion, sampleResolver);

      await checkErrorRevert(colony.upgrade(newVersion), "colony-version-must-be-newer");
      expect(version).to.eq.BN(currentColonyVersion);
    });

    it("should NOT be able to upgrade a colony to a nonexistent version", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1).toNumber();
      const colony = await Colony.at(colonyAddress);

      await checkErrorRevert(colony.upgrade(newVersion), "colony-version-must-be-registered");
      expect(version).to.eq.BN(currentColonyVersion);
    });

    it("should NOT be able to upgrade a colony if sender don't have owner role", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colonyEtherRouter = await EtherRouter.at(colonyAddress);
      const colonyResolver = await colonyEtherRouter.resolver();
      const colony = await Colony.at(colonyAddress);

      const sampleResolver = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1).toNumber();
      await metaColony.addNetworkColonyVersion(newVersion, sampleResolver);

      await checkErrorRevert(colony.upgrade(newVersion, { from: OTHER_ACCOUNT }));
      expect(colonyResolver).to.not.equal(sampleResolver);
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
      await checkErrorRevert(colonyNetwork.addSkill(1, true), "colony-must-be-meta-colony");
    });

    it("should NOT be able to add a local skill, by an address that is not a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1, false), "colony-caller-must-be-colony");
    });
  });

  describe("when managing ENS names", () => {
    const rootNode = namehash.hash("joincolony.eth");
    let ensRegistry;

    beforeEach(async () => {
      ensRegistry = await ENSRegistry.new();
      await ensRegistry.setOwner(rootNode, colonyNetwork.address);
      await colonyNetwork.setupRegistrar(ensRegistry.address, rootNode);
    });

    it("should own the root domains", async () => {
      let owner;
      owner = await ensRegistry.owner(rootNode);
      assert.equal(owner, colonyNetwork.address);

      owner = await ensRegistry.owner(namehash.hash("user.joincolony.eth"));
      assert.equal(owner, colonyNetwork.address);

      owner = await ensRegistry.owner(namehash.hash("colony.joincolony.eth"));
      assert.equal(owner, colonyNetwork.address);
    });

    const orbitDBAddress = "QmPFtHi3cmfZerxtH9ySLdzpg1yFhocYDZgEZywdUXHxFU/my-db-name";

    it("should be able to register one unique label per user", async () => {
      const username = "test";
      const username2 = "test2";
      const hash = namehash.hash("test.user.joincolony.eth");

      // User cannot register blank label
      await checkErrorRevert(colonyNetwork.registerUserLabel("", orbitDBAddress, { from: accounts[1] }), "colony-user-label-invalid");

      // User can register unique label
      await colonyNetwork.registerUserLabel("test", orbitDBAddress, { from: accounts[1] });

      // Check label resolves correctly.
      // First, query the registry to get the resolver
      const resolverAddress = await ensRegistry.resolver(hash);
      assert.equal(resolverAddress, colonyNetwork.address);
      // Then query the resolver
      const resolvedAddress = await colonyNetwork.addr(hash);
      assert.equal(resolvedAddress, accounts[1]);
      const owner = await ensRegistry.owner(hash);
      assert.equal(owner, colonyNetwork.address);

      // Check reverse lookup
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      assert.equal(lookedUpENSDomain, "test.user.joincolony.eth");

      // Get stored orbitdb address
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      assert.equal(retrievedOrbitDB, orbitDBAddress);

      // Label already in use
      await checkErrorRevert(colonyNetwork.registerUserLabel(username, orbitDBAddress, { from: accounts[2] }), "colony-label-already-owned");

      // Can't register two labels for a user
      await checkErrorRevert(colonyNetwork.registerUserLabel(username2, orbitDBAddress, { from: accounts[1] }), "colony-user-label-already-owned");
    });

    it("should be able to register one unique label per colony, if owner", async () => {
      const colonyName = "test";
      const colonyName2 = "test2";
      const hash = namehash.hash("test.colony.joincolony.eth");

      // Cargo-cult colony generation
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colony = await Colony.at(colonyAddress);

      // Non-owner can't register label for colony
      await checkErrorRevert(colony.registerColonyLabel(colonyName, { from: accounts[1] }));

      // Owner cannot register blank label
      await checkErrorRevert(colony.registerColonyLabel("", { from: accounts[0] }), "colony-colony-label-invalid");

      // Owner can register label for colony
      await colony.registerColonyLabel(colonyName, { from: accounts[0] });
      const owner = await ensRegistry.owner(hash);
      assert.equal(owner, colonyNetwork.address);

      // Check label resolves correctly
      // First, query the registry to get the resolver
      const resolverAddress = await ensRegistry.resolver(hash);
      assert.equal(resolverAddress, colonyNetwork.address);
      // Then query the resolver
      const resolvedAddress = await colonyNetwork.addr(hash);
      assert.equal(resolvedAddress, colonyAddress);

      // Check reverse lookup
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(colonyAddress);
      assert.equal(lookedUpENSDomain, "test.colony.joincolony.eth");

      // Can't register two labels for a colony
      await checkErrorRevert(colony.registerColonyLabel(colonyName2, { from: accounts[0] }), "colony-already-labeled");
    });

    it("should be able to register same name for user and a colony, and reverse lookup still work", async () => {
      // Register user
      await colonyNetwork.registerUserLabel("test", orbitDBAddress, { from: accounts[1] });

      // Set up colony
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address);
      const { colonyAddress } = logs[0].args;
      const colony = await Colony.at(colonyAddress);
      // Register colony
      // Owner can register label for colony
      await colony.registerColonyLabel("test", { from: accounts[0] });

      // Check reverse lookup for colony
      const lookedUpENSDomainColony = await colonyNetwork.lookupRegisteredENSDomain(colonyAddress);
      assert.equal(lookedUpENSDomainColony, "test.colony.joincolony.eth");

      // Check reverse lookup
      const lookedUpENSDomainUser = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      assert.equal(lookedUpENSDomainUser, "test.user.joincolony.eth");
    });

    it("should return a blank address if looking up an address with no Colony-based ENS name", async () => {
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(accounts[2]);
      assert.equal(lookedUpENSDomain, "");
    });

    it("should respond correctly to queries regarding ENS interfaces it supports", async () => {
      let response = await colonyNetwork.supportsInterface("0x01ffc9a7"); // supports 'supportsInterface(bytes4)'
      assert.isTrue(response);
      response = await colonyNetwork.supportsInterface("0x01ffc9a7"); // supports 'addr(bytes32)'
      assert.isTrue(response);
    });
  });
});
