const { soliditySha3 } = require("web3-utils");
const namehash = require("eth-ens-namehash");
const assert = require("assert");
const fs = require("fs");

exports.parseImplementation = function parseImplementation(contractName, functionsToResolve, deployedImplementations) {
  // Goes through a contract, and sees if anything in it is in the interface. If it is, then wire up the resolver to point at it
  const { abi } = JSON.parse(fs.readFileSync(`./build/contracts/${contractName}.json`));
  abi.map((value) => {
    const fName = value.name;
    if (functionsToResolve[fName]) {
      if (functionsToResolve[fName].definedIn !== "" && functionsToResolve[fName].definedIn !== deployedImplementations[contractName]) {
        // We allow function overloads so long as they are in the same file.
        // eslint-disable-next-line no-console
        console.log(
          "What are you doing!? Defining functions with the same name in different files!? You are going to do yourself a mischief. ",
          "You seem to have two ",
          fName,
          " in ",
          contractName,
          "and ",
          functionsToResolve[fName].definedIn
        );
        process.exit(1);
      }
      functionsToResolve[fName].definedIn = deployedImplementations[contractName]; // eslint-disable-line no-param-reassign
    }
    return functionsToResolve[fName];
  });
};

exports.setupEtherRouter = async function setupEtherRouter(interfaceContract, deployedImplementations, resolver) {
  const functionsToResolve = {};

  // Load ABI of the interface of the contract we're trying to stich together
  const iAbi = JSON.parse(fs.readFileSync(`./build/contracts/${interfaceContract}.json`, "utf8")).abi;
  iAbi.map((value) => {
    const fName = value.name;
    const fType = value.type;
    // These are from DSAuth, and so are on EtherRouter itself without any more help.
    if (fName !== "authority" && fName !== "owner" && !fName.includes("c_0x")) {
      // We only care about functions.
      if (fType === "function") {
        // Gets the types of the parameters, which is all we care about for function signatures.
        const fInputs = value.inputs.map((parameter) => parameter.type);
        // Record function name
        functionsToResolve[fName] = { inputs: fInputs, definedIn: "" };
      }
    }
    return functionsToResolve;
  });
  Object.keys(deployedImplementations).map((name) => exports.parseImplementation(name, functionsToResolve, deployedImplementations));
  // Iterate over the ABI again to make sure we get overloads - the functionToResolve is only indexed by name, not signature.
  for (let i = 0; i < iAbi.length; i += 1) {
    // We do it like this rather than a nice await Promise.all on a mapped array of promises because of
    // https://github.com/paritytech/parity-ethereum/issues/9155
    const fName = iAbi[i].name;
    if (functionsToResolve[fName]) {
      const sig = `${fName}(${iAbi[i].inputs.map((parameter) => parameter.type).join(",")})`;
      const address = functionsToResolve[fName].definedIn;
      try {
        await resolver.register(sig, address);
      } catch (err) {
        throw new Error(`${sig} could not be registered. Is it defined?`);
      }
      const sigHash = soliditySha3(sig).substr(0, 10);
      const destination = await resolver.lookup(sigHash);
      assert.equal(destination, address, `${sig} has not been registered correctly. Is it defined?`);
    }
  }
};

exports.setupColonyVersionResolver = async function setupColonyVersionResolver(
  colony,
  colonyDomains,
  colonyExpenditure,
  colonyTask,
  colonyPayment,
  colonyFunding,
  colonyRoles,
  contractRecovery,
  colonyArbitraryTransaction,
  resolver
) {
  const deployedImplementations = {};
  deployedImplementations.Colony = colony.address;
  deployedImplementations.ColonyDomains = colonyDomains.address;
  deployedImplementations.ColonyExpenditure = colonyExpenditure.address;
  deployedImplementations.ColonyTask = colonyTask.address;
  deployedImplementations.ColonyRoles = colonyRoles.address;
  deployedImplementations.ColonyPayment = colonyPayment.address;
  deployedImplementations.ColonyFunding = colonyFunding.address;
  deployedImplementations.ContractRecovery = contractRecovery.address;
  deployedImplementations.ColonyArbitraryTransaction = colonyArbitraryTransaction.address;

  await exports.setupEtherRouter("IMetaColony", deployedImplementations, resolver);
};

exports.setupUpgradableColonyNetwork = async function setupUpgradableColonyNetwork(
  etherRouter,
  resolver,
  colonyNetwork,
  colonyNetworkDeployer,
  colonyNetworkMining,
  colonyNetworkAuction,
  colonyNetworkENS,
  colonyNetworkExtensions,
  contractRecovery
) {
  const deployedImplementations = {};
  deployedImplementations.ColonyNetwork = colonyNetwork.address;
  deployedImplementations.ColonyNetworkDeployer = colonyNetworkDeployer.address;
  deployedImplementations.ColonyNetworkMining = colonyNetworkMining.address;
  deployedImplementations.ColonyNetworkAuction = colonyNetworkAuction.address;
  deployedImplementations.ColonyNetworkENS = colonyNetworkENS.address;
  deployedImplementations.ColonyNetworkExtensions = colonyNetworkExtensions.address;
  deployedImplementations.ContractRecovery = contractRecovery.address;

  await exports.setupEtherRouter("IColonyNetwork", deployedImplementations, resolver);
  await etherRouter.setResolver(resolver.address);
};

exports.setupUpgradableTokenLocking = async function setupUpgradableTokenLocking(etherRouter, resolver, tokenLocking) {
  const deployedImplementations = {};
  deployedImplementations.TokenLocking = tokenLocking.address;
  await exports.setupEtherRouter("ITokenLocking", deployedImplementations, resolver);

  await etherRouter.setResolver(resolver.address);
  const registeredResolver = await etherRouter.resolver();
  assert.equal(registeredResolver, resolver.address);
};

exports.setupReputationMiningCycleResolver = async function setupReputationMiningCycleResolver(
  reputationMiningCycle,
  reputationMiningCycleRespond,
  reputationMiningCycleBinarySearch,
  resolver,
  colonyNetwork
) {
  const deployedImplementations = {};
  deployedImplementations.ReputationMiningCycle = reputationMiningCycle.address;
  deployedImplementations.ReputationMiningCycleRespond = reputationMiningCycleRespond.address;
  deployedImplementations.ReputationMiningCycleBinarySearch = reputationMiningCycleBinarySearch.address;

  await exports.setupEtherRouter("IReputationMiningCycle", deployedImplementations, resolver);

  await colonyNetwork.setMiningResolver(resolver.address);
};

exports.setupENSRegistrar = async function setupENSRegistrar(colonyNetwork, ensRegistry, registrarOwner) {
  const rootNode = namehash.hash("joincolony.eth");
  const USER_HASH = soliditySha3("user");
  const COLONY_HASH = soliditySha3("colony");

  await colonyNetwork.setupRegistrar(ensRegistry.address, rootNode);
  await ensRegistry.setOwner(rootNode, registrarOwner);

  await ensRegistry.setSubnodeOwner(rootNode, USER_HASH, colonyNetwork.address);
  await ensRegistry.setSubnodeOwner(rootNode, COLONY_HASH, colonyNetwork.address);
};
