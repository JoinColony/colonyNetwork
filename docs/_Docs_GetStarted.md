---
title: Get Started
section: Docs
order: 2
---

The [colonyNetwork](https://github.com/JoinColony/colonyNetwork) smart contracts are currently live on `rinkeby` and will soon be live on `mainnet` but the best way to get started is to run your own version on a local network for testing and development.

## Prerequisites

First of all, we will need to make sure we have all the necessary prerequisites.

### Node

You will need to have `node` installed. We recommended using `node` version `10.12.0`. An easy solution for managing `node` versions is `nvm`. If you do not have `node` installed, check out [Download Node](https://nodejs.org/en/download/) or [Node Package Manager](https://github.com/creationix/nvm).

*Note: You will need a JavaScript environment that supports `async`/`await`, since colonyJS uses promises extensively. Recent versions of `node` support promises out of the box, but when you start building beyond the example provided here, you may want to consider using [Webpack](https://webpack.js.org/) and [Babel](https://babeljs.io/) for better support.*

### Yarn

You will also need to install `yarn`. We recommended using `yarn` version `1.12.0` or higher. Check out the [Yarn Installation](https://yarnpkg.com/lang/en/docs/install/#mac-stable) documentation and then select your operating system for install instructions.

### Docker

In order to compile the colonyNetwork smart contracts, you will need to have Docker installed and running. We recommend using Docker Community Version `2.0.0.0`. You can find instructions for installing Docker here: [Docker Installation](https://docs.docker.com/install/).

The colonyNetwork smart contracts require the `ethereum/solc:0.4.23` Docker image, so we will need to pull down this image before we can begin. Make sure Docker is installed and run the following command:

```
docker pull ethereum/solc:0.4.23
```

## Colony Network

### Installation

For testing and development, we will set up a local test network and then deploy the [colonyNetwork](https://github.com/JoinColony/colonyNetwork) smart contracts to that local test network.

The first order of business will be pulling down the colonyNetwork repository, which includes some simple commands that will help us get the colonyNetwork smart contracts set up and ready for testing.

In the working directory of your choice, clone the latest version of the colonyNetwork repository:

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

This should install all the bare-bones tools and scripts you can use to start testing!

### Testing

To deploy all contracts and run all tests:

```
yarn run test:contracts
```

### Development

Alternatively, you can start a local test node and deploy the contracts yourself (using the locally installed `truffle` package):

```
yarn run start:blockchain:client

./node_modules/.bin/truffle migrate --reset --compile-all
```

For more detailed instructions, and additional steps required to set up an environment for use with [colonyJS](https://github.com/JoinColony/colonyJS), check out the colonyJS [Get Started](/colonyjs/docs-get-started/) documentation.

## Reputation Miner

The Reputation Mining client is usable for testing, but has limited functionality. It currently has no support for the challenge-response process to accommodate multiple submitted reputation root hashes. Still, it is possible to run a single miner instance for usable reputation scores on a local test network.

### Start Mining Client

You can start the mining client using the following command:

```
node packages/reputation-miner/bin/index.js --file ./reputations.json --colonyNetworkAddress 0xDF0F615d9548a5edc2377BB9CD88b81a846DfBC5 --minerAddress 0xb77d57f4959eafa0339424b83fcfaf9c15407461
```

The `minerAddress` in the execution above is the first account in `ganache-accounts.json`.

The `colonyNetwork` address in the execution above is not the address outputted at contract deployment, but is the address of the Colony Network `EtherRouter`. See [Upgrades to the Colony Network](/colonynetwork/docs-upgrades-to-the-colony-network/) for more information about the EtherRouter design pattern.


### Force Reputation Updates

The client is set to provide a reputation update once per hour. For testing, you'll likely want to 'fast-forward' your network through a few submissions to see usable reputation.

Move the network forward by an hour with:

```
$ curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[3600],"id": 1}' localhost:8545
```

And mine a new block:

```
$ curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_mine","params":[]}' localhost:8545
```

Note that because reputation is awarded for the *previous* submission window, you will need to use the 'fast-forward' commands above to speed through at least 3 reputation updates before noticing a change in the miner's reputation.

### Get Reputation from the Reputation Oracle

The mining client will answer queries for Reputation scores locally over HTTP:

```
http://127.0.0.1:3000/{colonyAddress}/{skillId}/{userAddress}
```

For example, you can get the reputation score of the miner using the address of the Meta Colony (`0xdb8fe93a3a9c97f04f5c862f52a84f992bd331df`), the skill tag of `0`, and the address of the miner (0xb77d57f4959eafa0339424b83fcfaf9c15407461):

```
http://127.0.0.1:3000/0xdb8fe93a3a9c97f04f5c862f52a84f992bd331df/0/0xb77d57f4959eafa0339424b83fcfaf9c15407461
```

The oracle should return something like this:

```
{"branchMask":"0x00","siblings":[],"key":"0xdb8fe93a3a9c97f04f5c862f52a84f992bd331df0000000000000000000000000000000000000000000000000000000000000000b77d57f4959eafa0339424b83fcfaf9c15407461","value":"0x0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000001","reputationAmount":"1000000000000000000"}
```
