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

    let notice;
    let dev;
    const params = [];
    const returns = [];

    // Set the maximum number of lines to check
    const maxLines = 20;

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

    // Get natspec notice
    if (noticeLineIndex) {
      const additionalNoticeLineIndexes = [];
      let additionalNoticeLineIndex = noticeLineIndex + 1;
      while(
        contractFileArray[additionalNoticeLineIndex] &&
        contractFileArray[additionalNoticeLineIndex].includes('///') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' @dev ') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' @param ') &&
        !contractFileArray[additionalNoticeLineIndex].includes(' @return ')
      ) {
        additionalNoticeLineIndexes.push(additionalNoticeLineIndex);
        additionalNoticeLineIndex += 1;
      }
      notice = contractFileArray[noticeLineIndex].split(' @notice ')[1];
      additionalNoticeLineIndexes.forEach(index => {
        notice += contractFileArray[index].split('///')[1];
      });
    }

    // Get natspec dev
    if (noticeLineIndex) {
      const additionalDevLineIndexes = [];
      let devLineIndex = noticeLineIndex + 1;
      let additionalDevLineIndex = devLineIndex + 1;
      while(
        contractFileArray[additionalDevLineIndex] &&
        contractFileArray[additionalDevLineIndex].includes('///') &&
        !contractFileArray[additionalDevLineIndex].includes(' @dev ') &&
        !contractFileArray[additionalDevLineIndex].includes(' @param ') &&
        !contractFileArray[additionalDevLineIndex].includes(' @return ')
      ) {
        additionalDevLineIndexes.push(additionalDevLineIndex);
        additionalDevLineIndex += 1;
      }
      if (contractFileArray[devLineIndex].includes(' @dev ')) {
        dev = contractFileArray[devLineIndex].split(' @dev ')[1];
        additionalDevLineIndexes.forEach(index => {
          dev += contractFileArray[index].split('///')[1];
        });
      }
    }

    // Get natspec params
    if (noticeLineIndex && method.parameters) {
      let paramLineIndex = noticeLineIndex + 1;
      while (
        noticeLineIndex + maxLines !== paramLineIndex &&
        params.length !== method.parameters.parameters.length
      ) {
        if (
          contractFileArray[paramLineIndex] &&
          contractFileArray[paramLineIndex].includes(' @param ')
        ) {
          const additionalParamLineIndexes = [];
          let additionalParamLineIndex = paramLineIndex;
          while(
            contractFileArray[additionalParamLineIndex] &&
            contractFileArray[additionalParamLineIndex].includes('///') &&
            !contractFileArray[additionalParamLineIndex].includes(' @dev ') &&
            !contractFileArray[additionalParamLineIndex].includes(' @param ') &&
            !contractFileArray[additionalParamLineIndex].includes(' @return ')
          ) {
            additionalParamLineIndexes.push(additionalParamLineIndex);
            additionalParamLineIndex += 1;
          }
          let param = contractFileArray[paramLineIndex].split(' @param ')[1];
          additionalParamLineIndexes.forEach(index => {
            param += contractFileArray[index].split('///')[1];
          });
          params.push(param);
        }
        paramLineIndex += 1;
      }
    }

    // Get natspec return params
    if (noticeLineIndex && method.returnParameters) {
      let returnLineIndex = noticeLineIndex + 1;
      while (
        noticeLineIndex + maxLines !== returnLineIndex &&
        returns.length !== method.returnParameters.parameters.length
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
          let returnParam = contractFileArray[returnLineIndex].split(' @return ')[1];
          additionalReturnLineIndexes.forEach(index => {
            returnParam += contractFileArray[index].split('///')[1];
          });
          returns.push(returnParam);
        }
        returnLineIndex += 1;
      }
    }

    methods.push({
      ...method,
      natspec: {
        notice,
        dev,
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
