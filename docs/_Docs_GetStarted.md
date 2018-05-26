---
title: Get Started
section: Docs
order: 2
---

The Colony Network contracts are moving toward being live on `testnet`, but in the mean time you will need to run your own version for testing and development.

## Set Up and Deploy the colonyNetwork contracts

### Install
You'll need the latest versions of all the colonyNetwork contracts ready to deploy:

```
~$ git clone https://github.com/JoinColony/colonyNetwork.git

~$ cd colonyNetwork/

~$ yarn

~$ git submodule update --init
```

This should install all the bare-bones tools and scripts you can use to start testing!

To deploy all contracts and run all tests:
```
~$ yarn run test:contracts

```

Alternatively, you can start a local test node and deploy the contracts yourself (using the locally installed `truffle`):
```
~$ yarn run start:blockchain:client

~$ ./node_modules/.bin/truffle migrate
```

If you're purely interested in the 'on-chain' Solidity implementation of Colony, you can stop here.

Read on if you are using the contracts to develop with colonyJS.

## Configure to work with colonyJS

Instead of using the testing scripts included with colonyNetwork, you may want to install and configure the full version of [Ganache](https://github.com/trufflesuite/ganache). This allows for a nice interface to inspect and manage test accounts, blocks, and more.

You need to change two settings in Ganache to make it work with the colonyNetwork configuration:

* Set your "Port Number" to `8545`
* Under the 'chain' tab, set the "Gas Limit" to `7000000`

After your Ganache instance is running, deploy the colonyNetwork contracts:
```
~$ ./node_modules/.bin/truffle migrate
```

## Install and configure a contract loader like TrufflePig

```
yarn global add trufflepig
```

Start TrufflePig and point it to your Ganache accounts:
```
~$ trufflepig --ganacheKeyFile ganache-accounts.json
```

Once running, TrufflePig will serve the accounts and contracts over http:
```
http://localhost:3030/accounts
```
```
http://localhost:3030/contracts?name=MyContractName
```

See [TrufflePig](https://github.com/JoinColony/trufflepig) for more details setting up TrufflePig.

Refer to the [Loaders](/colonyjs/docs-loaders/) documentation for how to integrate with your colonyJS project.
