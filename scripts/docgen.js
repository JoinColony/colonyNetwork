#!/usr/bin/env node
/* eslint-disable */

const fs = require('fs');
const path = require('path');
const parser = require('solidity-parser-antlr');

const INTERFACES = [
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'IColony.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_IColony.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_IColony.md'),
  },
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'IColonyNetwork.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_IColonyNetwork.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_IColonyNetwork.md'),
  },
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'IEtherRouter.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_IEtherRouter.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_IEtherRouter.md'),
  },
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'IMetaColony.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_IMetaColony.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_IMetaColony.md'),
  },
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'IRecovery.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_IRecovery.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_IRecovery.md'),
  },
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'IReputationMiningCycle.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_IReputationMiningCycle.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_IReputationMiningCycle.md'),
  },
  {
    contractFile: path.resolve(__dirname, '..', 'contracts', 'ITokenLocking.sol'),
    templateFile: path.resolve(__dirname, '..', 'docs', 'templates', '_Interface_ITokenLocking.md'),
    outputFile: path.resolve(__dirname, '..', 'docs', '_Interface_ITokenLocking.md'),
  },
];

const generateMarkdown = ({ contractFile, templateFile, outputFile }) => {

  const contractFileString = fs.readFileSync(contractFile).toString();
  const templateFileString = fs.readFileSync(templateFile).toString();

  const ast = parser.parse(contractFileString);

  const contract = ast.children.find(child => {
    return child.type === 'ContractDefinition'
  });

  const contractFileArray = contractFileString.split('\n');

  function isValidNatspecLine(index) {
    return (
      contractFileArray[index] &&
      contractFileArray[index].includes('///') &&
      !contractFileArray[index].includes(' @dev ') &&
      !contractFileArray[index].includes(' @param ') &&
      !contractFileArray[index].includes(' @return ')
    );
  }

  const methods = [];

  contract.subNodes.map(method => {

    // Set initial natspec values
    const natspec = {
      notice: null,
      dev: null,
      params: [],
      returns: [],
    }

    // Get the index of the line on which the method is declared
    const methodLineIndex = contractFileArray.findIndex(line => {
      return line.includes(`function ${method.name}(`)
    });

    // Get the initial value for the notice line index
    let noticeLineIndex = methodLineIndex - 1;

    // Get the line index for the natspec notice
    while(
      contractFileArray[noticeLineIndex] &&
      contractFileArray[noticeLineIndex].includes('///') &&
      !contractFileArray[noticeLineIndex].includes(' @notice ')
    ) {
      noticeLineIndex -= 1;
    }

    // Get the natspec notice
    if (contractFileArray[noticeLineIndex]) {
      const additionalNoticeLineIndexes = [];
      let additionalNoticeLineIndex = noticeLineIndex + 1;
      while(isValidNatspecLine(additionalNoticeLineIndex)) {
        additionalNoticeLineIndexes.push(additionalNoticeLineIndex);
        additionalNoticeLineIndex += 1;
      }
      natspec.notice = contractFileArray[noticeLineIndex].split(' @notice ')[1];
      additionalNoticeLineIndexes.forEach(index => {
        natspec.notice += contractFileArray[index].split('///')[1];
      });
    }

    // Get the natspec dev
    if (contractFileArray[noticeLineIndex]) {
      const additionalDevLineIndexes = [];
      let devLineIndex = noticeLineIndex + 1;
      let additionalDevLineIndex = devLineIndex + 1;
      while(isValidNatspecLine(additionalDevLineIndex)) {
        additionalDevLineIndexes.push(additionalDevLineIndex);
        additionalDevLineIndex += 1;
      }
      if (contractFileArray[devLineIndex].includes(' @dev ')) {
        natspec.dev = contractFileArray[devLineIndex].split(' @dev ')[1];
        additionalDevLineIndexes.forEach(index => {
          natspec.dev += contractFileArray[index].split('///')[1];
        });
      }
    }

    // Get the natspec params
    if (contractFileArray[noticeLineIndex] && method.parameters) {
      let paramLineIndex = noticeLineIndex + 1;
      while (
        contractFileArray[paramLineIndex] &&
        contractFileArray[paramLineIndex].includes('///') &&
        natspec.params.length !== method.parameters.parameters.length
      ) {
        if (
          contractFileArray[paramLineIndex] &&
          contractFileArray[paramLineIndex].includes(' @param ')
        ) {
          const additionalParamLineIndexes = [];
          let additionalParamLineIndex = paramLineIndex;
          while(isValidNatspecLine(additionalParamLineIndex)) {
            additionalParamLineIndexes.push(additionalParamLineIndex);
            additionalParamLineIndex += 1;
          }
          let param = contractFileArray[paramLineIndex].split(' @param ')[1];
          additionalParamLineIndexes.forEach(index => {
            param += contractFileArray[index].split('///')[1];
          });
          natspec.params.push(param);
        }
        paramLineIndex += 1;
      }
    }

    // Get the natspec returns
    if (contractFileArray[noticeLineIndex] && method.returnParameters) {
      let returnLineIndex = noticeLineIndex + 1;
      while (
        contractFileArray[returnLineIndex] &&
        contractFileArray[returnLineIndex].includes('///') &&
        natspec.returns.length !== method.returnParameters.parameters.length
      ) {
        if (
          contractFileArray[returnLineIndex] &&
          contractFileArray[returnLineIndex].includes(' @return ')
        ) {
          const additionalReturnLineIndexes = [];
          let additionalReturnLineIndex = returnLineIndex;
          while(
            contractFileArray[additionalReturnLineIndex] &&
            contractFileArray[additionalReturnLineIndex].includes('///') &&
            !contractFileArray[additionalReturnLineIndex].includes(' @dev ') &&
            !contractFileArray[additionalReturnLineIndex].includes(' @param ') &&
            !contractFileArray[additionalReturnLineIndex].includes(' @return ')
          ) {
            additionalReturnLineIndexes.push(additionalReturnLineIndex);
            additionalReturnLineIndex += 1;
          }
          let param = contractFileArray[returnLineIndex].split(' @return ')[1];
          additionalReturnLineIndexes.forEach(index => {
            param += contractFileArray[index].split('///')[1];
          });
          natspec.returns.push(param);
        }
        returnLineIndex += 1;
      }
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
  if (!methods.length) return '';
  methods.sort((a, b) => {
    var x = a.name.toLowerCase();
    var y = b.name.toLowerCase();
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  });
  return `
## Interface Methods
` + methods.map(method => `
### \`${method.name}\`\n
${method.natspec.notice ? method.natspec.notice : ''}
${method.natspec.dev ? `
*Note: ${method.natspec.dev}*` : ''}
${method.parameters && method.parameters.parameters.length ? `
**Parameters**
` + printParams(method.parameters.parameters, method.natspec.params) : ''}
${method.returnParameters && method.returnParameters.parameters.length ? `
**Return Parameters**
` + printParams(method.returnParameters.parameters, method.natspec.returns) : ''}
`).join('');

}

function printParams(params, natspecParams) {
  if (params.length) {
    return `
|Name|Type|Description|
|---|---|---|
${params
  .map((param, index) => {
    let arrayType;
    if (param.typeName.type === 'ArrayTypeName') {
      const length = param.typeName.length ? param.typeName.length.number : '';
      arrayType = `${param.typeName.baseTypeName.name}[${length}]`;
    }
    const name = param.name || param.typeName.name;
    const type = param.typeName.name || arrayType || param.name;
    const valid = natspecParams[index] && natspecParams[index].substring(0, name.length) === name
    const description = valid ? natspecParams[index].slice(name.length + 1) : '';
    return `|${name}|${type}|${description}`
  })
  .join('\n')}`;
  }
  return '';
}
