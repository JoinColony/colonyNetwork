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

  const contract = ast.children.find(child => child.type === 'ContractDefinition');

  const md = `
  ${templateFileString}
  ${printMethods(contract.subNodes)}
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

${method.parameters && method.parameters.parameters.length ? `

**Parameters**

` + printParams(method.parameters.parameters) : ''}

${method.returnParameters && method.returnParameters.parameters.length ? `

**Return Parameters**

` + printParams(method.returnParameters.parameters) : ''}

`).join('');

}

function printParams(params) {
  if (params && params.length) return `
|Name|Type|
|---|---|---|
${params
  .map(param => `|${param.name}|${param.typeName.name}|`)
  .join('\n')}`;
}
