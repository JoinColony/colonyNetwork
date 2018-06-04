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

~$ ./node_modules/.bin/truffle migrate
```

For more detailed instructions, and additional steps required to set up an environment for use with colonyJS, refer to the [colonyJS get started doc](/colonyjs/docs-get-started/).
