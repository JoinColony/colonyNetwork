<img align="center" src="./Colony_Header.png" /> 

# The Colony Network
[![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/JoinColony/colonyNetwork)
[![CircleCI](https://circleci.com/gh/JoinColony/colonyNetwork/tree/develop.svg?style=shield&circle-token=3091a867864d55d39aa8f4f552ecb2257376cb0f)](https://circleci.com/gh/JoinColony/colonyNetwork/tree/develop)
[![Greenkeeper badge](https://badges.greenkeeper.io/JoinColony/colonyNetwork.svg?token=12a1f49a1f7f9afa0b0af1370e6a4646c989cba0d90ec0d5b3872cb95c08facc&ts=1505828301742)](https://greenkeeper.io/)

Contracts for running the Colony Network as defined in the [Colony White Paper](https://colony.io/whitepaper.pdf)

## Install
```
git clone https://github.com/JoinColony/colonyNetwork.git
cd colonyNetwork
yarn
git submodule update --init
```

## Contracts
The contract upgradability is using the EtherRouter pattern, see "Token Upgradability" section in https://medium.com/p/3da67d833087 for implementation details.

The `math`, `erc20`, `auth`, `roles` and a significant part of the `token` contract have been reused from the [Dappsys library](https://github.com/dapphub/dappsys-monolithic).

## Testing
To run all tests:
```
yarn run test:contracts
```
To run tests with code coverage using [solidity-coverage](https://github.com/sc-forks/solidity-coverage):
```
yarn run test:contracts:coverage
```
To lint contracts using [Solium](https://github.com/duaraghav8/Solium)
```
yarn run solium
```

To lint JS using `eslint` (this is also a pre-commit hook)
```
yarn run eslint
```

## Contributing
For details about how to contribute you can check the [contributing page](CONTRIBUTING.md)
