#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const parser = require("@solidity-parser/parser");
const { execSync } = require("child_process");
const ethers = require("ethers");

const INTERFACES = [
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "colony", "IColony.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "icolony.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "icolony.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "colony", "IColony.sol", "IColony.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "colonyNetwork", "IColonyNetwork.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "icolonynetwork.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "icolonynetwork.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "colonyNetwork", "IColonyNetwork.sol", "IColonyNetwork.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "common", "IEtherRouter.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "ietherrouter.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "ietherrouter.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "common", "IEtherRouter.sol", "IEtherRouter.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "colony", "IMetaColony.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "imetacolony.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "imetacolony.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "colony", "IMetaColony.sol", "IMetaColony.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "common", "IRecovery.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "irecovery.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "irecovery.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "common", "IRecovery.sol", "IRecovery.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "reputationMiningCycle", "IReputationMiningCycle.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "ireputationminingcycle.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "ireputationminingcycle.md"),
    artifactFile: path.resolve(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      "reputationMiningCycle",
      "IReputationMiningCycle.sol",
      "IReputationMiningCycle.json",
    ),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "tokenLocking", "ITokenLocking.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "itokenlocking.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "itokenlocking.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "tokenLocking", "ITokenLocking.sol", "ITokenLocking.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "IColonyExtension.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "icolonyextension.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "icolonyextension.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "IColonyExtension.sol", "IColonyExtension.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "CoinMachine.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "coinmachine.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "coinmachine.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "CoinMachine.sol", "CoinMachine.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "EvaluatedExpenditure.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "evaluatedexpenditure.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "evaluatedexpenditure.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "EvaluatedExpenditure.sol", "EvaluatedExpenditure.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "FundingQueue.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "fundingqueue.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "fundingqueue.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "FundingQueue.sol", "FundingQueue.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "OneTxPayment.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "onetxpayment.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "onetxpayment.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "OneTxPayment.sol", "OneTxPayment.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "StakedExpenditure.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "stakedexpenditure.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "stakedexpenditure.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "StakedExpenditure.sol", "StakedExpenditure.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "StreamingPayments.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "streamingpayments.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "streamingpayments.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "StreamingPayments.sol", "StreamingPayments.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "TokenSupplier.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "tokensupplier.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "tokensupplier.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "TokenSupplier.sol", "TokenSupplier.json"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "votingReputation", "IVotingReputation.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "votingreputation.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "votingreputation.md"),
    artifactFile: path.resolve(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      "extensions",
      "votingReputation",
      "IVotingReputation.sol",
      "IVotingReputation.json",
    ),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "Whitelist.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", ".templates", "whitelist.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "interfaces", "extensions", "whitelist.md"),
    artifactFile: path.resolve(__dirname, "..", "artifacts", "contracts", "extensions", "Whitelist.sol", "Whitelist.json"),
  },
];

let foundError = false;

