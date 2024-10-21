/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");
const { soliditySha3 } = require("web3-utils");
const namehash = require("eth-ens-namehash");

const {
  setupColonyNetwork,
  setupMetaColonyWithLockedCLNYToken,
  setupColony,
  setupRandomColony,
  getMetaTransactionParameters,
} = require("../../helpers/test-data-generator");

const {
  getTokenArgs,
  web3GetNetwork,
  web3GetBalance,
  checkErrorRevert,
  expectEvent,
  expectNoEvent,
  isXdai,
  getChainId,
  setStorageSlot,
} = require("../../helpers/test-helper");

const { CURR_VERSION, MIN_STAKE, IPFS_HASH, ADDRESS_ZERO, WAD } = require("../../helpers/constants");
const { setupENSRegistrar } = require("../../helpers/upgradable-contracts");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ColonyAuthority = artifacts.require("ColonyAuthority");
const ENSRegistry = artifacts.require("ENSRegistry");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const IColony = artifacts.require("IColony");
const Token = artifacts.require("Token");
const TokenLocking = artifacts.require("TokenLocking");
const MetaTxToken = artifacts.require("MetaTxToken");
const IMetaColony = artifacts.require("IMetaColony");
const FunctionsNotAvailableOnColony = artifacts.require("FunctionsNotAvailableOnColony");

const TokenAuthority = artifacts.require("contracts/common/TokenAuthority.sol:TokenAuthority");

const copyWiring = async function (resolverFrom, resolverTo, functionSig) {
  const sig = await resolverFrom.stringToSig(functionSig);
  const functionLocation = await resolverFrom.lookup(sig);
  await resolverTo.register(functionSig, functionLocation);
};

