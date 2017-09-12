const assert = require('assert');

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
  async setupColonyVersionResolver (colony, resolver, colonyNetwork) {
    await resolver.register("token()", colony.address, 32);
    await resolver.register("version()", colony.address, 32);
    await resolver.register("taskCount()", colony.address, 32);
    await resolver.register("reservedTokens()", colony.address, 32);
    await resolver.register("setToken(address)", colony.address, 0);
    await resolver.register("getTask(uint256)", colony.address, 192);
    await resolver.register("makeTask(bytes32)", colony.address, 0);
    await resolver.register("updateTaskIpfsDecodedHash(uint256,bytes32)", colony.address, 0);
    await resolver.register("acceptTask(uint256)", colony.address, 0);
    await resolver.register("contributeEthToTask(uint256)", colony.address, 0);
    await resolver.register("contributeTokensToTask(uint256,uint256)", colony.address, 0);
    await resolver.register("setReservedTokensForTask(uint256,uint256)", colony.address, 0);
    await resolver.register("removeReservedTokensForTask(uint256)", colony.address, 0);
    await resolver.register("completeAndPayTask(uint256,address)", colony.address, 0);
    await resolver.register("mintTokens(uint128)", colony.address, 0);

    // Validate Colony functions are registered
    let response = await resolver.lookup.call('0xfc0c546a'); // token
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x54fd4d50'); // version
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0xb6cb58a5'); // taskCount
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x15a55347'); // reservedTokens
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 32);
    response = await resolver.lookup.call('0x144fa6d7'); // setToken
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x1d65e77e'); // getTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 192);
    response = await resolver.lookup.call('0x560c6d92'); // makeTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x2665c808'); // updateTaskIpfsDecodedHash
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x1bf6912d'); // acceptTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x7852661'); // contributeEthToTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0xfe809756'); // contributeTokensToTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0xa59792f7'); // setReservedTokensForTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0xf93ab663'); // removeReservedTokensForTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x2f6da7bb'); // completeAndPayTask
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);
    response = await resolver.lookup.call('0x5ab75c42'); // mintTokens
    assert.equal(response[0], colony.address);
    assert.equal(response[1], 0);

    const version = await colony.version.call();
    await colonyNetwork.addColonyVersion(version.toNumber(), resolver.address);
    const currentColonyVersion = await colonyNetwork.currentColonyVersion.call();
    assert.equal(version, currentColonyVersion.toNumber());
  },
  async setupUpgradableColonyNetwork (colony, resolver, colonyNetwork) {
  }
};
