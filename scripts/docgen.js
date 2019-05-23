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
    const maxLines = 10;

    // Set the intial value of notice
    let notice;

    // Set the intial value of params
    const params = [];

    // Set the intial value of returnParams
    const returnParams = [];

    // Set the methodLineIndex
    const methodLineIndex = contractFileArray.findIndex(line => {
      return line.includes(`function ${method.name}`)
    });

    // Set the initial value of noticeLineIndex
    let noticeLineIndex = methodLineIndex;

    // Find the noticeLineIndex with a maximum number of lines to check
    while(!contractFileArray[noticeLineIndex].includes( '@notice ')) {
      if (methodLineIndex - maxLines === noticeLineIndex) {
        noticeLineIndex = 0;
        break;
      }
      noticeLineIndex -= 1;
    }

    // Update notice value
    if (noticeLineIndex) {
      notice = contractFileArray[noticeLineIndex].split(' @notice ')[1];
    }

    // Set the initial value of paramLineIndex
    let paramLineIndex = noticeLineIndex;

    if (method.parameters) {
      // Find the params with a maximum number of lines to check
      while (paramLineIndex && params.length !== method.parameters.parameters.length) {
        if (noticeLineIndex + maxLines === paramLineIndex) {
          paramLineIndex = 0;
          break;
        }
        if (contractFileArray[paramLineIndex].includes(' @param ')) {
          params.push(contractFileArray[paramLineIndex].split(' @param ')[1]);
        }
        paramLineIndex += 1;
      }
    }

    // Set the initial value of paramLineIndex
    let returnParamLineIndex = noticeLineIndex;

    if (method.returnParameters) {
      // Find the return params with a maximum number of lines to check
      while (returnParamLineIndex && returnParams.length !== method.returnParameters.parameters.length) {
        if (noticeLineIndex + maxLines === returnParamLineIndex) {
          returnParamLineIndex = 0;
          break;
        }
        if (contractFileArray[returnParamLineIndex].includes(' @return ')) {
          returnParams.push(contractFileArray[returnParamLineIndex].split(' @return ')[1]);
        }
        returnParamLineIndex += 1;
      }
    }

    // Push method to methods array
    methods.push({
      ...method,
      natspec: {
        notice,
        params,
        returnParams,
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

### \`${method.name}\`

${method.natspec.notice ? method.natspec.notice : ''}

${method.parameters && method.parameters.parameters.length ? `

**Parameters**

` + printParams(method.parameters.parameters, method.natspec.params) : ''}

${method.returnParameters && method.returnParameters.parameters.length ? `

**Return Parameters**

` + printParams(method.returnParameters.parameters, method.natspec.returnParams) : ''}

`).join('');

}

function printParams(params, natspecParams) {
  if (params.length) {
    return `
|Name|Type|Description|
|---|---|---|
${params
  .map((param, index) => {
    const noName = '_undefined_';
    const name = param.name ? param.name : noName;
    const type = param.typeName.name;
    const valid = natspecParams[index] && natspecParams[index].substring(0, name.length) === name
    const description = valid ? natspecParams[index].split(name, 2)[1] : '';
    return `|${name}|${type || 'memory' }|${description}`
  })
  .join('\n')}`;
  }
  return '';
}
