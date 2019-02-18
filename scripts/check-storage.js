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

walkSync("./contracts/").forEach(contractName => {
  // Contracts listed here are allowed to have storage variables
  if (
    [
      "contracts/ens/ENSRegistry.sol", // Not directly used by any colony contracts
      "contracts/gnosis/MultiSigWallet.sol", // Not directly used by any colony contracts
      "contracts/modules/OneClick.sol", // An external module
      "contracts/PatriciaTree/PatriciaTreeBase.sol", // Only used by mining clients
      "contracts/CommonAuthority.sol",
      "contracts/ColonyAuthority.sol",
      "contracts/ColonyNetworkAuthority.sol",
      "contracts/ColonyNetworkStorage.sol",
      "contracts/ColonyStorage.sol",
      "contracts/CommonStorage.sol",
      "contracts/EtherRouter.sol",
      "contracts/Migrations.sol",
      "contracts/ReputationMiningCycleStorage.sol",
      "contracts/Resolver.sol",
      "contracts/Token.sol", // Imported from colonyToken repo
      "contracts/TokenAuthority.sol", // Imported from colonyToken repo
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
  // Check for non-constant storage variables

  if (contract.subNodes.filter(child => child.type === "StateVariableDeclaration" && !child.variables[0].isDeclaredConst).length > 0) {
    console.log(
      "The contract ",
      contractName,
      " contains state variable declarations. ",
      "Add new state variables to relevant Storage contract instead, to guarantee that the storage layout is the same between contracts."
    );
    process.exit(1);
  }
});
