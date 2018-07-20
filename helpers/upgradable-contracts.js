import web3Utils from "web3-utils";
import assert from "assert";
import fs from "fs";

export function parseImplementation(contractName, functionsToResolve, deployedImplementations) {
  // Goes through a contract, and sees if anything in it is in the interface. If it is, then wire up the resolver to point at it
  const { abi } = JSON.parse(fs.readFileSync(`./build/contracts/${contractName}.json`));
  abi.map(value => {
    const fName = value.name;
    if (functionsToResolve[fName]) {
      /* TODO: Add suspport for function overloads
      if (functionsToResolve[fName].definedIn !== "") {
        // It's a Friday afternoon, and I can't be bothered to deal with same name, different signature.
        // Let's just resolve to not do it? We'd probably just trip ourselves up later
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
      */
      functionsToResolve[fName].definedIn = deployedImplementations[contractName]; // eslint-disable-line no-param-reassign
    }
    return functionsToResolve[fName];
  });
}

export async function setupEtherRouter(interfaceContract, deployedImplementations, resolver) {
  const functionsToResolve = {};

  // Load ABI of the interface of the contract we're trying to stich together
  const iAbi = JSON.parse(fs.readFileSync(`./build/contracts/${interfaceContract}.json`, "utf8")).abi;
  iAbi.map(value => {
    const fName = value.name;
    const fType = value.type;
    // These are from DSAuth, and so are on EtherRouter itself without any more help.
    if (fName !== "authority" && fName !== "owner") {
      // We only care about functions.
      if (fType === "function") {
        // Gets the types of the parameters, which is all we care about for function signatures.
        const fInputs = value.inputs.map(parameter => parameter.type);
        // Record function name
        functionsToResolve[fName] = { inputs: fInputs, definedIn: "" };
      }
    }
    return functionsToResolve;
  });
  Object.keys(deployedImplementations).map(name => parseImplementation(name, functionsToResolve, deployedImplementations));
  const promises = Object.keys(functionsToResolve).map(async fName => {
    const sig = `${fName}(${functionsToResolve[fName].inputs.join(",")})`;
    const address = functionsToResolve[fName].definedIn;
    
    // TODO: Temp fudge to register overloaded function. This should be fixed with the fic of the above `todo` in `parseImplementation`
    if (fName == "makeTask") {
      const e = await resolver.register('makeTask(bytes32,uint256,uint256)', address);
    }

    const sigHash = await web3Utils.soliditySha3(sig).substr(0, 10);
    await resolver.register(sig, address);
    const destination = await resolver.lookup.call(sigHash);
    assert.equal(destination, address, `${sig} has not been registered correctly. Is it defined?`);
  });
  return Promise.all(promises);
}

export async function setupUpgradableToken(token, resolver, etherRouter) {
  const deployedImplementations = {};
  deployedImplementations.Token = token.address;
  await setupEtherRouter("ERC20Extended", deployedImplementations, resolver);

  await etherRouter.setResolver(resolver.address);
  const registeredResolver = await etherRouter.resolver.call();
  assert.equal(registeredResolver, resolver.address);
}

export async function setupColonyVersionResolver(colony, colonyTask, colonyFunding, resolver, colonyNetwork) {
  const deployedImplementations = {};
  deployedImplementations.Colony = colony.address;
  deployedImplementations.ColonyTask = colonyTask.address;
  deployedImplementations.ColonyFunding = colonyFunding.address;

  await setupEtherRouter("IColony", deployedImplementations, resolver);

  const version = await colony.version.call();
  await colonyNetwork.addColonyVersion(version.toNumber(), resolver.address);
  const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion.call();
  assert.equal(version, currentColonyVersion.toNumber());
}

export async function setupUpgradableColonyNetwork(
  etherRouter,
  resolver,
  colonyNetwork,
  colonyNetworkMining,
  colonyNetworkAuction,
  colonyNetworkRegistrar
) {
  const deployedImplementations = {};
  deployedImplementations.ColonyNetwork = colonyNetwork.address;
  deployedImplementations.ColonyNetworkMining = colonyNetworkMining.address;
  deployedImplementations.ColonyNetworkAuction = colonyNetworkAuction.address;
  deployedImplementations.ColonyNetworkRegistrar = colonyNetworkRegistrar.address;

  await setupEtherRouter("IColonyNetwork", deployedImplementations, resolver);

  await etherRouter.setResolver(resolver.address);
}

export async function setupUpgradableTokenLocking(etherRouter, resolver, tokenLocking) {
  const deployedImplementations = {};
  deployedImplementations.TokenLocking = tokenLocking.address;
  await setupEtherRouter("ITokenLocking", deployedImplementations, resolver);

  await etherRouter.setResolver(resolver.address);
  const registeredResolver = await etherRouter.resolver.call();
  assert.equal(registeredResolver, resolver.address);
}