const generateMarkdown = ({ contractFile, templateFile, outputFile, artifactFile }) => {
  console.log(`Generating documentation for ${contractFile.split("/").pop()}`);
  // Using an intermediate file because some are too big for the buffer
  execSync(`npx hardhat flatten ${contractFile} > ${contractFile}.flattened`);
  const contractFileString = fs.readFileSync(`${contractFile}.flattened`).toString();
  fs.rmSync(`${contractFile}.flattened`);
  const templateFileString = fs.readFileSync(templateFile).toString();
  const ast = parser.parse(contractFileString, { loc: true });
  const artifact = JSON.parse(fs.readFileSync(artifactFile).toString());
  const { abi } = artifact;

  const contracts = ast.children.filter((child) => {
    return child.type === "ContractDefinition";
  });

  const contractFileArray = contractFileString.split("\n");

  function isValidAdditionalLine(index) {
    return (
      contractFileArray[index] &&
      contractFileArray[index].includes("///") &&
      !contractFileArray[index].includes(" @dev ") &&
      !contractFileArray[index].includes(" @param ") &&
      !contractFileArray[index].includes(" @return ")
    );
  }

  function findNatspecLine(_startIndex, tag) {
    let startIndex = _startIndex;
    // Parse through the natspec block until we find the tag we want
    while (contractFileArray[startIndex] && contractFileArray[startIndex].includes("///") && !contractFileArray[startIndex].includes(tag)) {
      startIndex += 1;
    }

    const line = contractFileArray[startIndex];
    if (line && line.includes(tag)) {
      const additionalLines = [];
      let additionalLineIndex = startIndex + 1;
      while (isValidAdditionalLine(additionalLineIndex)) {
        additionalLines.push(additionalLineIndex);
        additionalLineIndex += 1;
      }
      return {
        content: line.split(tag)[1],
        additionalLines,
      };
    }
    return null;
  }

  function findNatspecParams(startIndex, count, tag) {
    const params = [];
    let currentIndex = startIndex;
    while (params.length < count && currentIndex < contractFileArray.length) {
      const line = contractFileArray[currentIndex];
      if (line && line.includes(tag)) {
        const additionalLines = [];
        let additionalLineIndex = currentIndex + 1;
        while (isValidAdditionalLine(additionalLineIndex)) {
          additionalLines.push(additionalLineIndex);
          additionalLineIndex += 1;
        }
        let param = line.split(tag)[1];
        additionalLines.forEach((index) => {
          param += contractFileArray[index].split("///")[1];
        });
        params.push(param);
      }
      currentIndex += 1;
    }
    return params;
  }

  const methods = [];

  for (const contract of contracts) {
    contract.subNodes
      .filter(({ type, visibility }) => type === "FunctionDefinition" && (visibility === "external" || visibility === "public"))
      // eslint-disable-next-line no-loop-func
      .forEach((method) => {
        // Set the initial natspec values
        const natspec = {
          notice: null,
          dev: null,
          params: [],
          returns: [],
        };
        const methodLineIndex = method.loc.start.line - 1;

        // Set the initial value for the natsepc notice
        let noticeLineIndex = methodLineIndex - 1;

        // Get the line index for the natspec notice
        while (
          (contractFileArray[noticeLineIndex] &&
            contractFileArray[noticeLineIndex].includes("///") &&
            !contractFileArray[noticeLineIndex].includes(" @notice ")) ||
          // ignore slither comments
          contractFileArray[noticeLineIndex].includes("slither-disable")
        ) {
          noticeLineIndex -= 1;
        }

        // Check whether the current line is a valid notice line
        const noticeLine = findNatspecLine(noticeLineIndex, " @notice ");
        if (noticeLine) {
          natspec.notice = noticeLine.content;
          noticeLine.additionalLines.forEach((index) => {
            natspec.notice += contractFileArray[index].split("///")[1];
          });

          // Check whether the current line is a valid dev line
          const devLine = findNatspecLine(noticeLineIndex + 1, " @dev ");
          if (devLine) {
            natspec.dev = devLine.content;
            devLine.additionalLines.forEach((index) => {
              natspec.dev += contractFileArray[index].split("///")[1];
            });
          }

          // Check whether the method has params
          if (method.parameters) {
            natspec.params = findNatspecParams(noticeLineIndex + 1, method.parameters.length, " @param ");
          }

          // Check whether the method has returns
          if (method.returnParameters) {
            natspec.returns = findNatspecParams(noticeLineIndex + 1, method.returnParameters.length, " @return ");
          }
        }
        methods.push({ ...method, natspec });
      });
  }

  const interfaceMethods = [];
  const contractInterface = new ethers.utils.Interface(abi);

  contractInterface.format(ethers.utils.FormatTypes.minimal).forEach((interfaceMethod) => {
    const res = methods.filter((method) =>
      interfaceMethod.startsWith(
        new ethers.utils.Interface([`function ${astToSig(method).split(":")[0]}`]).format(ethers.utils.FormatTypes.minimal)[0],
      ),
    );
    if (res.length === 1) {
      interfaceMethods.push(res[0]);
    } else if (res.length > 1) {
      // Choose the one with the best^H^H^H^H longest documentation
      res.sort((a, b) => {
        return JSON.stringify(b.natspec).length - JSON.stringify(a.natspec).length;
      });
      interfaceMethods.push(res[0]);
    }
  });

  const md = `
  ${templateFileString}
  ${printMethods(interfaceMethods)}
  `.trim();

  fs.writeFileSync(outputFile, md);
};

