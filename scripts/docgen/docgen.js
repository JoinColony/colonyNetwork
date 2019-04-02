#!/usr/bin/env node
/* eslint-disable */

const fs = require('fs');
const path = require('path');

const INTERFACES = [
  {
    file: path.resolve(__dirname, '..', '..', 'contracts', 'IColony.sol'),
    templateFile: path.resolve(__dirname, '.', '_API_Colony.template.md'),
    output: path.resolve(__dirname, '..', '..', 'docs', '_API_Colony.md'),
  },
  {
    file: path.resolve(__dirname, '..', '..', 'contracts', 'IColonyNetwork.sol'),
    templateFile: path.resolve(__dirname, '.', '_API_ColonyNetwork.template.md'),
    output: path.resolve(__dirname, '..', '..', 'docs', '_API_ColonyNetwork.md'),
  },
  {
    file: path.resolve(__dirname, '..', '..', 'contracts', 'IMetaColony.sol'),
    templateFile: path.resolve(__dirname, '.', '_API_MetaColony.template.md'),
    output: path.resolve(__dirname, '..', '..', 'docs', '_API_MetaColony.md'),
  },
  {
    file: path.resolve(__dirname, '..', '..', 'contracts', 'IReputationMiningCycle.sol'),
    templateFile: path.resolve(__dirname, '.', '_API_ReputationMiningCycle.template.md'),
    output: path.resolve(__dirname, '..', '..', 'docs', '_API_ReputationMiningCycle.md'),
  },
];

const generateMarkdown = ({ file, templateFile, output }) => {

  const template = fs.readFileSync(templateFile).toString();
  const printInterface = fs.readFileSync(file).toString();

// TODO: This is where the solidity parser code would live.
// The long term goal here is to get a parser to pull out the relevant
// information or comments so that we can categorize and sort functions
// in the colonyNetwork interfaces, and present them in a better way than just
// a big block of solidity. 

  const md = `
 ${template}
 \`\`\`javascript
 ${printInterface}
 \`\`\`
 `.trim();

  fs.writeFileSync(output, md);
};


INTERFACES.forEach(generateMarkdown);
