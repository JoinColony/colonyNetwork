<div align="center">
  <img src="/docs/img/colonyNetwork_color.svg" width="600" />
</div>
<div align="center">
  <a href="https://circleci.com/gh/JoinColony/colonyNetwork">
    <img src="https://circleci.com/gh/JoinColony/colonyNetwork.svg?style=shield" />
  </a>
  <a href="https://greenkeeper.io/">
    <img src="https://badges.greenkeeper.io/JoinColony/colonyNetwork.svg" />
  </a>
  <a href="https://gitter.im/JoinColony/colonyNetwork">
    <img src="https://img.shields.io/gitter/room/TechnologyAdvice/Stardust.svg" />
  </a>
  <a href="https://build.colony.io/">
    <img src="https://img.shields.io/discourse/https/build.colony.io/status.svg" />
  </a>
</div>

# The Colony Network

Contracts for running the Colony Network as defined in the [Colony White Paper](https://colony.io/whitepaper.pdf)

## Bug Bounty Program
Colony is offering substantial rewards to external developers who report bugs and flaws in the colonyNetwork contracts.

See the [Bug Bounty program overview](./_bug_rules.md) for more information about bounties, rules, and terms.

## Install
```
git clone https://github.com/JoinColony/colonyNetwork.git
cd colonyNetwork
yarn
git submodule update --init
yarn run provision:token:contracts
```

## Contracts
The contract upgradability is using the EtherRouter pattern, see [Upgrades to the Colony Network](https://joincolony.github.io/colonynetwork/docs-upgrades-to-the-colony-network/) in the documentation for implementation details.

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
