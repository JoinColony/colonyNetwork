#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const parser = require("@solidity-parser/parser");

const INTERFACES = [
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "colony", "IColony.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_IColony.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_IColony.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "colonyNetwork", "IColonyNetwork.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_IColonyNetwork.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_IColonyNetwork.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "common", "IEtherRouter.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_IEtherRouter.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_IEtherRouter.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "colony", "IMetaColony.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_IMetaColony.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_IMetaColony.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "common", "IRecovery.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_IRecovery.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_IRecovery.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "reputationMiningCycle", "IReputationMiningCycle.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_IReputationMiningCycle.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_IReputationMiningCycle.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "tokenLocking", "ITokenLocking.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_ITokenLocking.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_ITokenLocking.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "CoinMachine.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_CoinMachine.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_CoinMachine.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "OneTxPayment.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_OneTxPayment.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_OneTxPayment.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "VotingReputation.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_VotingReputation.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_VotingReputation.md"),
  },
  {
    contractFile: path.resolve(__dirname, "..", "contracts", "extensions", "Whitelist.sol"),
    templateFile: path.resolve(__dirname, "..", "docs", "templates", "_Interface_Whitelist.md"),
    outputFile: path.resolve(__dirname, "..", "docs", "_Interface_Whitelist.md"),
  },
];

const generateMarkdown = ({ contractFile, templateFile, outputFile }) => {
  const contractFileString = fs.readFileSync(contractFile).toString();
  const templateFileString = fs.readFileSync(templateFile).toString();

  const ast = parser.parse(contractFileString, { loc: true });

  const contract = ast.children.find((child) => {
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

  const methods = [];

  console.log(`Generating ${contract.name} documentation...`);

  contract.subNodes
    .filter(({ type, visibility }) => type === "FunctionDefinition" && (visibility === "external" || visibility === "public"))
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
        contractFileArray[noticeLineIndex] &&
        contractFileArray[noticeLineIndex].includes("///") &&
        !contractFileArray[noticeLineIndex].includes(" @notice ")
      ) {
        noticeLineIndex -= 1;
      }

      // Check whether the current line is a valid notice line
      if (contractFileArray[noticeLineIndex].includes(" @notice ")) {
        // Get additional natspec notice lines
        const additionalNoticeLineIndexes = [];
        let additionalNoticeLineIndex = noticeLineIndex + 1;
        while (isValidAdditionalLine(additionalNoticeLineIndex)) {
          additionalNoticeLineIndexes.push(additionalNoticeLineIndex);
          additionalNoticeLineIndex += 1;
        }

        // Set natspec notice including additional natspec notice lines
        [, natspec.notice] = contractFileArray[noticeLineIndex].split(" @notice ");
        additionalNoticeLineIndexes.forEach((index) => {
          natspec.notice += contractFileArray[index].split("///")[1];
        });

        // Set the initial value for the dev line index
        let devLineIndex = noticeLineIndex + 1;

        // Get the natspec dev line index
        while (
          contractFileArray[devLineIndex] &&
          contractFileArray[devLineIndex].includes("///") &&
          !contractFileArray[devLineIndex].includes(" @dev ")
        ) {
          devLineIndex += 1;
        }

        // Check whether the current line is a valid dev line
        if (contractFileArray[devLineIndex].includes(" @dev ")) {
          // Get additional natspec dev lines
          const additionalDevLineIndexes = [];
          let additionalDevLineIndex = devLineIndex + 1;
          while (isValidAdditionalLine(additionalDevLineIndex)) {
            additionalDevLineIndexes.push(additionalDevLineIndex);
            additionalDevLineIndex += 1;
          }

          // Set natspec dev including additional natspec dev lines
          [, natspec.dev] = contractFileArray[devLineIndex].split(" @dev ");
          additionalDevLineIndexes.forEach((index) => {
            natspec.dev += contractFileArray[index].split("///")[1];
          });
        }

        // Check whether the method has params
        if (method.parameters) {
          // Set the initial value for the param line index
          let paramLineIndex = noticeLineIndex + 1;

          // Get the natspec param line index for each param
          while (
            contractFileArray[paramLineIndex] &&
            contractFileArray[paramLineIndex].includes("///") &&
            natspec.params.length !== method.parameters.length
          ) {
            // Check whether the current line is a valid param line
            if (contractFileArray[paramLineIndex].includes(" @param ")) {
              // Get additional natspec param lines
              const additionalParamLineIndexes = [];
              let additionalParamLineIndex = paramLineIndex + 1;
              while (isValidAdditionalLine(additionalParamLineIndex)) {
                additionalParamLineIndexes.push(additionalParamLineIndex);
                additionalParamLineIndex += 1;
              }

              // Set natspec param including additional natspec param lines
              let param = contractFileArray[paramLineIndex].split(" @param ")[1];
              additionalParamLineIndexes.forEach((index) => {
                param += contractFileArray[index].split("///")[1];
              });

              // Push the param and continue loop
              natspec.params.push(param);
            }

            // Incremenent the param line
            paramLineIndex += 1;
          }
        }

        // Check whether the method has returns
        if (method.returnParameters) {
          // Set the initial value for the return line index
          let returnLineIndex = noticeLineIndex + 1;

          // Get the natspec return line index for each return
          while (
            contractFileArray[returnLineIndex] &&
            contractFileArray[returnLineIndex].includes("///") &&
            natspec.returns.length !== method.returnParameters.length
          ) {
            // Check whether the current line is a valid return line
            if (contractFileArray[returnLineIndex].includes(" @return ")) {
              // Get additional natspec return lines
              const additionalReturnLineIndexes = [];
              let additionalReturnLineIndex = returnLineIndex + 1;
              while (isValidAdditionalLine(additionalReturnLineIndex)) {
                additionalReturnLineIndexes.push(additionalReturnLineIndex);
                additionalReturnLineIndex += 1;
              }

              // Set natspec return including additional natspec return lines
              let param = contractFileArray[returnLineIndex].split(" @return ")[1];
              additionalReturnLineIndexes.forEach((index) => {
                param += contractFileArray[index].split("///")[1];
              });

              // Push the return and continue loop
              natspec.returns.push(param);
            }

            // Incremenent the return line
            returnLineIndex += 1;
          }
        }
      } else {
        // Log warning for any methods without a valid notice line
        console.warn(`Warning: ${method.name} is missing a natspec @notice`);
      }

      // Push the method and append natspec
      methods.push({ ...method, natspec });
    });

  const md = `
  ${templateFileString}
  ${printMethods(methods)}
  `.trim();

  fs.writeFileSync(outputFile, md);
};

