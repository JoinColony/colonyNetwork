/* eslint-disable no-console */
import parser from "solidity-parser-antlr";
import fs from "fs";
import path from "path";

// Taken from https://gist.github.com/kethinov/6658166#gistcomment-1941504
const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory() ? walkSync(path.join(dir, file), filelist) : filelist.concat(path.join(dir, file)); // eslint-disable-line no-param-reassign
  });
  return filelist;
};

function correctRecoveryModifier(functionDef) {
  const isPrivate = ["private", "internal"].indexOf(functionDef.visibility) > -1;
  const isView = ["view", "pure"].indexOf(functionDef.stateMutability) > -1;
  const hasModifier = functionDef.modifiers.filter(mod => ["stoppable", "recovery", "always"].indexOf(mod.name) > -1).length > 0;
  return isPrivate || (isView || hasModifier);
}

walkSync("./contracts/").forEach(contractName => {
  // These contracts don't need to be checked, since they're not used in recovery mode
  // Basically only Colony.sol, ColonyFunding.sol, and ColonyTask.sol are
  // ColonyNetwork, ColonyNetworkAuction, ColonyNetworkENS, ColonyNetworkMining
  if (
    [
      "contracts/ens/ENS.sol",
      "contracts/ens/ENSRegistry.sol",
      "contracts/gnosis/MultiSigWallet.sol",
      "contracts/PatriciaTree/Bits.sol",
      "contracts/PatriciaTree/Data.sol",
      "contracts/PatriciaTree/IPatriciaTree.sol",
      "contracts/PatriciaTree/PatriciaTree.sol",
      "contracts/PatriciaTree/PatriciaTreeProofs.sol",
      "contracts/Authority.sol",
      "contracts/AuthorityNetwork.sol",
      "contracts/ColonyNetworkStorage.sol",
      "contracts/ColonyStorage.sol",
      "contracts/ERC20Extended.sol",
      "contracts/EtherRouter.sol",
      "contracts/IColony.sol",
      "contracts/IColonyNetwork.sol",
      "contracts/IReputationMiningCycle.sol",
      "contracts/ITokenLocking.sol",
      "contracts/Migrations.sol",
      "contracts/ReputationMiningCycle.sol",
      "contracts/ReputationMiningCycleRespond.sol",
      "contracts/Resolver.sol",
      "contracts/SafeMath.sol",
      "contracts/Token.sol",
      "contracts/TokenLocking.sol",
      "contracts/TokenLockingStorage.sol"
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
  const contract = result.children.filter(child => child.type === "ContractDefinition")[0];

  // Check for that all public, non-{view,pure} functions have either stoppable or recovery modifiers.
  contract.subNodes.filter(child => child.type === "FunctionDefinition").forEach(functionDef => {
    if (!correctRecoveryModifier(functionDef)) {
      console.log("The contract", contractName, "contains a missing stoppable/recovery modifier in function", functionDef.name, ".");
      process.exit(1);
    }
  });
});
