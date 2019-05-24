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

  const contractFileArray = contractFileString.split('\n');
  const contract = ast.children.find(child => child.type === 'ContractDefinition');

  const methods = [];

  contract.subNodes.map(method => {

    // Set the maximum number of lines we want to check
    const maxLines = 20;

    // Set the intial value of notice
    let notice;

    // Set the intial value of params
    const params = [];

    // Set the intial value of returns
    const returns = [];

    // Set the methodLineIndex
    const methodLineIndex = contractFileArray.findIndex(line => {
      return line.includes(`function ${method.name}`)
    });

    // Set the initial value of noticeLineIndex
    let noticeLineIndex = methodLineIndex;

    // Find the noticeLineIndex with a maximum number of lines to check
    while(!contractFileArray[noticeLineIndex].includes(' @notice ')) {
      if (methodLineIndex - maxLines === noticeLineIndex) {
        noticeLineIndex = 0;
        break;
      }
      noticeLineIndex -= 1;
    }

    // Check for additional lines and update notice value
    if (noticeLineIndex) {
      let additionalNoticeLineIndexes = [];
      let additionalNoticeLineIndex = noticeLineIndex + 1;
      while(
        contractFileArray[additionalNoticeLineIndex] &&
        contractFileArray[additionalNoticeLineIndex].includes('///') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' @dev ') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' @param ') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' @return ') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' function ')
      ) {
        additionalNoticeLineIndexes.push(additionalNoticeLineIndex);
        additionalNoticeLineIndex += 1;
      }
      notice = contractFileArray[noticeLineIndex].split(' @notice ')[1];
      additionalNoticeLineIndexes.forEach(index => {
        notice += contractFileArray[index].split('///')[1];
      });
    }

    if (noticeLineIndex && method.parameters) {
      // Set the initial value of paramLineIndex
      let paramLineIndex = noticeLineIndex + 1;
      // Find the params with a maximum number of lines to check
      while (params.length !== method.parameters.parameters.length) {
        if (noticeLineIndex + maxLines === paramLineIndex) break;
        // Check for additional lines and update and push param value
        if (
          contractFileArray[paramLineIndex] &&
          contractFileArray[paramLineIndex].includes(' @param ')
        ) {
          let additionalParamLineIndexes = [];
          let additionalParamLineIndex = paramLineIndex;
          while(
            contractFileArray[additionalParamLineIndex] &&
            contractFileArray[additionalParamLineIndex].includes('///') &&
            !contractFileArray[additionalParamLineIndex].includes(' @dev ') &&
            !contractFileArray[additionalParamLineIndex].includes(' @param ') &&
            !contractFileArray[additionalParamLineIndex].includes(' @return ') &&
            !contractFileArray[additionalParamLineIndex].includes(' function ')
          ) {
            additionalParamLineIndexes.push(additionalParamLineIndex);
            additionalParamLineIndex += 1;
          }
          let param = contractFileArray[paramLineIndex].split(' @param ')[1];
          additionalParamLineIndexes.forEach(index => {
            param += contractFileArray[index].split('///')[1];
          });
          // Push to params
          params.push(param);
        }
        paramLineIndex += 1;
      }
    }

    if (noticeLineIndex && method.returnParameters) {
      // Set the initial value of paramLineIndex
      let returnLineIndex = noticeLineIndex + 1;
      // Find the return params with a maximum number of lines to check
      while (returns.length !== method.returnParameters.parameters.length) {
        if (noticeLineIndex + maxLines === returnLineIndex) break;
        // Check for additional lines and update and push param value
        if (
          contractFileArray[returnLineIndex] &&
          contractFileArray[returnLineIndex].includes(' @return ')
        ) {
          let additionalReturnLineIndexes = [];
          let additionalReturnLineIndex = returnLineIndex;
          while(
            contractFileArray[additionalReturnLineIndex] &&
            contractFileArray[additionalReturnLineIndex].includes('///') &&
            !contractFileArray[additionalReturnLineIndex].includes(' @dev ') &&
            !contractFileArray[additionalReturnLineIndex].includes(' @param ') &&
            !contractFileArray[additionalReturnLineIndex].includes(' @return ') &&
            !contractFileArray[additionalReturnLineIndex].includes(' function ')
          ) {
            additionalReturnLineIndexes.push(additionalReturnLineIndex);
            additionalReturnLineIndex += 1;
          }
          let param = contractFileArray[returnLineIndex].split(' @return ')[1];
          additionalReturnLineIndexes.forEach(index => {
            param += contractFileArray[index].split('///')[1];
          });
          // Push to returns
          returns.push(param);
        }
        returnLineIndex += 1;
      }
    }

    // Push method to methods array
    methods.push({
      ...method,
      natspec: {
        notice,
        params,
        returns,
      },
    });

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
      arrayType = `${param.typeName.baseTypeName.name}[]`;
    }
    const name = param.name || param.typeName.name;
    const type = param.typeName.name || arrayType || param.name;
    const valid = natspecParams[index] && natspecParams[index].substring(0, name.length) === name
    const description = valid ? natspecParams[index].slice(name.length + 1) : '';
    return `|${name}|${type || 'memory' }|${description}`
  })
  .join('\n')}`;
  }
  return '';
}
