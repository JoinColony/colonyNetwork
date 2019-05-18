---
title: Get Started
section: Docs
order: 7
---

There are a few ways to get started with the colonyNetwork contracts, depending on who you are and what you want to do.

This page details how to engage purely on the contract-level, and is intended more for developers looking to contribute new features, extensions, or contract-level integrations. See our [guidelines](https://github.com/JoinColony/colonyNetwork/blob/develop/docs/CONTRIBUTING.md) if you're interested in contributing to the colonyNetwork codebase.

If you're a dapp developer looking to integrate with colony, we recommend using [colonyJS](/colonyjs/intro-welcome/) as an entry point. There you'll find analogous instructions better suited to building applications on top of the colonyNetwork. For those without patience, we have built a [colonyStarter kit](/colonystarter/docs-overview/) which contains boilerplate examples for dapp development, including frontend frameworks like react, and is the fastest way to start building with Colony.

Either way, if you run into trouble or have any questions/comments, please post in our [developer forums](https://build.colony.io/).

==TOC==

## Prerequisites

### Node

You will need to have `node` installed. We recommended using `node` version `10.12.0`. An easy solution for managing `node` versions is `nvm`. If you do not have `node` installed, check out [Download Node](https://nodejs.org/en/download/) or [Node Package Manager](https://github.com/creationix/nvm).

### Yarn

You will also need to install `yarn`. We recommended using `yarn` version `1.12.0` or higher. Check out the [Yarn Installation](https://yarnpkg.com/lang/en/docs/install/#mac-stable) documentation and then select your operating system for install instructions.

It is possible to use `npm` instead of `yarn`, but you'll need to adapt any instructions yourself ;).

### Docker

In order to compile the colonyNetwork smart contracts, you will need to have Docker installed and running. We recommend using Docker Community Version `2.0.0.0`. You can find instructions for installing Docker here: [Docker Installation](https://docs.docker.com/install/).

The colonyNetwork smart contracts require the `ethereum/solc:0.5.6` Docker image, so we will need to pull it down before we can begin.

Make sure Docker is installed and then run the following command.

```
docker pull ethereum/solc:0.5.6
```

## Colony Network

If you intend to work with `glider-rc.1` on the Görli testnet, proceed with installation below, skipping the "local development and testing" section.


### Installation

For testing and development, we will set up a local test network and then deploy the [colonyNetwork](https://github.com/JoinColony/colonyNetwork) smart contracts to that local test network.

The first order of business will be pulling down the colonyNetwork repository, which includes some simple script commands that will help us get the colonyNetwork smart contracts set up and ready for testing and development.

In the working directory of your choice, clone the latest version of the colonyNetwork repository.

```
git clone https://github.com/JoinColony/colonyNetwork.git
```

Next, we will need to move into the colonyNetwork directory and run `yarn` to install the required node packages.

```
cd colonyNetwork && yarn
```

The colonyNetwork repository includes a few submodules, so we will need to add them to our project and make sure we are using the version defined in the colonyNetwork repository index.

```
git submodule update --init
```

The final step for installation is copying over some of the files from our submodules into our build directory, which we made easy for you with a simple script command.

```
yarn run provision:token:contracts
```

## `glider-rc.1` on the Görli testnet

The [Glider release candidate](/colonynetwork/docs-releases/) is in many ways a simpler and easier way to experiment than setting up a local development environment, and can be very useful if you're looking to just get a sense of how the colonyNetwork contracts work, or want to build extensions/integrations that remain inside the EVM.

To connect, you'll need to know the address of the colonyNetwork (which is, in reality, the address of the `etherRouter` contract; see [The Delegate Proxy Pattern](/colonynetwork/docs-the-delegate-proxy-pattern/) for more info).

`ColonyNetwork`: `0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B`

You will also require Görli test ETH, and a deployed ERC20 token to import.


### Access with Remix (good for experimenting)

For simple interactions, [Remix](http://remix-alpha.ethereum.org/) is a good lightweight way to call specific functions and get network information from the contracts.

Rather than import the entire set of contracts into remix, use the included `solidity-steamroller` to flatten the needed interface contracts to the `build/flattened/` directory:

```
$ yarn flatten:contracts
```

Alternatively, you can put them into the directory of your choice, e.g. `~/Downloads/`:
```
$ yarn steamroller /contracts/IColonyNetwork.sol > ~/Downloads/flatIColonyNetwork.sol
```

Import the flattened contract into the remix IDE, and then call `createColony()`

### Access with the Truffle console

First, add a private key of your choice to the `truffle.js` configuration file:
```
goerli: {
      provider: () => {
        return new HDWalletProvider("replace-with-private-key-when-using", "https://goerli.infura.io/v3/e21146aa267845a2b7b4da025178196d");
      },
      network_id: "5"
    }
  },
```

Then, start up the truffle console and connect to testnet:
```
$ yarn truffle console --network goerli
```
In the truffle console, instantiate the IColonyNetwork interface for `glider-rc.1`:
```
truffle(goerli)> let IColonyNetwork = await IColonyNetwork.at("0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B")

```
From here, you can create a new colony (with an ERC20 token already deployed):
```
truffle(goerli)> IColonyNetwork.createColony("your-erc20-token-address")
```
And find your colony's id (the newest created colony) after the transaction is mined:
```

truffle(goerli)> IColonyNetwork.getColonyCount()
```
### Local Development and Testing

You can start a local test node and deploy the contracts yourself using the locally installed `truffle` package.

```
yarn run start:blockchain:client

./node_modules/.bin/truffle migrate --reset --compile-all
```

To deploy all contracts and run all tests, run the following command.

```
yarn run test:contracts
```

For more detailed instructions, and additional steps required to set up an environment for use with [colonyJS](https://github.com/JoinColony/colonyJS), check out the colonyJS [Local Setup](/colonyjs/intro-local-setup/) documentation.