contract("Colony Network", (accounts) => {
  let newResolverAddress;
  const TOKEN_ARGS = getTokenArgs();
  const OTHER_ACCOUNT = accounts[1];
  let colonyNetwork;
  let metaColony;
  let clnyToken;
  let createColonyGas;
  let version;

  before(async () => {
    const network = await web3GetNetwork();
    createColonyGas = network === "1999" ? "0xfffffffffff" : 4e6;
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    version = await colonyNetwork.getCurrentColonyVersion();
    ({ metaColony, clnyToken } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
    // For upgrade tests, we need a resolver...
    const r = await Resolver.new();
    newResolverAddress = r.address.toLowerCase();
    const newResolver = await Resolver.at(newResolverAddress);
    // ... that knows the .finishUpgrade() function
    const metaColonyAsEtherRouter = await EtherRouter.at(metaColony.address);
    const wiredResolverAddress = await metaColonyAsEtherRouter.resolver();
    const wiredResolver = await Resolver.at(wiredResolverAddress);
    await copyWiring(wiredResolver, newResolver, "finishUpgrade()");

    // While v9 the latest, need to also know initialiseRootLocalSkill()`
    await copyWiring(wiredResolver, newResolver, "initialiseRootLocalSkill()");
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

    it("should not be able to set the token locking to null or set twice", async () => {
      await checkErrorRevert(colonyNetwork.setTokenLocking(ethers.constants.AddressZero), "colony-token-locking-cannot-be-zero");
      await checkErrorRevert(colonyNetwork.setTokenLocking(metaColony.address), "colony-token-locking-address-already-set");
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

    it("does not allow other colonies to add a new colony version", async () => {
      const colony = await setupColony(colonyNetwork, clnyToken.address);
      const fakeMetaColony = await IMetaColony.at(colony.address);

      await checkErrorRevert(fakeMetaColony.addNetworkColonyVersion(1, ADDRESS_ZERO), "colony-caller-must-be-meta-colony");
    });
  });

  describe("when managing the mining process", () => {
    it("should not allow reinitialisation of reputation mining process (if we're on the mining chain)", async () => {
      const chainId = await getChainId();
      await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);
      await checkErrorRevert(
        metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0),
        "colony-reputation-mining-already-initialised",
      );
    });

    it("should not allow setting the mining resolver to null", async () => {
      await checkErrorRevert(colonyNetwork.setMiningResolver(ethers.constants.AddressZero), "colony-mining-resolver-cannot-be-zero");
    });

    it("should not allow a non-permissioned user to set the mining resolver", async () => {
      await checkErrorRevert(colonyNetwork.setMiningResolver(ethers.constants.AddressZero, { from: accounts[1] }), "ds-auth-unauthorized");
    });

    it("should not allow initialisation of mining on this chain if the clny token is 0", async () => {
      await setStorageSlot(metaColony, 7, ethers.constants.HashZero);
      const chainId = await getChainId();
      await checkErrorRevert(
        metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0),
        "colony-reputation-mining-clny-token-invalid-address",
      );
    });

    it("should allow initialisation of mining on another chain if the clny token is 0", async () => {
      await setStorageSlot(metaColony, 7, ethers.constants.HashZero);
      let chainId = await getChainId();
      chainId += 1;
      await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);
    });

    it("should not allow another mining cycle to start if the process isn't initialised", async () => {
      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-not-initialised");
    });

    it("should not allow another mining cycle to start if the clny token is 0", async () => {
      const chainId = await getChainId();
      await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);
      await setStorageSlot(metaColony, 7, ethers.constants.HashZero);

      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-clny-token-invalid-address");
    });

    it('should not allow "punishStakers" to be called from an account that is not the mining cycle', async () => {
      const chainId = await getChainId();
      await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

      await checkErrorRevert(
        colonyNetwork.punishStakers([accounts[0], accounts[1]], MIN_STAKE),
        "colony-reputation-mining-sender-not-active-reputation-cycle",
      );
    });
  });

  describe("when creating new colonies at a specific version", () => {
    beforeEach(async () => {
      // The new resolver also needs to know a load of functions to let createColony work...

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

      // v4 specifically is needed for the deprecated five-parameter test
      await metaColony.addNetworkColonyVersion(4, newResolverAddress);
    });

    it("cannot deploy an authority without a colony", async () => {
      await checkErrorRevert(ColonyAuthority.new(ADDRESS_ZERO), "colony-authority-colony-cannot-be-zero");
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

    it("should allow users to create a colony for the frontend in one transaction with an existing token", async () => {
      const token = await Token.new(...getTokenArgs());
      await colonyNetwork.createColonyForFrontend(token.address, "", "", 0, version, "", "");
    });

    it("should allow users to create a colony for the frontend in one transaction, with a new token that can be activated if locked", async () => {
      const tx = await colonyNetwork.createColonyForFrontend(ADDRESS_ZERO, ...getTokenArgs(), version, "", "");
      const { tokenAddress } = tx.logs.filter((x) => x.event === "TokenDeployed")[0].args;

      const tokenLockingAddress = await colonyNetwork.getTokenLocking();
      const tokenLocking = await TokenLocking.at(tokenLockingAddress);
      const token = await Token.at(tokenAddress);
      await token.mint(accounts[0], WAD);

      await token.approve(tokenLocking.address, WAD);
      await tokenLocking.deposit(tokenAddress, WAD, true);
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

    it(`when meta colony is created, after initialising mining,
        should have the root domain and local skills initialised, plus the local mining skill`, async () => {
      const chainId = await getChainId();
      await metaColony.initialiseReputationMining(chainId, ethers.constants.HashZero, 0);

      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);

      const localSkill = await colonyNetwork.getSkill(1);
      expect(localSkill.DEPRECATED_globalSkill).to.be.false;

      const miningSkillId = await colonyNetwork.getReputationMiningSkillId();
      expect(miningSkillId).to.eq.BN(3);
    });

    it("should fail to create meta colony if it already exists", async () => {
      const token = await Token.new(...TOKEN_ARGS);
      await checkErrorRevert(colonyNetwork.createMetaColony(token.address), "colony-meta-colony-exists-already");
    });

    it("should not allow users to create a colony with empty token", async () => {
      await checkErrorRevert(colonyNetwork.createColony(ethers.constants.AddressZero, 0, "", ""), "colony-token-invalid-address");
    });

    it("when any colony is created, should have the root domain and local skills initialised", async () => {
      const token = await Token.new(...getTokenArgs());
      const colony = await setupColony(colonyNetwork, token.address);

      const rootLocalSkillId = await colonyNetwork.getSkillCount();
      const rootDomainSkillId = rootLocalSkillId.subn(1);

      const rootLocalSkill = await colonyNetwork.getSkill(rootLocalSkillId);
      expect(parseInt(rootLocalSkill.nParents, 10)).to.be.zero;
      expect(parseInt(rootLocalSkill.nChildren, 10)).to.be.zero;

      const rootDomainSkill = await colonyNetwork.getSkill(rootDomainSkillId);
      expect(parseInt(rootDomainSkill.nParents, 10)).to.be.zero;
      expect(parseInt(rootDomainSkill.nChildren, 10)).to.be.zero;

      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);

      const rootDomain = await colony.getDomain(1);
      expect(rootDomain.skillId).to.eq.BN(rootDomainSkillId);
      expect(rootDomain.fundingPotId).to.eq.BN(1);
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

  describe("when users create tokens", () => {
    it("should allow users to create new tokens", async () => {
      const tx = await colonyNetwork.deployTokenViaNetwork("TEST", "TST", 18);
      await expectEvent(tx, "TokenDeployed", []);
    });

    it("should have the user as the owner of the token", async () => {
      const tx = await colonyNetwork.deployTokenViaNetwork("TEST", "TST", 18);
      const address = tx.logs[0].args.tokenAddress;
      const token = await MetaTxToken.at(address);
      const owner = await token.owner();
      expect(owner).to.equal(accounts[0]);
    });

    it("should allow users to create new token authorities", async () => {
      let tx = await colonyNetwork.deployTokenViaNetwork("TEST", "TST", 18);
      const { tokenAddress } = tx.logs[0].args;
      tx = await colonyNetwork.deployTokenAuthority(tokenAddress, metaColony.address, [accounts[0]]);
      await expectEvent(tx, "TokenAuthorityDeployed", []);
      const authorityAddress = tx.logs[0].args.tokenAuthorityAddress;
      const authority = await TokenAuthority.at(authorityAddress);

      const transferSig = soliditySha3("transfer(address,uint256)").slice(0, 10);
      let ableToTransfer = await authority.canCall(metaColony.address, tokenAddress, transferSig);
      expect(ableToTransfer).to.be.true;
      ableToTransfer = await authority.canCall(accounts[0], tokenAddress, transferSig);
      expect(ableToTransfer).to.be.true;
      ableToTransfer = await authority.canCall(accounts[1], tokenAddress, transferSig);
      expect(ableToTransfer).to.be.false;
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

      // 8->9 upgrade, unlike other upgrades to date, not idempotent, so have to delete
      // the local root skill id
      await setStorageSlot(colony, 36, ethers.constants.HashZero);

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
    it("should not be able to add a global skill, even when called from metacolony ", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(0, { from: metaColony.address }), "colony-network-invalid-parent-skill");
    });

    it("should NOT be able to add a local skill, by an address that is not a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1), "colony-caller-must-be-colony");
    });

    it("should not be able to initialise root local skill for an address that's not a colony", async () => {
      await checkErrorRevert(colonyNetwork.initialiseRootLocalSkill(), "colony-caller-must-be-colony");
    });
  });

  describe("when managing ENS names", () => {
    const orbitDBAddress = "QmPFtHi3cmfZerxtH9ySLdzpg1yFhocYDZgEZywdUXHxFU/my-db-name";
    let ensRegistry;
    let suffix;

    before(async () => {
      suffix = (await isXdai()) ? "colonyxdai" : "eth";
    });

    beforeEach(async () => {
      ensRegistry = await ENSRegistry.new();
      await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0], suffix);
    });

    it("should not be able to set the ENS reigstrar to null", async () => {
      await checkErrorRevert(colonyNetwork.setupRegistrar(ethers.constants.AddressZero, "0x0"), "colony-ens-cannot-be-zero");
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
      expect(name).to.equal(`test.colony.joincolony.${suffix}`);
    });

    it("should own the root domains", async () => {
      const rootNode = namehash.hash(`joincolony.${suffix}`);

      let owner;
      owner = await ensRegistry.owner(rootNode);
      expect(owner).to.equal(accounts[0]);

      owner = await ensRegistry.owner(namehash.hash(`user.joincolony.${suffix}`));
      expect(owner).to.equal(colonyNetwork.address);

      owner = await ensRegistry.owner(namehash.hash(`colony.joincolony.${suffix}`));
      expect(owner).to.equal(colonyNetwork.address);
    });

    it("should be able to register one unique label per user", async () => {
      const username = "test";
      const username2 = "test2";

      const hash = namehash.hash(`test.user.joincolony.${suffix}`);

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
      expect(lookedUpENSDomain).to.equal(`test.user.joincolony.${suffix}`);

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
      expect(lookedUpENSDomain).to.not.equal(`test.user.joincolony.${suffix}`);
    });

    it("should be able to register one unique label per colony, with root permission", async () => {
      const colonyName = "test";
      const colonyName2 = "test2";
      const hash = namehash.hash(`test.colony.joincolony.${suffix}`);

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
      expect(lookedUpENSDomain).to.equal(`test.colony.joincolony.${suffix}`);
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
      expect(lookedUpENSDomainColony).to.equal(`test.colony.joincolony.${suffix}`);

      // Check reverse lookup
      const lookedUpENSDomainUser = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      expect(lookedUpENSDomainUser).to.equal(`test.user.joincolony.${suffix}`);
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
      const hash = namehash.hash(`jane.user.joincolony.${suffix}`);

      await ensRegistry.setTTL(hash, 123);
      const ttl = await ensRegistry.ttl(hash);
      expect(ttl).to.eq.BN(123);
    });

    it("use should NOT be able to set and get the ttl of a node they don't own", async () => {
      const hash = namehash.hash(`jane.user.joincolony.${suffix}`);
      await colonyNetwork.registerUserLabel("jane", orbitDBAddress);
      await checkErrorRevert(ensRegistry.setTTL(hash, 123), "colony-ens-non-owner-access");
    });

    it("setting owner on a subnode should fail for a non existent subnode", async () => {
      ensRegistry = await ENSRegistry.new();
      const hash = namehash.hash(`jane.user.joincolony.${suffix}`);

      await checkErrorRevert(ensRegistry.setSubnodeOwner(hash, hash, accounts[0]), "unowned-node");
    });

    it("should allow a user to update their orbitDBAddress", async () => {
      const hash = namehash.hash(`test.user.joincolony.${suffix}`);
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
      const hash = namehash.hash(`test.colony.joincolony.${suffix}`);
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

  describe("when executing metatransactions", () => {
    beforeEach(async () => {
      const ensRegistry = await ENSRegistry.new();
      await setupENSRegistrar(colonyNetwork, ensRegistry, accounts[0]);
    });

    it("should allow colony creation via metatransactions, with ENS registration afterwards", async () => {
      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);

      let txData = await colonyNetwork.contract.methods.createColony(token.address, CURR_VERSION, "").encodeABI();

      let { r, s, v } = await getMetaTransactionParameters(txData, accounts[1], colonyNetwork.address);

      let tx = await colonyNetwork.executeMetaTransaction(accounts[1], txData, r, s, v, { from: accounts[0] });

      const colonyCount = await colonyNetwork.getColonyCount();
      const colonyAddress = await colonyNetwork.getColony(colonyCount);
      await expectEvent(tx, "ColonyAdded", [colonyCount, colonyAddress, token.address]);

      const colony = await IColony.at(colonyAddress);
      txData = await colony.contract.methods.registerColonyLabel("someColonyName", "").encodeABI();

      ({ r, s, v } = await getMetaTransactionParameters(txData, accounts[1], colony.address));

      tx = await colony.executeMetaTransaction(accounts[1], txData, r, s, v, { from: accounts[0] });
    });

    it("should allow colony creation via metatransactions, with ENS registration at the time", async () => {
      const tokenArgs = getTokenArgs();
      const token = await Token.new(...tokenArgs);

      let txData = await colonyNetwork.contract.methods["createColony(address,uint256,string)"](token.address, CURR_VERSION, "").encodeABI();

      txData = await colonyNetwork.contract.methods.createColony(token.address, CURR_VERSION, "someColonyName").encodeABI();

      const { r, s, v } = await getMetaTransactionParameters(txData, accounts[1], colonyNetwork.address);

      const tx = await colonyNetwork.executeMetaTransaction(accounts[1], txData, r, s, v, { from: accounts[0] });

      const colonyCount = await colonyNetwork.getColonyCount();
      const colonyAddress = await colonyNetwork.getColony(colonyCount);
      await expectEvent(tx, "ColonyAdded", [colonyCount, colonyAddress, token.address]);
    });

    it("should have the user as the owner of a token deployed through ColonyNetwork via metatransaction", async () => {
      const txData = await colonyNetwork.contract.methods["deployTokenViaNetwork(string,string,uint8)"]("Test token", "TST", 18).encodeABI();
      const { r, s, v } = await getMetaTransactionParameters(txData, accounts[1], colonyNetwork.address);

      const tx = await colonyNetwork.executeMetaTransaction(accounts[1], txData, r, s, v, { from: accounts[0] });

      const address = tx.logs[0].args.tokenAddress;
      const token = await MetaTxToken.at(address);
      const owner = await token.owner();
      expect(owner).to.equal(accounts[1]);
    });
  });
});
