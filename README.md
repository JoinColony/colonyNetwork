# .github

![](https://raw.githubusercontent.com/JoinColony/brand/v1.0.0/logo\_network.svg)

[![](https://circleci.com/gh/JoinColony/colonyNetwork.svg?style=shield) ](https://circleci.com/gh/JoinColony/colonyNetwork)[![](https://badges.greenkeeper.io/JoinColony/colonyNetwork.svg) ](https://greenkeeper.io/)[![](https://img.shields.io/gitter/room/TechnologyAdvice/Stardust.svg) ](https://gitter.im/JoinColony/colonyNetwork)[![](https://img.shields.io/discourse/https/build.colony.io/status.svg)](https://build.colony.io/)

## The Colony Network

Contracts for running the Colony Network as defined in the [Colony White Paper](https://colony.io/whitepaper.pdf)

### Bug Bounty Program

Colony is offering substantial rewards to external developers who report bugs and flaws in the colonyNetwork contracts.

See the [Bug Bounty program overview](.github/\_bug\_rules.md) for more information about bounties, rules, and terms.

### Prerequisites

`node` v16.15.x (we recommend using [`nvm`](https://github.com/nvm-sh/nvm))

`docker` v18 or higher

Add the required solidity compiler by running:

```
$ docker pull ethereum/solc:0.5.8
```

### Installation

In the working directory of your choice, clone the latest version of the colonyNetwork repository:

```
$ git clone https://github.com/JoinColony/colonyNetwork.git
```

Move into the directory and install dependencies:

```
$ cd colonyNetwork && npm install
```

Update submodule libraries:

```
$ git submodule update --init
```

Provision token contracts for testing:

```
$ npm run provision:token:contracts
```

### Contracts

The contract upgradability is using the EtherRouter pattern, see [the delegate proxy pattern](https://docs.colony.io/colonynetwork/docs-upgrade-design/) in the documentation for implementation details.

The `math`, `erc20`, `auth`, `roles` and a significant part of the `token` contract have been reused from the [Dappsys library](https://github.com/dapphub/dappsys-monolithic).

#### Local Development and Testing

You can start a local test node and deploy the contracts yourself using the locally installed `truffle` package.

```
npm run start:blockchain:client

npx truffle migrate --reset --compile-all
```

To deploy all contracts and run all contract tests:

```
npm run test:contracts
```

To deploy all contracts and run all reputation mining tests:

```
npm run test:reputation
```

To run tests with code coverage using [solidity-coverage](https://github.com/sc-forks/solidity-coverage):

```
npm run test:contracts:coverage
```

To lint contracts using [Solium](https://github.com/duaraghav8/Solium)

```
npm run solium
```

To lint JS using `eslint` (this is also a pre-commit hook)

```
npm run eslint
```

### Contributing

For details about how to contribute you can check the [contributing page](.github/CONTRIBUTING.md)
