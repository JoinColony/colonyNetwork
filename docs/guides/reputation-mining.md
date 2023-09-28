---
description: A guide on how to set up a reputation miner
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Reputation Mining

## Introduction

Colony's reputation system is key to its functionality, and in order to work successfully, with decays being calculated and new reputation being awarded as appropriate, it relies on the reputation 'mining' process. Any user with sufficient CLNY can stake that CLNY to participate in the process. This guide is intended to provide information for a (sufficiently technical) user who wishes to do so. For more information on the concept of Reputation Mining, please see [this document](../tldr/reputation-mining.md).

## Getting started with Reputation Mining

### A. Staking and awarding appropriate permissions on-chain

To participate in the reputation mining process you need to have staked at least the minimum amount of CLNY Tokens (currently 2000 CLNY), for at least one full mining cycle duration (currently 60 minutes) before you can submit a new reputation root hash. The stake can be slashed if malicious behavior is detected.

Optionally, you can define an Ethreum address to delegate the mining to. In this way the address that is mining doesn't need to be the one that is staking (as the private key needs to be stored when using the Mining Client).

:::info
Delegating the miner (using two addresses) like this is not strictly required, but represents best practices - even if your mining process ended up compromised and the private key accessed, the worst that could be done with it would be to slowly have your stake slashed by misbehaving, which can be prevented by removing the permissions of the disposable address (see below)
:::

<Tabs>
<TabItem value="form" label="In your browser (recommended)" default>

Connect this site to MetaMask and use the following form to add stake to use for Reputation Mining. The only step that is mandatory is to stake at least 2000 CLNY which is the minimum stake required to participate in Reputation Mining.

**We recommend using a separate Ethereum account for the miner itself and set it as a delegate.** This can be done in the second step of the form.

Shall you wish to stop participating in Reputation Mining, you can unstake your CLNY in the third step.

<reputation-mining-setup />

</TabItem>

<TabItem value="manual" label="Manually via Truffle">

