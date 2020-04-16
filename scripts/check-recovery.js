import parser from "solidity-parser-antlr";
import fs from "fs";
import path from "path";

// Taken from https://gist.github.com/kethinov/6658166#gistcomment-1941504
const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach((file) => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory() ? walkSync(path.join(dir, file), filelist) : filelist.concat(path.join(dir, file)); // eslint-disable-line no-param-reassign
  });
  return filelist;
};

function correctRecoveryModifier(functionDef) {
  const isPrivate = ["private", "internal"].indexOf(functionDef.visibility) > -1;
  const isView = ["view", "pure"].indexOf(functionDef.stateMutability) > -1;
  const hasModifier = functionDef.modifiers.filter((mod) => ["stoppable", "recovery", "always"].indexOf(mod.name) > -1).length > 0;
  return isPrivate || isView || hasModifier;
}

walkSync("./contracts/").forEach((contractName) => {
  // These contracts don't need to be checked, since they're not used in recovery mode
  // Basically only Colony.sol, ColonyFunding.sol, ColonyTask.sol and ColonyPayment.sol are
  // ColonyNetwork, ColonyNetworkAuction, ColonyNetworkENS, ColonyNetworkMining
  if (
    [
      "contracts/colony/ColonyAuthority.sol",
      "contracts/colony/ColonyStorage.sol",
      "contracts/colony/IColony.sol",
      "contracts/colony/IMetaColony.sol",
      "contracts/colonyNetwork/ColonyNetworkAuthority.sol",
      "contracts/colonyNetwork/ColonyNetworkStorage.sol",
      "contracts/colonyNetwork/IColonyNetwork.sol",
      "contracts/common/CommonAuthority.sol",
      "contracts/common/DomainRoles.sol",
      "contracts/common/ERC20Extended.sol",
      "contracts/common/EtherRouter.sol",
      "contracts/common/IEtherRouter.sol",
      "contracts/common/IRecovery.sol",
      "contracts/common/Resolver.sol",
      "contracts/ens/ENS.sol",
      "contracts/ens/ENSRegistry.sol",
      "contracts/extensions/CoinMachine.sol",
      "contracts/extensions/CoinMachineFactory.sol",
      "contracts/extensions/ExtensionFactory.sol",
      "contracts/extensions/FundingQueue.sol",
      "contracts/extensions/FundingQueueFactory.sol",
      "contracts/extensions/OneTxPayment.sol",
      "contracts/extensions/OneTxPaymentFactory.sol",
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
      "contracts/testHelpers/NoLimitSubdomains.sol",
      "contracts/testHelpers/TaskSkillEditing.sol",
      "contracts/testHelpers/FunctionsNotAvailableOnColony.sol",
      "contracts/testHelpers/TransferTest.sol",
      "contracts/tokenLocking/ITokenLocking.sol",
      "contracts/tokenLocking/TokenLocking.sol",
      "contracts/tokenLocking/TokenLockingStorage.sol",
      "contracts/Migrations.sol",
      "contracts/Token.sol", // Imported from colonyToken repo
      "contracts/TokenAuthority.sol", // Imported from colonyToken repo
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
      if (!correctRecoveryModifier(functionDef)) {
        console.log("The contract", contractName, "contains a missing stoppable/recovery modifier in function", functionDef.name, ".");
        process.exit(1);
      }
    });
});