INTERFACES.forEach(generateMarkdown);

function printMethods(methods) {
  if (!methods.length) return "";
  methods.sort((a, b) => {
    const x = astToSig(a);
    const y = astToSig(b);
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  });
  return `
## Interface Methods
${methods
  .map(
    (method) => `
### \`${method.name}\`\n
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
${printParams(method, method.parameters, method.natspec.params)}`
    : ""
}
${
  method.returnParameters && method.returnParameters.length
    ? `
**Return Parameters**
${printParams(method, method.returnParameters, method.natspec.returns)}`
    : ""
}
`
  )
  .join("")}`;
}

function astToSig(method) {
  return `function ${method.name}(${method.parameters
    .map((p) => {
      if (p.typeName.name) {
        return `${p.typeName.name}${p.storageLocation ? ` ${p.storageLocation}` : ""} ${p.name}`;
      }
      if (p.typeName.namePath) {
        return `${p.typeName.namePath} ${p.name}`;
      }
      if (p.typeName.type === "ArrayTypeName") {
        return `${p.typeName.baseTypeName.name}[${p.typeName.length || ""}]${p.storageLocation ? ` ${p.storageLocation}` : ""} ${p.name}`;
      }
      console.log("Unknown parameter type...");
      return process.exit(1);
    })
    .join(", ")})`;
}

function printParams(method, params, natspecParams) {
  if (params.length) {
    return `\n|Name|Type|Description|\n|---|---|---|\n${params.map((param, index) => printParam(method, param, index, natspecParams)).join("\n")}`;
  }
  return "";
}

function printParam(method, param, index, natspecParams) {
  const name = param.name || param.typeName.name || param.typeName.namePath;
  let arrayType;
  let userDefinedType;
  if (param.typeName.type === "ArrayTypeName") {
    const length = param.typeName.length ? param.typeName.length.number : "";
    arrayType = `${param.typeName.baseTypeName.name || param.typeName.baseTypeName.namePath}[${length}]`;
  }
  if (param.typeName.type === "UserDefinedTypeName") {
    userDefinedType = param.typeName.namePath;
  }
  const type = param.typeName.name || arrayType || userDefinedType;
  let description = "";
  const matchingDescription = natspecParams[index] && natspecParams[index].substring(0, name.length) === name;
  if (matchingDescription) {
    description = natspecParams[index].slice(name.length + 1);
  } else {
    console.warn(`Warning: ${method.name} ${name} has no matching natspec comment`);
  }
  return `|${name}|${type}|${description}`;
}
