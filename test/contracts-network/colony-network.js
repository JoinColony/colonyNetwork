/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";

import {
  getTokenArgs,
  web3GetNetwork,
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  expectNoEvent,
  getColonyEditable,
} from "../../helpers/test-helper";
import { CURR_VERSION, GLOBAL_SKILL_ID, MIN_STAKE, IPFS_HASH } from "../../helpers/constants";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../../helpers/test-data-generator";
import { setupENSRegistrar } from "../../helpers/upgradable-contracts";

const namehash = require("eth-ens-namehash");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ENSRegistry = artifacts.require("ENSRegistry");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const FunctionsNotAvailableOnColony = artifacts.require("FunctionsNotAvailableOnColony");

contract("Colony Network", (accounts) => {
  let newResolverAddress;
  const TOKEN_ARGS = getTokenArgs();
  const OTHER_ACCOUNT = accounts[1];
  let colonyNetwork;
  let metaColony;
  let createColonyGas;
  let version;

  before(async () => {
    const network = await web3GetNetwork();
    createColonyGas = network === "1999" ? "0xfffffffffff" : 4e6;
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    version = await colonyNetwork.getCurrentColonyVersion();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    // For upgrade tests, we need a resolver...
    const r = await Resolver.new();
    newResolverAddress = r.address.toLowerCase();
    // ... that knows the .finishUpgrade() function
    const sig = await r.stringToSig("finishUpgrade()");
    const metaColonyAsEtherRouter = await EtherRouter.at(metaColony.address);
    const wiredResolverAddress = await metaColonyAsEtherRouter.resolver();
    const wiredResolver = await Resolver.at(wiredResolverAddress);
    const finishUpgradeFunctionLocation = await wiredResolver.lookup(sig);
    await r.register("finishUpgrade()", finishUpgradeFunctionLocation);
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colonyNetwork.send(1);
      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      expect(colonyNetworkBalance).to.eq.BN(1);
    });

    it("should have the correct current Colony version set", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(currentColonyVersion).to.eq.BN(CURR_VERSION);
    });

    it("should have the Resolver for current Colony version set", async () => {
      const currentResolver = await colonyNetwork.getColonyVersionResolver(version);
      expect(currentResolver).to.not.equal(ethers.constants.AddressZero);
    });

    it("should be able to register a higher Colony contract version", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const updatedVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(updatedVersion, newResolverAddress);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(updatedColonyVersion).to.eq.BN(updatedVersion);
      const currentResolver = await colonyNetwork.getColonyVersionResolver(updatedVersion);
      expect(currentResolver.toLowerCase()).to.equal(newResolverAddress);
    });

    it("when registering a lower version of the Colony contract, should NOT update the current (latest) colony version", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      await metaColony.addNetworkColonyVersion(currentColonyVersion.subn(1), newResolverAddress);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(updatedColonyVersion).to.eq.BN(currentColonyVersion);
    });

    it("should not be able to set the token locking contract twice", async () => {
      await checkErrorRevert(colonyNetwork.setTokenLocking(ethers.constants.AddressZero), "colony-token-locking-address-already-set");
    });

    it("should not be able to initialise network twice", async () => {
      await checkErrorRevert(colonyNetwork.initialise("0xDde1400C69752A6596a7B2C1f2420Fb9A71c1FDA", 3), "colony-network-already-initialised");
    });

    it("should not be able to initialise the network with colony version number 0", async () => {
      const resolverColonyNetworkDeployed = await Resolver.deployed();
      const etherRouter = await EtherRouter.new();
      await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
      const colonyNetworkNew = await IColonyNetwork.at(etherRouter.address);

      await checkErrorRevert(colonyNetworkNew.initialise("0xDde1400C69752A6596a7B2C1f2420Fb9A71c1FDA", 0), "colony-network-invalid-version");
    });

    it("should be able to initialise the network with any colony version number greater than 0", async () => {
      const resolverColonyNetworkDeployed = await Resolver.deployed();
      const etherRouter = await EtherRouter.new();
      await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
      const colonyNetworkNew = await IColonyNetwork.at(etherRouter.address);

      await colonyNetworkNew.initialise("0xDde1400C69752A6596a7B2C1f2420Fb9A71c1FDA", 79);
      const currentColonyVersion = await colonyNetworkNew.getCurrentColonyVersion();
      expect(currentColonyVersion).to.eq.BN(79);
    });
  });

  describe("when managing the mining process", () => {
    it("should not allow reinitialisation of reputation mining process", async () => {
      await colonyNetwork.initialiseReputationMining();
      await checkErrorRevert(colonyNetwork.initialiseReputationMining(), "colony-reputation-mining-already-initialised");
    });

    it("should not allow initialisation if the clny token is 0", async () => {
      const metaColonyUnderRecovery = await getColonyEditable(metaColony, colonyNetwork);
      await metaColonyUnderRecovery.setStorageSlot(7, ethers.constants.AddressZero);
      await checkErrorRevert(colonyNetwork.initialiseReputationMining(), "colony-reputation-mining-clny-token-invalid-address");
    });

    it("should not allow another mining cycle to start if the process isn't initialised", async () => {
      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-not-initialised");
    });

    it("should not allow another mining cycle to start if the clny token is 0", async () => {
      await colonyNetwork.initialiseReputationMining();
      const metaColonyUnderRecovery = await getColonyEditable(metaColony, colonyNetwork);
      await metaColonyUnderRecovery.setStorageSlot(7, ethers.constants.AddressZero);

      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-clny-token-invalid-address");
    });

    it('should not allow "punishStakers" to be called from an account that is not the mining cycle', async () => {
      await checkErrorRevert(
        colonyNetwork.punishStakers([accounts[0], accounts[1]], MIN_STAKE),
        "colony-reputation-mining-sender-not-active-reputation-cycle"
      );
    });
  });

  describe("when creating new colonies at a specific version", () => {
    beforeEach(async () => {
      // The new resolver also needs to know a load of functions to let createColony work...
      const copyWiring = async function (resolverFrom, resolverTo, functionSig) {
        const sig = await resolverFrom.stringToSig(functionSig);
        const functionLocation = await resolverFrom.lookup(sig);
        await resolverTo.register(functionSig, functionLocation);
      };

      const metaColonyAsEtherRouter = await EtherRouter.at(metaColony.address);
      const wiredResolverAddress = await metaColonyAsEtherRouter.resolver();
      const wiredResolver = await Resolver.at(wiredResolverAddress);

      const r = await Resolver.at(newResolverAddress);

      await copyWiring(wiredResolver, r, "initialiseColony(address,address)");
      await copyWiring(wiredResolver, r, "setRecoveryRole(address)");
      await copyWiring(wiredResolver, r, "setRootRole(address,bool)");
      await copyWiring(wiredResolver, r, "setArbitrationRole(uint256,uint256,address,uint256,bool)");
      await copyWiring(wiredResolver, r, "setArchitectureRole(uint256,uint256,address,uint256,bool)");
      await copyWiring(wiredResolver, r, "setFundingRole(uint256,uint256,address,uint256,bool)");
      await copyWiring(wiredResolver, r, "setAdministrationRole(uint256,uint256,address,uint256,bool)");
      await copyWiring(wiredResolver, r, "editColony(string)");

      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const oldVersion = currentColonyVersion.subn(1);
      await metaColony.addNetworkColonyVersion(oldVersion, newResolverAddress);
    });

    it("should allow users to create a new colony at a specific older version", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const oldVersion = currentColonyVersion.subn(1);

      const token = await Token.new(...getTokenArgs());
      await token.unlock();
      await colonyNetwork.createColony(token.address, oldVersion, "", IPFS_HASH);

      const colonyAddress = await colonyNetwork.getColony(2);

      const colonyEtherRouter = await EtherRouter.at(colonyAddress);
      const colonyResolver = await colonyEtherRouter.resolver();
      expect(colonyResolver.toLowerCase()).to.equal(newResolverAddress);
    });

    it("should not allow users to create a new colony at a nonexistent version", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const nonexistentVersion = currentColonyVersion.addn(1);
      const token = await Token.new(...getTokenArgs());

      await checkErrorRevert(colonyNetwork.createColony(token.address, nonexistentVersion, "", ""), "colony-network-invalid-version");
    });

    it("should allow use of the deprecated one-parameter createColony", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const oldVersion = currentColonyVersion.subn(1);
      await metaColony.addNetworkColonyVersion(oldVersion, newResolverAddress);
      // Add version 3 if necessary, required to test the deprecated createColony
      if (!oldVersion.eq(3)) {
        await metaColony.addNetworkColonyVersion(3, newResolverAddress);
      }
      const token = await Token.new(...getTokenArgs());

      await colonyNetwork.createColony(token.address);
    });

    it("should allow use of the deprecated five-parameter createColony", async () => {
      const token = await Token.new(...getTokenArgs());

      await colonyNetwork.createColony(token.address, 4, "", "", "");
    });
  });

  describe("when creating new colonies", () => {
    it("should allow users to create new colonies", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colony.address).to.not.equal(ethers.constants.AddressZero);
      expect(colonyCount).to.eq.BN(2);
    });

    it("metadata should be emitted on colony creation if supplied", async () => {
      const token = await Token.new(...getTokenArgs());
      await token.unlock();
      const tx = await colonyNetwork.createColony(token.address, 0, "", IPFS_HASH);
      await expectEvent(tx, "ColonyMetadata(address,string)", [colonyNetwork.address, IPFS_HASH]);
    });

    it("metadata should not be emitted on colony creation if not supplied", async () => {
      const token = await Token.new(...getTokenArgs());
      await token.unlock();
      const tx = await colonyNetwork.createColony(token.address, 0, "");
      await expectNoEvent(tx, "ColonyMetadata(string)");
    });

    it("should maintain correct count of colonies", async () => {
      const token = await Token.new(...getTokenArgs());
      await token.unlock();
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colonyCount).to.eq.BN(8);
    });

    it("when meta colony is created, should have the root global and local skills initialised, plus the local mining skill", async () => {
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);
      const globalSkill = await colonyNetwork.getSkill(GLOBAL_SKILL_ID);
      expect(parseInt(globalSkill.nParents, 10)).to.be.zero;
      expect(parseInt(globalSkill.nChildren, 10)).to.be.zero;
      expect(globalSkill.globalSkill).to.be.true;

      const localSkill1 = await colonyNetwork.getSkill(1);
      expect(localSkill1.globalSkill).to.be.false;

      const localSkill2 = await colonyNetwork.getSkill(2);
      expect(localSkill2.globalSkill).to.be.false;

      const miningSkillId = await colonyNetwork.getReputationMiningSkillId();
      expect(miningSkillId).to.eq.BN(2);
    });

    it("should fail to create meta colony if it already exists", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await checkErrorRevert(colonyNetwork.createMetaColony(token.address), "colony-meta-colony-exists-already");
    });

    it("should not allow users to create a colony with empty token", async () => {
      await checkErrorRevert(colonyNetwork.createColony(ethers.constants.AddressZero, 0, "", ""), "colony-token-invalid-address");
    });

    it("when any colony is created, should have the root local skill initialised", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);

      const rootLocalSkill = await colonyNetwork.getSkill(4);
      expect(parseInt(rootLocalSkill.nParents, 10)).to.be.zero;
      expect(parseInt(rootLocalSkill.nChildren, 10)).to.be.zero;

      const skillCount = await colonyNetwork.getSkillCount();
      const skill = await colonyNetwork.getSkill(skillCount.addn(1));
      expect(skill.globalSkill).to.be.false;

      const rootDomain = await colony.getDomain(1);
      expect(rootDomain.skillId).to.eq.BN(4);
      expect(rootDomain.fundingPotId).to.eq.BN(1);

      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);
    });

    it("should fail if ETH is sent", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const sig = "createColony(address,uint256,string,string)";
      await checkErrorRevert(colonyNetwork.methods[sig](token.address, 0, "", "", { value: 1, gas: createColonyGas }));

      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      expect(colonyNetworkBalance).to.be.zero;
    });

    it("should log a ColonyAdded event", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const tx = await colonyNetwork.createColony(token.address, 0, "", "");
      const colonyCount = await colonyNetwork.getColonyCount();
      const colonyAddress = await colonyNetwork.getColony(colonyCount);
      await expectEvent(tx, "ColonyAdded", [colonyCount, colonyAddress, token.address]);
    });
  });

  describe("when getting existing colonies", () => {
    it("should allow users to get the address of a colony by its index", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      await colonyNetwork.createColony(token.address, 0, "", "");
      const colonyAddress = await colonyNetwork.getColony(3);
      expect(colonyAddress).to.not.equal(ethers.constants.AddressZero);
    });

    it("should return an empty address if there is no colony for the index provided", async () => {
      const colonyAddress = await colonyNetwork.getColony(15);
      expect(colonyAddress).to.equal(ethers.constants.AddressZero);
    });

    it("should be able to get the Colony version", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const actualColonyVersion = await colony.version();
      expect(version).to.eq.BN(actualColonyVersion);
    });
  });

  describe("when upgrading a colony", () => {
    it("should be able to upgrade a colony, if a sender has root role", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const colonyEtherRouter = await EtherRouter.at(colony.address);

      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(newVersion, newResolverAddress);

      await colony.upgrade(newVersion);
      const colonyResolver = await colonyEtherRouter.resolver();
      expect(colonyResolver.toLowerCase()).to.equal(newResolverAddress);
    });

    it("should not be able to set colony resolver by directly calling `setResolver`", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(newVersion, newResolverAddress);
      const etherRouter = await EtherRouter.at(colony.address);
      await checkErrorRevert(etherRouter.setResolver(newResolverAddress), "ds-auth-unauthorized");
    });

    it("should NOT be able to upgrade a colony to a lower version", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.subn(1);
      await metaColony.addNetworkColonyVersion(newVersion, newResolverAddress);

      await checkErrorRevert(colony.upgrade(newVersion), "colony-version-must-be-one-newer");
      expect(version).to.eq.BN(currentColonyVersion);
    });

    it("should NOT be able to upgrade a colony to a nonexistent version", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);

      await checkErrorRevert(colony.upgrade(newVersion), "colony-version-must-be-registered");
      expect(version).to.eq.BN(currentColonyVersion);
    });

    it("should NOT be able to upgrade a colony if sender don't have root role", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const colonyEtherRouter = await EtherRouter.at(colony.address);
      const colonyResolver = await colonyEtherRouter.resolver();

      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(newVersion, newResolverAddress);

      await checkErrorRevert(colony.upgrade(newVersion, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
      expect(colonyResolver).to.not.equal(newResolverAddress);
    });
  });

  describe("when working with skills", () => {
    it("should not be able to add a global skill, by an address that is not the meta colony ", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(0), "colony-must-be-meta-colony");
    });

    it("should not be able to deprecate a global skill, by an address that is not the meta colony ", async () => {
      const skillCount = await colonyNetwork.getSkillCount();
      await checkErrorRevert(colonyNetwork.deprecateSkill(skillCount), "colony-must-be-meta-colony");
    });

    it("should NOT be able to add a local skill, by an address that is not a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1), "colony-caller-must-be-colony");
    });
  });

  describe("when managing ENS names", () => {
    const orbitDBAddress = "QmPFtHi3cmfZerxtH9ySLdzpg1yFhocYDZgEZywdUXHxFU/my-db-name";
    let ensRegistry;

    beforeEach(async () => {
      ensRegistry = await ENSRegistry.new();
      await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);
    });

    it("should be able to get the ENSRegistrar", async () => {
      const registrarAddress = await colonyNetwork.getENSRegistrar();
      expect(registrarAddress).to.equal(ensRegistry.address);
    });

    it("should be able to create a colony with label in one tx", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      const { logs } = await colonyNetwork.createColony(token.address, 0, "test", "");
      const { colonyAddress } = logs.filter((x) => x.event === "ColonyAdded")[0].args;

      const name = await colonyNetwork.lookupRegisteredENSDomain(colonyAddress);
      expect(name).to.equal("test.colony.joincolony.eth");
    });

    it("should own the root domains", async () => {
      const rootNode = namehash.hash("joincolony.eth");

      let owner;
      owner = await ensRegistry.owner(rootNode);
      expect(owner).to.equal(accounts[0]);

      owner = await ensRegistry.owner(namehash.hash("user.joincolony.eth"));
      expect(owner).to.equal(colonyNetwork.address);

      owner = await ensRegistry.owner(namehash.hash("colony.joincolony.eth"));
      expect(owner).to.equal(colonyNetwork.address);
    });

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
      expect(resolverAddress).to.equal(colonyNetwork.address);
      // Then query the resolver
      const resolvedAddress = await colonyNetwork.addr(hash);
      expect(resolvedAddress).to.equal(accounts[1]);
      const owner = await ensRegistry.owner(hash);
      expect(owner).to.equal(colonyNetwork.address);

      // Check reverse lookup
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      expect(lookedUpENSDomain).to.equal("test.user.joincolony.eth");

      // Get stored orbitdb address
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal(orbitDBAddress);

      // Label already in use
      await checkErrorRevert(colonyNetwork.registerUserLabel(username, orbitDBAddress, { from: accounts[2] }), "colony-label-already-owned");

      // Can't register two labels for a user
      await checkErrorRevert(colonyNetwork.registerUserLabel(username2, orbitDBAddress, { from: accounts[1] }), "colony-user-label-already-owned");
    });

    it("colony should not be able to register a user label for itself", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);

      const latestVersion = await colonyNetwork.getCurrentColonyVersion();
      const resolverAddress = await colonyNetwork.getColonyVersionResolver(latestVersion);
      const resolver = await Resolver.at(resolverAddress);

      const functionsNotAvailableOnColony = await FunctionsNotAvailableOnColony.new();
      await resolver.register("registerUserLabel(string,string)", functionsNotAvailableOnColony.address);
      const fakeColony = await FunctionsNotAvailableOnColony.at(colony.address);
      await checkErrorRevert(fakeColony.registerUserLabel("test", orbitDBAddress), "colony-caller-must-not-be-colony");

      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(colony.address);
      expect(lookedUpENSDomain).to.not.equal("test.user.joincolony.eth");
    });

    it("should be able to register one unique label per colony, with root permission", async () => {
      const colonyName = "test";
      const colonyName2 = "test2";
      const hash = namehash.hash("test.colony.joincolony.eth");

      const { colony } = await setupRandomColony(colonyNetwork);

      // Non-root can't register label for colony
      await checkErrorRevert(colony.registerColonyLabel(colonyName, orbitDBAddress, { from: accounts[1] }), "ds-auth-unauthorized");

      // Root cannot register blank label
      await checkErrorRevert(colony.registerColonyLabel("", orbitDBAddress, { from: accounts[0] }), "colony-colony-label-invalid");

      // Root can register label for colony
      await colony.registerColonyLabel(colonyName, orbitDBAddress, { from: accounts[0] });
      const owner = await ensRegistry.owner(hash);
      expect(owner).to.equal(colonyNetwork.address);

      // Check label resolves correctly
      // First, query the registry to get the resolver
      const resolverAddress = await ensRegistry.resolver(hash);
      expect(resolverAddress).to.equal(colonyNetwork.address);
      // Then query the resolver
      const resolvedAddress = await colonyNetwork.addr(hash);
      expect(resolvedAddress).to.equal(colony.address);

      // Check reverse lookup
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(colony.address);
      expect(lookedUpENSDomain).to.equal("test.colony.joincolony.eth");
      // Get stored orbitdb address
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal(orbitDBAddress);

      // Can't register two labels for a colony
      await checkErrorRevert(colony.registerColonyLabel(colonyName2, orbitDBAddress, { from: accounts[0] }), "colony-already-labeled");
    });

    it("should be able to register same name for user and a colony, and reverse lookup still work", async () => {
      // Register user
      await colonyNetwork.registerUserLabel("test", orbitDBAddress, { from: accounts[1] });

      // Set up colony
      const { colony } = await setupRandomColony(colonyNetwork);

      // Register colony
      // Root user can register label for colony
      await colony.registerColonyLabel("test", orbitDBAddress, { from: accounts[0] });

      // Check reverse lookup for colony
      const lookedUpENSDomainColony = await colonyNetwork.lookupRegisteredENSDomain(colony.address);
      expect(lookedUpENSDomainColony).to.equal("test.colony.joincolony.eth");

      // Check reverse lookup
      const lookedUpENSDomainUser = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      expect(lookedUpENSDomainUser).to.equal("test.user.joincolony.eth");
    });

    it("should return a blank address if looking up an address with no Colony-based ENS name", async () => {
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(accounts[2]);
      expect(lookedUpENSDomain).to.equal("");
    });

    it("should respond correctly to queries regarding ENS interfaces it supports", async () => {
      let response = await colonyNetwork.supportsInterface("0x01ffc9a7"); // supports 'supportsInterface(bytes4)'
      expect(response).to.be.true;
      response = await colonyNetwork.supportsInterface("0x01ffc9a7"); // supports 'addr(bytes32)'
      expect(response).to.be.true;
    });

    it("owner should be able to set and get the ttl of their node", async () => {
      ensRegistry = await ENSRegistry.new();
      const hash = namehash.hash("jane.user.joincolony.eth");

      await ensRegistry.setTTL(hash, 123);
      const ttl = await ensRegistry.ttl(hash);
      expect(ttl).to.eq.BN(123);
    });

    it("use should NOT be able to set and get the ttl of a node they don't own", async () => {
      const hash = namehash.hash("jane.user.joincolony.eth");
      await colonyNetwork.registerUserLabel("jane", orbitDBAddress);
      await checkErrorRevert(ensRegistry.setTTL(hash, 123), "colony-ens-non-owner-access");
    });

    it("setting owner on a subnode should fail for a non existent subnode", async () => {
      ensRegistry = await ENSRegistry.new();
      const hash = namehash.hash("jane.user.joincolony.eth");

      await checkErrorRevert(ensRegistry.setSubnodeOwner(hash, hash, accounts[0]), "unowned-node");
    });

    it("should allow a user to update their orbitDBAddress", async () => {
      const hash = namehash.hash("test.user.joincolony.eth");
      await colonyNetwork.registerUserLabel("test", orbitDBAddress, { from: accounts[1] });
      await colonyNetwork.updateUserOrbitDB("anotherstring", { from: accounts[1] });
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal("anotherstring");
    });

    it("should not allow a user to set an orbitDBAddress if they've not got a label", async () => {
      await checkErrorRevert(colonyNetwork.updateUserOrbitDB("anotherstring", { from: accounts[1] }), "colony-user-not-labeled");
    });

    it("should allow a colony to change its orbitDBAddress with root permissions", async () => {
      const colonyName = "test";
      const hash = namehash.hash("test.colony.joincolony.eth");
      const { colony } = await setupRandomColony(colonyNetwork);
      await colony.registerColonyLabel(colonyName, orbitDBAddress, { from: accounts[0] });
      await colony.updateColonyOrbitDB("anotherstring", { from: accounts[0] });
      // Get stored orbitdb address
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal("anotherstring");
    });

    it("should not allow a colony to change its orbitDBAddress without having registered a label", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      await checkErrorRevert(colony.updateColonyOrbitDB("anotherstring", { from: accounts[0] }), "colony-colony-not-labeled");
    });
  });
});