1. Check out our contract repository, following [these instructions](../quick-start.md#cloning-the-repository-and-preparing-the-dependencies). You should then be able to run `yarn run truffle console --network xdai` which will connect you to the right network. You will need to be able to sign messages from the address in control of your CLNY (which will also be the address earning reputation for mining), which in most cases means pasting your private key into `truffle.js` before launching the console. For Ledger support, you can use `yarn run truffle console --network xdaiLedger`. For other hardware wallets, you will need to find an appropriate provider compatible with Truffle, and add it into `truffle.js` in your local version of the repository.
    
    An appropriate gas price for the current level of network use can be found at [https://blockscout.com/xdai/mainnet/](https://blockscout.com/xdai/mainnet/). The default value in `truffle.js` represent 2Gwei.


2. Create references to the various contracts that we will need. Run each of these commands in turn:

```javascript
colonyNetwork = await IColonyNetwork.at("0x78163f593D1Fa151B4B7cacD146586aD2b686294" );
clnyToken = await Token.at("0xc9B6218AffE8Aba68a13899Cbf7cF7f14DDd304C");
tokenLockingAddress = await colonyNetwork.getTokenLocking();
tokenLocking = await ITokenLocking.at(tokenLockingAddress);
```

:::info
_Note that all of the following commands, where they represent a transaction being sent on-chain, are documented with `estimateGas`. This is deliberate, and so copying and pasting these instructions should not do anything on chain. Once you are happy with the command, and the call to `estimateGas` does not error, you remove the .`estimateGas` from the command and re-run it to execute it on-chain._
:::

3. Award the token locking contract the ability to take the CLNY you are intending to stake. The value used in this example is the minimum stake required; you may wish to stake more.

```javascript
// Approve the tokens
clnyToken.approve.estimateGas(tokenLocking.address, "2000000000000000000000");
// Deposit the tokens
tokenLocking.deposit.estimateGas(clnyToken.address, "2000000000000000000000", false); 
// Stake the tokens for mining
colonyNetwork.stakeForMining.estimateGas("2000000000000000000000");
// (Optional) Confirm that the tokens have been staked
await colonyNetwork.getMiningStake(accounts[0]);
[
  '2000000000000000000000',
  '1613397970',
  amount: '2000000000000000000000',
  timestamp: '1613397970'
]
```

4. Award delegated mining permissions to your 'disposable' address:

```javascript
const miningDelegate = "your-delegate-address"
colonyNetwork.setMiningDelegate.estimateGas(miningDelegate, true)
// To remove delegated mining permissions in the future, run the following
colonyNetwork.setMiningDelegate.estimateGas(miningDelegate, false)
```

Congratulations! You've set up all the necessary permissions to run a miner.
</TabItem>

</Tabs>

### B. Getting a recent snapshot <a href="#snapshot" id="snapshot"></a>

A recent snapshot, which should be from the last day or so, is available at [https://xdai.colony.io/reputation/xdai/latestState](https://xdai.colony.io/reputation/xdai/latestState).

After downloading, place it whichever directory you are running the reputation miner from, and rename it to `reputations.sqlite` (if you are using the commands above). Upon start, the miner will load this snapshot, and sync from there. Here's the command that downloads it and names it accordingly:

```bash
curl -o reputations.sqlite https://xdai.colony.io/reputation/xdai/latestState
# or
wget -O reputations.sqlite https://xdai.colony.io/reputation/xdai/latestState
```

### C. Setting up the miner

The biggest hurdle to running a reputation miner is syncing it initially. This requires an Xdai archive node. Here's a list of providers that offer archive nodes on Gnosis chain (https://github.com/arddluma/awesome-list-rpc-nodes-providers#gnosis-xdai). You very likely will have to pay for that service. To speed up the syncing process, you can also use a recent snapshot of the reputation state tree ([see below](reputation-mining.md#snapshot)), but this doesn't remove the requirement for an archive node (for more recent historical state).

Strictly speaking, once synced, an archive node is not required. However, should you fall behind (due to the miner not running for some reason), then you will need access to an archive mode to resume.&#x20;

The most reliable way to run the miner is by using Docker via the image provided by us, but you can also run it directly from a checked-out copy of our repository (which you already have, if you've completed the previous section).

Regardless of which you use, you will need the private key you wish mining transactions to be signed from. Putting the private key in an environment variable is recommended for security purposes.

<Tabs>
<TabItem value="docker" label="Using Docker (recommended)" default>

First create a directory for the miner data. The docker image will then create files in the directory you run this command from; you can alter the `-v` argument to change this behaviour.

```bash
docker run --env REP_MINER_RPC_ENDPOINT="[YOUR_ARCHIVE_NODE_RPC_ADDRESS]" --env REP_MINER_PRIVATE_KEY="[YOUR_PRIVATE_KEY_FOR_MINING]" --env REP_MINER_DB_PATH="/root/datadir/reputations.sqlite" -p 3000:3000 -v $(pwd):/root/datadir joincolony/reputation-miner:latest
```

</TabItem>

<TabItem value="repository" label="From repository">

Note: this only works after you have successfully built the contracts

```bash
node ./packages/reputation-miner/bin/index.js --rpcEndpoint [YOUR_ARCHIVE_NODE_RPC_ADDRESS] --privateKey [YOUR_PRIVATE_KEY_FOR_MINING]
```

</TabItem>
</Tabs>

## Reputation Miner command line reference

The reputation mining client can take various arguments that can be supplied via command line parameters or environment variables (useful when using Docker). You can aalways run 

```bash
node ./packages/reputation-miner/bin/index.js --help
```

to see all available options.

### `--adapter` (`REP_MINER_ADAPTER`)

Adapter to report mining logs to
[string] [choices: "console", "discord", "slack"] [default: "console"]

### `--adapterLabel` (`REP_MINER_ADAPTER_LABEL`)

Label for the adapter (only needed for Discord adapter)
[string]
  
### `--auto` (`REP_MINER_AUTO`)

Whether to automatically submit hashes and respond to challenges
[boolean] [default: true]
  
The "auto" reputation mining client will:

* Propose a new hash at the first possible block time, and submit until the maximum number has been reached (based on staked CLNY, with a maximum of 12 submissions allowed)
* Respond to challenges if there are disagreeing submissions.
* Confirm the last hash after the mining window closes and any disputes have been resolved.

### `--colonyNetworkAddress` (`REP_MINER_COLONY_NETWORK_ADDRESS`)

Ethereum address of the ColonyNetwork Smart Contract in the network the miner is connected to
[string] [default: "0x78163f593D1Fa151B4B7cacD146586aD2b686294"]

The address of the Colony Network's `EtherRouter`. This is `0x78163f593D1Fa151B4B7cacD146586aD2b686294` for Gnosis Chain

### `--dbPath` (`REP_MINER_DB_PATH`)

Path where to save the database
[string] [default: "./reputations.sqlite"]

### `--exitOnError` (`REP_MINER_EXIT_ON_ERROR`)

Whether to exit when an error is hit or not.
[boolean] [default: false]

### `--minerAddress` (`REP_MINER_MINER_ADDRESS`) (local development only)
Address of the miner account which the client will send reputation mining contract transactions from. Used when working with an unlocked account for the miner against **development networks only**. We provision twelve unlocked test accounts stored in `ganache-accounts.json` for testing that are available when starting a local ganache-cli instance via `npm run start:blockchain:client` command.

### `--oracle` (`REP_MINER_ORACLE`)

Whether to serve requests as a reputation oracle or not
[boolean] [default: true]

### `--oraclePort` (`REP_MINER_ORACLE_PORT`)

Port the reputation oracle should be exposed on. Only applicable if `oracle` is set to `true`
[number] [default: 3000]
  
### `--privateKey` (`REP_MINER_PRIVATE_KEY`)

The private key of the address that is mining, allowing the miner to sign transactions.
[string]

Required for mining in production.
  
### `--processingDelay` (`REP_MINER_PROCESSING_DELAY`)

Delay between processing reputation logs (in blocks)
[number] [default: 10]

### `--rpcEndpoint` (`REP_MINER_RPC_ENDPOINT`)

http address of the RPC node to connect to.
[string] [default: "http://localhost:8545"]

An archive node with RPC endpoint is required for mining in production.
  
### `--syncFrom` (`REP_MINER_SYNC_FROM`)

Block number to start reputation state sync from
[number] [default: 11897847]

This is the block at which the reputation mining process was initialised. This number is static on Gnosis Chain: `11897847`. If you run into troubles when using this number, try `11897848`.

Note that beginning the sync with a too-early block will result in an error. If you get this exception, try syncing from a more recent block. Note that the sync process can take long. Latest tests syncing a client from scratch to 28 reputation cycles took \~2 hours.

## Rewards

At the current time, there are no rewards for reputation mining yet.

## Visualizations

The reputation mining client comes with a set of built-in visualizers to make it easier to view reputation states and to see the current state of the mining process. Once a mining client is running and connected to a network, navigate to the client's address in a browser (i.e. `http://localhost:3000/`) to access the available visualization tools.

## Get Reputation from the Reputation Oracle

The reputation mining client will answer queries for reputation scores locally over HTTP.

```
http://127.0.0.1:3000/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

An instance of the oracle is available for reputation queries against the Gnosis Chain network.

```
https://xdai.colony.io/reputation/{network}/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

The oracle should be able to provide responses to any valid reputation score in all historical states, as well as the current state. For querying the colony-wide reputation instead of user-specific one, instead of {userAddress} use a zero address (`0x0000000000000000000000000000000000000000`)

For example, you can get the reputation score of the miner in a reputation state `0xc7eb2cf60aa4848ce0feed5d713c07fd26e404dd50ca3b9e4f2fabef196ca3bc`) using the address of the Meta Colony (`0x14946533cefe742399e9734a123f0c02d0405a51`), the mining skill id (`2`), and address of a miner (`0x0A1d439C7d0b9244035d4F934BBF8A418B35d064`).

```
https://xdai.colony.io/reputation/mainnet/0xc7eb2cf60aa4848ce0feed5d713c07fd26e404dd50ca3b9e4f2fabef196ca3bc/0x14946533cefe742399e9734a123f0c02d0405a51/2/0x0A1d439C7d0b9244035d4F934BBF8A418B35d064
```

The oracle returns

```
{"branchMask":"0xc000000000000000000000000000000000000000000000000000000000000000","siblings":["0x15c45d734bccc204df2e275d516250ed0a1cd60ccabadf49e2157a3e8067e59c","0xd4ee79473ec5573d706be030f3077c44aef06f26745349bbd93dcf5f4e254422"],"key":"0x14946533cefe742399e9734a123f0c02d0405a5100000000000000000000000000000000000000000000000000000000000000020a1d439c7d0b9244035d4f934bbf8a418b35d064","value":"0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004","reputation":"0x0000000000000000000000000000000000000000000000000000000000000000","uid":"0x0000000000000000000000000000000000000000000000000000000000000004","reputationAmount":"0"}
```

## Using the Reputation Mining Client in development

The client is set to provide a reputation update once every 24 hours. For testing, you'll likely want to "fast-forward" your network through a few submissions to see usable reputation.

You can move the network forward by 24 hours with the following command.

```bash
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_increaseTime","params":[86400],"id": 1}' localhost:8545
```

Once you have moved the network forward 24 hours, you can then mine a new block with the following command.

```bash
curl -H "Content-Type: application/json" -X POST --data '{"jsonrpc":"2.0","method":"evm_mine","params":[]}' localhost:8545
```

Note that because reputation is awarded for the _previous_ submission window, you will need to use the "fast-forward" command above to speed through at least 2 reputation updates before noticing a change in the miner's reputation.
