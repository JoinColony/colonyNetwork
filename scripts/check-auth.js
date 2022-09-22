#!/usr/bin/env node

const parser = require("@solidity-parser/parser");
const fs = require("fs");
const path = require("path");

// Taken from https://gist.github.com/kethinov/6658166#gistcomment-1941504
const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach((file) => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory() ? walkSync(path.join(dir, file), filelist) : filelist.concat(path.join(dir, file)); // eslint-disable-line no-param-reassign
  });
  return filelist;
};

function correctAuthModifier(functionDef) {
  let valid = true;
  const errors = [];

  // Special cases which need two invocations of `authDomain`
  if (["moveFundsBetweenPots", "setPaymentDomain"].indexOf(functionDef.name) > -1) {
    return { valid, errors };
  }

  const auths = functionDef.modifiers.filter((mod) => ["auth", "authDomain"].indexOf(mod.name) > -1);
  if (auths.length === 0) {
    return { valid, errors };
  }
  if (auths.length > 1) {
    return { valid: false, errors: ["Auth declared more than once"] };
  }

  const authDec = functionDef.modifiers.filter((mod) => ["auth", "authDomain"].indexOf(mod.name) > -1)[0];
  // Check if it's the 'normal' auth
  if (!authDec.arguments) {
    return { valid, errors };
  }

  // Check the first two arguments of the function are _permissionDomainId, _childSkillIndex
  if (functionDef.parameters.length > 0 && functionDef.parameters[0].name !== "_permissionDomainId") {
    valid = false;
    errors.push("First parameter of function is not _permissionDomainId");
  }
  if (functionDef.parameters.length > 1 && functionDef.parameters[1].name !== "_childSkillIndex") {
    valid = false;
    errors.push("Second parameter of function is not _childSkillIndex");
  }

  // Check that the first parameter to auth is _permissionDomainId
  if (authDec.arguments[0].name !== "_permissionDomainId") {
    valid = false;
    errors.push("First parameter to auth is not _permissionDomainId");
  }
  // Check that the second is _childSkillIndex
  if (authDec.arguments[1].name !== "_childSkillIndex") {
    valid = false;
    errors.push("Second parameter to auth is not _childSkillIndex");
  }
  // Check that the second is either a lookup of a domainId, or _domainId
  const arg2 = authDec.arguments[2];
  if (arg2.name !== "_domainId" && arg2.type === "MemberAccess" && arg2.memberName !== "domainId") {
    valid = false;
    errors.push("Second parameter to auth is not _domainId or a lookup thereof");
  }
  return { valid, errors };
}

walkSync("./contracts/").forEach((contractName) => {
  // Only contracts using domain-level permissions need to be checked, i.e. those that implement
  // functions in IColony.sol
  // Basically only Colony.sol, ColonyFunding.sol, ColonyTask.sol, ColonyExpenditure.sol (?)
  if (
    [
      "contracts/colony/ColonyAuthority.sol",
      "contracts/colony/ColonyStorage.sol",
      "contracts/colony/IColony.sol",
      "contracts/colony/IMetaColony.sol",
      "contracts/colonyNetwork/ColonyNetwork.sol",
      "contracts/colonyNetwork/ColonyNetworkAuction.sol",
      "contracts/colonyNetwork/ColonyNetworkAuthority.sol",
      "contracts/colonyNetwork/ColonyNetworkENS.sol",
      "contracts/colonyNetwork/ColonyNetworkMining.sol",
      "contracts/colonyNetwork/ColonyNetworkStorage.sol",
      "contracts/colonyNetwork/IColonyNetwork.sol",
      "contracts/common/CommonAuthority.sol",
      "contracts/common/ERC20Extended.sol",
      "contracts/common/EtherRouter.sol",
      "contracts/common/IRecovery.sol",
      "contracts/common/Resolver.sol",
      "contracts/common/TokenAuthority.sol", // Imported from colonyToken repo
      "contracts/ens/ENS.sol",
      "contracts/ens/ENSRegistry.sol",
      "contracts/gnosis/MultiSigWallet.sol",
      "contracts/patriciaTree/Bits.sol",
      "contracts/patriciaTree/Data.sol",
      "contracts/patriciaTree/IPatriciaTree.sol",
      "contracts/patriciaTree/IPatriciaTreeNoHash.sol",
      "contracts/patriciaTree/PatriciaTree.sol",
      "contracts/patriciaTree/PatriciaTreeNoHash.sol",
      "contracts/patriciaTree/PatriciaTreeBase.sol",
      "contracts/patriciaTree/PatriciaTreeProofs.sol",
      "contracts/reputationMiningCycle/IReputationMiningCycle.sol",
      "contracts/reputationMiningCycle/ReputationMiningCycle.sol",
      "contracts/reputationMiningCycle/ReputationMiningCycleRespond.sol",
      "contracts/testHelpers/ContractEditing.sol",
      "contracts/testHelpers/ToggleableToken.sol",
      "contracts/tokenLocking/ITokenLocking.sol",
      "contracts/tokenLocking/TokenLocking.sol",
      "contracts/tokenLocking/TokenLockingStorage.sol",
      "contracts/Migrations.sol",
      "contracts/Token.sol", // Imported from colonyToken repo
      "contracts/TokenAuthority.sol", // Imported from colonyToken repo
      "contracts/metaTxToken/MetaTxToken.sol",
      "contracts/metaTxToken/DSAuthMeta.sol",
      "contracts/metaTxToken/DSTokenBaseMeta.sol",
    ].indexOf(contractName) > -1
  ) {
    return;
  }

  // Skip non-solidity files
  if (contractName.indexOf(".sol") < 0) {
    return;
  }

  const src = fs.readFileSync(`./${contractName}`, "utf8");

  const result = parser.parse(src, { tolerant: true });
  // Filters out an unknown number of 'pragmas' that we have.
  const contract = result.children.filter((child) => child.type === "ContractDefinition")[0];

  // Check for that all public, non-{view,pure} functions have either stoppable or recovery modifiers.
  contract.subNodes
    .filter((child) => child.type === "FunctionDefinition" && child.name !== "")
    .forEach((functionDef) => {
      const res = correctAuthModifier(functionDef);
      if (!res.valid) {
        console.log(
          "The contract",
          contractName,
          "doesn't appear to have the right auth declaration for function ",
          functionDef.name,
          ". Errors: ",
          res.errors
        );
        process.exit(1);
      }
    });
});
