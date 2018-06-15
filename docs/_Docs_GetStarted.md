---
title: Get Started
section: Docs
order: 2
---

The Colony Network contracts are moving toward being live on `testnet`, but in the mean time you will need to run your own version for testing and development.

## Set Up and Deploy the colonyNetwork contracts

### Install
See the colonyNetwork [README.md](https://github.com/JoinColony/colonyNetwork#install) for detailed instructions.

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

~$ ./node_modules/.bin/truffle migrate --reset --compile-all
```

For more detailed instructions, and additional steps required to set up an environment for use with colonyJS, refer to the [colonyJS get started doc](/colonyjs/docs-get-started/).

## Set Up Reputation Mining for Local Testing

The Reputation Mining client is usable for testing, but has a limited functionality. It currently has no support for the challenge-response process to accommodate multiple submitted Reputation Root Hashes. Still, it is possible to run a single miner instance for usable reputation scores on a testnet.

### Start the Mining Client

Start the mining client with:

```
node packages/reputation-miner/bin/index.js --file ./reputations.json --colonyNetworkAddress 0x76d508fa65654654ffdb334a3023353587112e09 --minerAddress 0xb77d57f4959eafa0339424b83fcfaf9c15407461
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
