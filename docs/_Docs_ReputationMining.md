---
title: Reputation Mining Client
section: Docs
order: 6
---

## Goerli Testnet

You can start the reputation mining client against the Goerli testnet using the following command:

```
node ./packages/reputation-miner/bin/index.js --network goerli --colonyNetworkAddress 0x79073fc2117dD054FCEdaCad
1E7018C9CbE3ec0B --privateKey { YOUR_PRIVATE_KEY }
```

The miner will begin to sync from scratch. To sync from a specific block number, add the `--syncFrom { BLOCK_NO }` flag.

## Local Network

### Start Mining Client

You can start the reputation mining client against a local chain using the following command:

```
node packages/reputation-miner/bin/index.js --colonyNetworkAddress { COLONYNETWORK_ADDRESS } --minerAddress { MINER_ADDRESS }
```

The `minerAddress` in the execution above is the sixth account in `ganache-accounts.json` if running locally using the default migrations.

The `colonyNetwork` address in the execution above is not the address outputted at contract deployment, but is the address of the Colony Network `EtherRouter`. See [Upgrades to the Colony Network](/colonynetwork/docs-the-delegate-proxy-pattern/) for more information about the EtherRouter design pattern.

### Force Reputation Updates

The client is set to provide a reputation update once every 24 hours. For testing, you'll likely want to "fast-forward" your network through a few submissions to see usable reputation.

You can move the network forward by an hour with the following command.

```
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[86400],"id": 1}' localhost:8545
```

Once you have moved the network forward by an hour, you can then mine a new block with the following command.

```
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_mine","params":[]}' localhost:8545
```

Note that because reputation is awarded for the *previous* submission window, you will need to use the "fast-forward" command above to speed through at least 3 reputation updates before noticing a change in the miner's reputation.

### Get Reputation from the Reputation Oracle

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

## Visualizations

The reputation mining client comes with a set of built-in visualizers to make it easier to view reputation states and to see the current state of the mining process. Once a mining client is running and connected to a network, navigate to the client's address in a browser (i.e. `http://localhost:3000/`) to access the available visualization tools.
