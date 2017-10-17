# Colony Network contracts
## Install

[![Greenkeeper badge](https://badges.greenkeeper.io/JoinColony/colonyNetwork.svg?token=12a1f49a1f7f9afa0b0af1370e6a4646c989cba0d90ec0d5b3872cb95c08facc&ts=1505828301742)](https://greenkeeper.io/)

```
git clone https://github.com/JoinColony/colonyNetwork.git
yarn
yarn global add gulp@3.9.1
git submodule update
```

## Contracts
The contract upgradability is using the EtherRouter pattern, see "Token Upgradability" section in https://medium.com/p/3da67d833087 for implementation details.

The `math`, `erc20`, `auth`, `roles` and a significant part of the `token` contract have been reused from the [Dappsys library](https://github.com/dapphub/dappsys-monolithic).

## Testing
Run `gulp help` for a list of all checks. Prominent ones being:

To run all tests:
```
gulp test:contracts
```
To run tests with code coverage using [solidity-coverage](https://github.com/sc-forks/solidity-coverage):
```
gulp test:contracts:coverage
```
To lint contracts using [Solium](https://github.com/duaraghav8/Solium)
```
gulp lint:contracts
```

## Branch structure
Current Colony Beta product is integrated in `master` branch, which is used in `colonyDapp` repo. 
The new release implementing the whitepaper is integrated in `develop` branch. 
Changes in `master` are not necessarity reverse integrated in `develop` as contract architecture will potentially differ significantly.
