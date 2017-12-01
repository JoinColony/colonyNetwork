const assert = require('assert');
const fs = require('fs');
import sha3 from 'solidity-sha3';

module.exports = {
  async setupUpgradableToken (token, resolver, etherRouter) {
    // Register ERC20Extended functions
    await resolver.register("symbol", token.address, 32);
    await resolver.register("decimals", token.address, 32);
    await resolver.register("name", token.address, 32);
    await resolver.register("totalSupply()", token.address, 32);
    await resolver.register("balanceOf(address)", token.address, 32);
    await resolver.register("allowance(address,address)", token.address, 32);
    await resolver.register("transfer(address,uint256)", token.address, 32);
    await resolver.register("transferFrom(address,address,uint256)", token.address, 32);
    await resolver.register("approve(address,uint256)", token.address, 32);
    await resolver.register("mint(uint128)", token.address, 0);

    // Validate ERC20Extended functions are registered
    let response = await resolver.lookup.call('0xbe16b05c'); // symbol
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x784c4fb1'); // decimals
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x784c4fb1'); // name
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x18160ddd'); // totalSupply
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x70a08231'); // balanceOf
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0xdd62ed3e'); // allowance
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0xa9059cbb'); // transfer
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x23b872dd'); // transferFrom
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x095ea7b3'); // approve
    assert.equal(response[0], token.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x69d3e20e'); // mint
    assert.equal(response[0], token.address);
    assert.equal(response[1], 0);

    await etherRouter.setResolver(resolver.address);
    const _registeredResolver = await etherRouter.resolver.call();
    assert.equal(_registeredResolver, resolver.address);
  },
  async setupColonyVersionResolver (colony, colonyTask, colonyFunding, colonyTransactionReviewer, resolver, colonyNetwork) {
    const deployedImplementations = {};
    deployedImplementations['Colony'] = colony.address;
    deployedImplementations['ColonyTask'] = colonyTask.address;
    deployedImplementations['ColonyFunding'] = colonyFunding.address;
    deployedImplementations['ColonyTransactionReviewer'] = colonyTransactionReviewer.address;

    let functionsToResolve = {};

    // Load IColony ABI
    const iColonyAbi = JSON.parse(fs.readFileSync('./build/contracts/IColony.json', 'utf8')).abi;
    iColonyAbi.map( (value, index) => {
        let fName = value.name;
        if (fName==='authority' || fName === 'owner') { return; } //These are from DSAuth, and so are on EtherRouter itself without any more help.
        let fInputs = value.inputs.map(parameter => parameter.type) // Gets the types of the parameters, which is all we care about for function signatures.
        let fOutputSize = value.outputs.length * 32;
        // Record function name and how much data is returned
        functionsToResolve[fName] = {inputs: fInputs, outputSize: fOutputSize, definedIn: ""}
    })

    function parseImplementation(contractName){
        const abi = JSON.parse(fs.readFileSync('./build/contracts/' + contractName + '.json')).abi
        abi.map( (value, index) => {
            let fName = value.name;
            if (functionsToResolve[fName]){
                if (functionsToResolve[fName].definedIn !== ''){
                    // It's a Friday afternoon, and I can't be bothered to deal with same name, different signature. Let's just resolve to not do it? We'd probably just
                    // trip ourselves up later.
                    console.log('What are you doing defining functions with the same name in different files!? You are going to do yourself a mischief. You seem to have two ', fName, ' in ', contractName, 'and ', functionsToResolve[fName].definedIn)
                    process.exit(1);
                }
                functionsToResolve[fName].definedIn = deployedImplementations[contractName];
            }
        })
    }
    parseImplementation('Colony')
    parseImplementation('ColonyTask')
    parseImplementation('ColonyFunding')
    parseImplementation('ColonyTransactionReviewer')

    // Go through Colony, ColonyFunding, ColonyTask, ColonyTransactionReviewer to find where these functions are defined
    let promises = Object.keys(functionsToResolve).map( async function(fName) {
        const sig = fName + '(' + functionsToResolve[fName].inputs.join(',') + ')';
        const address = functionsToResolve[fName].definedIn;
        const outputSize = functionsToResolve[fName].outputSize;
        const sigHash = sha3(sig).substr(0,10);
        await resolver.register(sig,address, outputSize);
        let response = await resolver.lookup.call(sigHash)
        assert.equal(response[0], address);
        assert.equal(response[1], outputSize);
    })
    await Promise.all(promises);


    const version = await colony.version.call();
    await colonyNetwork.addColonyVersion(version.toNumber(), resolver.address);
    const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
    assert.equal(version, currentColonyVersion.toNumber());
  },
  async setupUpgradableColonyNetwork (etherRouter, resolver, colonyNetwork) {
    await resolver.register("colonyCount()", colonyNetwork.address, 32);
    await resolver.register("currentColonyVersion()", colonyNetwork.address, 32);
    await resolver.register("colonyVersionResolver(uint256)", colonyNetwork.address, 32);
    await resolver.register("skills(uint256)", colonyNetwork.address, 128);
    await resolver.register("skillCount()", colonyNetwork.address, 32);
    await resolver.register("createColony(bytes32)", colonyNetwork.address, 0);
    await resolver.register("addColonyVersion(uint256,address)", colonyNetwork.address, 0);
    await resolver.register("getColony(bytes32)", colonyNetwork.address, 32);
    await resolver.register("getColonyAt(uint256)", colonyNetwork.address, 32);
    await resolver.register("upgradeColony(bytes32,uint256)", colonyNetwork.address, 0);
    await resolver.register("addSkill(uint256)", colonyNetwork.address, 0);
    await resolver.register("getParentSkillId(uint256,uint256)", colonyNetwork.address, 32);
    await resolver.register("getChildSkillId(uint256,uint256)", colonyNetwork.address, 32);
    await resolver.register("appendReputationUpdateLog(address,int256,uint256)", colonyNetwork.address, 0);
    await resolver.register("ReputationUpdateLog(uint256)", colonyNetwork.address, 192);
    await resolver.register("getReputationUpdateLogLength()", colonyNetwork.address, 32);

    // Validate ColonyNetwork functions are registered
    let response = await resolver.lookup.call('0xe40c6c91'); // colonyCount
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0xbc70e3dd'); // currentColonyVersion
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0xa33e5bd8'); // colonyVersionResolver
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x50d15fbe'); // skills
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 128);
    response = await resolver.lookup.call('0xb82c1b4a'); // skillCount
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x754b0031'); // createColony
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0xf07eb921'); // addColonyVersion
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x5a1022f2'); // getColony
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x6e73bbca'); // getColonyAt
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x724d685a'); // upgrade
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x162419cc'); // addSkill
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0xd987fc16'); // getParentSkillId
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x09d10a5e'); // getChildSkillId
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x5a8adafa'); // appendReputationUpdateLog(address,uint256,uint256)
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x5edde7e7'); // ReputationUpdateLog(uint256)
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 192);
    response = await resolver.lookup.call('0x89765977'); // getReputationUpdateLogLength()
    assert.equal(response[0], colonyNetwork.address);
    assert.equal(response[1], 32);

    await etherRouter.setResolver(resolver.address);
  }
};
