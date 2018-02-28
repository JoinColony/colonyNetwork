/* eslint-disable no-console */
import parser from "solidity-parser-antlr";
import fs from "fs";

fs.readdirSync("./contracts/").forEach(contractName => {
  if (
    [
      "gnosis",
      "Authority.sol",
      "ColonyNetworkStorage.sol",
      "ColonyStorage.sol",
      "EtherRouter.sol",
      "Migrations.sol",
      "Resolver.sol",
      "Token.sol"
    ].indexOf(contractName) > -1
  ) {
    return;
  }
  const src = fs.readFileSync(`./contracts/${contractName}`, "utf8");

  const result = parser.parse(src, { tolerant: true });
  // Filters out an unknown number of 'pragmas' that we have.
  const contract = result.children.filter(child => child.type === "ContractDefinition")[0];
  // Check for non-constant storage variables
  if (contract.subNodes.filter(child => child.type === "StateVariableDeclaration" && !child.variables[0].isDeclaredConst).length > 0) {
    console.log(
      "The contract ",
      contractName,
      " contains state variable declarations. ",
      "Add new state variables to ColonyStorage instead to guarantee that the storage layout is the same between contracts."
    );
    process.exit(1);
  }
});
