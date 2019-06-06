---
title: Reputation Mining Client
section: Docs
order: 5
---

## Running the Mining Client

To participate in the reputation mining process you need to have staked at least the [minimum amount of CLNY Tokens](/colonynetwork/interface-ireputationminingcycle#getminstake), for at least [one full mining cycle duration](/colonynetwork/interface-ireputationminingcycle#getminingwindowduration) before you can submit a new reputation root hash.

The reputation mining client can be run locally using the following command and arguments:

`node packages/reputation-miner/bin/index.js`

Available arguments are:

`--minerAddress`

Mandatory to provide either `--minerAddress` or `--privateKey`.

Address of the miner account which the client will send reputation mining contract transactions from. Used when working with an unlocked account for the miner against **development networks only**. We provision twelve unlocked test accounts stored in `ganache-accounts.json` for testing that are available when starting a local ganache-cli instance via `yarn run start:blockchain:client` command.

`--privateKey`

Mandatory to provide either `--minerAddress` or `--privateKey`.

Private key of the miner account which the client will sign reputation mining contract transactions with.

`--colonyNetworkAddress`

Mandatory

The address of the Colony Network's `EtherRouter`. See [Upgrades to the Colony Network](/colonynetwork/docs-upgrade-design/) for more information about the EtherRouter design pattern. This address is static on `goerli` and `mainnet`
`goerli` `0x79073fc2117dD054FCEdaCad1E7018C9CbE3ec0B`
`mainnet` `TBD`

`--dbPath` 

Optional

Path for the sqlite database storing reputation state. Default is `./reputationStates.sqlite`.

`--network`

Optional

Used for connecting to a supported Infura node (instead of a local client). Valid options are `goerli` and `mainnet`.

`--localPort`

Optional

Used to connect to a local clinet running on the specified port. Default is `8545`.

`--syncFrom`

Mandatory 

Block number to start reputation state sync from. This is the block at which the reputation mining process was initialised.
This number is static on `goerli` and `mainnet`
`goerli` `548534`
`mainnet` `TBD`

Note that beginning the sync with a too-early block will result in an error. If you get this exception, try increasing the block number you are syncing from.

Note that the sync process can take long. Latest tests syncing a client from scratch to 28 reputation cycles took ~2 hours.

`--auto` 

Optional

Default is `true`

Participate in the mining process automatically. Including proposing a new hash at the first possible block times it is allowed and up to the maximum of 12 submissions (or the number it is allowed to make based on the miner stake of CLNY).
Responding to challenges in the dispute resolution process when there are disagreeing submissions. And finally confirming the last hash after the mining window closes and any disputes have been resolved.

Reputation mining protocol details can be found in the [Whitepaper TLDR](/colonynetwork/whitepaper-tldr-reputation-mining#submissions)

## Visualizations

The reputation mining client comes with a set of built-in visualizers to make it easier to view reputation states and to see the current state of the mining process. Once a mining client is running and connected to a network, navigate to the client's address in a browser (i.e. `http://localhost:3000/`) to access the available visualization tools.

### Force Reputation Updates

The client is set to provide a reputation update once every 24 hours. For testing, you'll likely want to "fast-forward" your network through a few submissions to see usable reputation.

You can move the network forward by 24 hours with the following command.

```
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[86400],"id": 1}' localhost:8545
```

Once you have moved the network forward 24 hours, you can then mine a new block with the following command.

```
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_mine","params":[]}' localhost:8545
```

Note that because reputation is awarded for the *previous* submission window, you will need to use the "fast-forward" command above to speed through at least 2 reputation updates before noticing a change in the miner's reputation.

## Get Reputation from the Reputation Oracle

The reputation mining client will answer queries for reputation scores locally over HTTP.

```
http://127.0.0.1:3000/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

The oracle should be able to provide responses to any valid reputation score in all historical states, as well as the current state.

For example, you can get the reputation score of the miner in the current reputation state (which after three updates, will be `0x7ad8c25e960b823336fea83f761f5199d690c7b230e846eb29a359187943eb33`) using the address of the Meta Colony (`0x1133560dB4AebBebC712d4273C8e3137f58c3A65`), the skill tag of `2`, and the address of the miner (`0x3a965407ced5e62c5ad71de491ce7b23da5331a4`).

```
http://127.0.0.1:3000/0x7ad8c25e960b823336fea83f761f5199d690c7b230e846eb29a359187943eb33/0x1133560dB4AebBebC712d4273C8e3137f58c3A65/2/0x3a965407ced5e62c5ad71de491ce7b23da5331a4
```

The oracle should return something similar to the following.

```
{"branchMask":"0x8000000000000000000000000000000000000000000000000000000000000000","siblings":["0x32c047a86aec6bbbfc1510bb2dd3a9086ec70b7524bd6f92ce1a12dfc7be32ca"],"key":"0x1133560db4aebbebc712d4273c8e3137f58c3a6500000000000000000000000000000000000000000000000000000000000000023a965407ced5e62c5ad71de491ce7b23da5331a4","value":"0x0000000000000000000000000000000000000000000000410d586a20a4c000000000000000000000000000000000000000000000000000000000000000000003","reputationAmount":"0"}
```