INTERFACES.forEach(generateMarkdown);

// If warnings were generated, we exit with 1 to fail CI
if (foundError) {
  process.exit(1);
}

function printMethods(methods) {
  if (!methods.length) return "";
  methods.sort((a, b) => {
    const x = astToSig(a);
    const y = astToSig(b);
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  });
  for (const method of methods) {
    if (!method.natspec.notice) {
      console.error(`Warning: ${method.name} is missing a natspec @notice`);
      foundError = true;
    }
  }

  return `
## Interface Methods
${methods
  .map(
    (method) => `
### ▸ \`${astToSig(method)}\`\n
${method.natspec.notice ? method.natspec.notice : ""}
${
  method.natspec.dev
    ? `
*Note: ${method.natspec.dev}*`
    : ""
}
${
  method.parameters && method.parameters.length
    ? `
**Parameters**
${printParamTable(method, method.parameters, method.natspec.params)}`
    : ""
}
${
  method.returnParameters && method.returnParameters.length
    ? `
**Return Parameters**
${printParamTable(method, method.returnParameters, method.natspec.returns)}`
    : ""
}
`,
  )
  .join("")}`;
}

function astToSig(method) {
  return `${method.name}(${method.parameters
    .map((p) => {
      if (p.typeName.name) {
        return `${p.typeName.name}${p.storageLocation ? ` ${p.storageLocation}` : ""} ${p.name}`;
      }
      if (p.typeName.namePath) {
        return `${p.typeName.namePath} ${p.name}`;
      }
      if (p.typeName.type === "ArrayTypeName") {
        return `${p.typeName.baseTypeName.name}[${p.typeName.length ? p.typeName.length.number : ""}]${
          p.storageLocation ? ` ${p.storageLocation}` : ""
        } ${p.name}`;
      }
      console.log("Unknown parameter type...");
      return process.exit(1);
    })
    .join(", ")})${printReturnTypes(method.returnParameters)}`;
}

function printReturnTypes(returnParameters) {
  return returnParameters ? `:${returnParameters.map((param) => `${getType(param)} ${getName(param)}`).join(", ")}` : "";
}

function printParamTable(method, params, natspecParams) {
  if (params.length) {
    return `\n|Name|Type|Description|\n|---|---|---|\n${params
      .map((param, index) => printParamEntry(method, param, index, natspecParams))
      .join("\n")}`;
  }
  return "";
}

function getName(param) {
  return param.name || param.typeName.name || param.typeName.namePath;
}

function getType(param) {
  let arrayType;
  let userDefinedType;
  if (param.typeName.type === "ArrayTypeName") {
    const length = param.typeName.length ? param.typeName.length.number : "";
    arrayType = `${param.typeName.baseTypeName.name || param.typeName.baseTypeName.namePath}[${length}]`;
  }
  if (param.typeName.type === "UserDefinedTypeName") {
    userDefinedType = param.typeName.namePath;
  }
  return param.typeName.name || arrayType || userDefinedType;
}

function printParamEntry(method, param, index, natspecParams) {
  const name = getName(param);
  const type = getType(param);
  let description = "";
  const matchingDescription = natspecParams[index] && natspecParams[index].substring(0, name.length) === name;
  if (matchingDescription) {
    description = natspecParams[index].slice(name.length + 1);
  } else {
    console.error(`Warning: ${method.name} ${name} has no matching natspec comment`);
    foundError = true;
  }
  return `|${name}|${type}|${description}`;
}
