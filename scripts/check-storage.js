import parser from 'solidity-parser-antlr';
const fs = require('fs');

import shell from 'pshell';


fs.readdirSync('./contracts/').forEach(contractName => {
	if (['Authority.sol', 'ColonyNetwork.sol', 'ColonyStorage.sol', 'EtherRouter.sol', 'Migrations.sol', 'Resolver.sol', 'Token.sol'].indexOf(contractName)>-1){
		return;
	}
	const src = fs.readFileSync('./contracts/' + contractName, 'utf8');
	// Check for storage variables.
	let result = parser.parse(src, {tolerant:true})
	let contract = result.children.filter( child => child.type === 'ContractDefinition' )[0]; //Filters out an unknown number of 'pragmas' that we have.
	if (contract.subNodes.filter( child => child.type === 'StateVariableDeclaration').length > 0){
		console.log('The contract ', contractName, ' contains state variable declarations. Add new state variables to ColonyStorage instead to guarantee that the storage layout is the same between contracts.')
		process.exit(1);
	}
})
