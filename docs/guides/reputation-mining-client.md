---
description: How to use the Reputation Mining Client
sidebar_position: 3
---

# Reputation Mining Client

## Running the Mining Client

The reputation mining client can be run locally to sync with a local hardhat instance, the `arbitrum-sepolia` testnet, or with `arbitrum` itself.

To participate in the reputation mining process you need to have staked at least the [minimum amount of CLNY Tokens](../interfaces/ireputationminingcycle#getminstake-uint256-minstake), for at least [one full mining cycle duration](../interfaces/ireputationminingcycle#getminingwindowduration-uint256-miningwindowduration) before you can submit a new reputation root hash.

Usage:

```bash
node packages/reputation-miner/bin/index.js (--arguments <params>) [--arguments <params>]
```

Mandatory arguments:

```
(--minerAddress <address>) | (--privateKey <key>)
(--colonyNetworkAddress <address>)
(--syncFrom <number>)   // [arbitrum-sepolia: '28290396', arbitrum:'199165580']
```

Optional arguments:

```
[--network <(arbitrum-sepolia|arbitrum)>]
[--localPort <number>]
[--dbPath <$PATH>]
[--auto <(true|false)>]
```

#### `--minerAddress`
Address of the miner account which the client will send reputation mining contract transactions from. Used when working with an unlocked account for the miner against **development networks only**. We provision twelve unlocked test accounts stored in `ganache-accounts.json` for testing that are available when starting a local ganache-cli instance via `npm run start:blockchain:client` command.

#### `--privateKey`

Private key of the miner account which the client will sign reputation mining contract transactions with.

#### `--colonyNetworkAddress`

The address of the Colony Network's `EtherRouter`. See [Upgrades to the Colony Network](../concepts/upgrades) for more information about the EtherRouter design pattern. This address is static on all networks, with the `arbitrum-sepolia` address of `0x7777494e3d8cce0D3570E21FEf820F9Fee077777` and the `arbitrum` address of `0xCCcccdCC0CcF6C708D860e19353c5f9a49ACccCc`

#### `--dbPath`

Path for the sqlite database storing reputation state. Default is `./reputationStates.sqlite`.

#### `--network`

Used for connecting to a supported Infura node (instead of a local client). Valid options are `arbitrum-sepolia` and `arbitrum`.

#### `--localPort`

Used to connect to a local client running on the specified port. Default is `8545`.

#### `--syncFrom`

Block number to start reputation state sync from. This is the block at which the reputation mining process was initialised. This number is static on all networks

* `arbitrum-sepolia: 28290396`
* `arbitrum: 199165580`

Note that beginning the sync with a too-early block will result in an error. If you get this exception, try syncing from a more recent block. Note that the sync process can take long. Latest tests syncing a client from scratch to 28 reputation cycles took \~2 hours.

#### `--auto`

Default is `true`

The "auto" reputation mining client will:

* Propose a new hash at the first possible block time, and submit until the maximum number has been reached (based on staked CLNY, with a maximum of 12 submissions allowed)
* Respond to challenges if there are disagreeing submissions.
* Confirm the last hash after the mining window closes and any disputes have been resolved.

Reputation mining protocol details can be found in the [Whitepaper TLDR](../tldr/reputation-mining).

## Visualizations

The reputation mining client comes with a set of built-in visualizers to make it easier to view reputation states and to see the current state of the mining process. Once a mining client is running and connected to a network, navigate to the client's address in a browser (i.e. `http://localhost:3000/`) to access the available visualization tools.

### Force Reputation Updates

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

## Get Reputation from the Reputation Oracle

The reputation mining client will answer queries for reputation scores locally over HTTP.

```
http://127.0.0.1:3000/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

An instance of the oracle is available for reputation queries against all networks:

```
https://xdai.colony.io/reputation/{network}/{reputationState}/{colonyAddress}/{skillId}/{userAddress}
```

The oracle should be able to provide responses to any valid reputation score in all historical states, as well as the current state. For querying the colony-wide reputation instead of user-specific one, instead of {userAddress} use a zero address (`0x0000000000000000000000000000000000000000`)

For example, you can get the reputation score of the miner in a reputation state `0x4356fc32fc67dc29b03315b267e36b6e71a2c79a704d31d130ce7cd50f181b5b`) using the address of the Meta Colony (`0xa405A3353Bc7d6048C64BC3663f665A01fF3f43f`), the root domain skill id (`14346644871753686558079336823930779563196417`), and the address of a random contributor (`0xBDa44695a53DfEC8Fdb4b9c3087Ee1eDF91F5337`).

```
https://app.colony.io/reputation/arbitrum-one/0x4356fc32fc67dc29b03315b267e36b6e71a2c79a704d31d130ce7cd50f181b5b/0xa405A3353Bc7d6048C64BC3663f665A01fF3f43f/14346644871753686558079336823930779563196417/0xBDa44695a53DfEC8Fdb4b9c3087Ee1eDF91F5337
```

The oracle returns

```
{
  "branchMask": "0xff00000000000000000000000000000000000000000000000000000000000000",
  "siblings": [
    "0x20c4fde0e447c113cd18c48d7d21d396e4c3796a3ff06c2975c26c78a613bb02",
    "0x3dbf00c82c309552d520df46d5c78f221ea3b96210db7a6ad745798d15dd8946",
    "0x12aa230bc3783dba9fd9a178614d4f63d5a73c6133d205dd5a0ac0b28ec5437a",
    "0xabacb23c23992a4b141d6b4bf08ef2a89728cc2e63a9ea177c1825c73eaa2312",
    "0xc3c01bb803ff65a943b4cf9cdd3d40cfaea4f5993bca9a158e94c35fa9ae076b",
    "0x7580c51b923077b7765cd30187f907225971747aa1a545eba73edf7303b9d06a",
    "0xa9cde995aeff9d18e72abdd19cb8efe14cbb130c098e40a36003ae5f94481868",
    "0x271b5ece6ee0384943a59755daf48fb7f2b6291787418b107e58d2f1555f2832"
  ],
  "key": "0xa405a3353bc7d6048c64bc3663f665a01ff3f43f0000000000000000000000000000a4b100000000000000000000000000000001bda44695a53dfec8fdb4b9c3087ee1edf91f5337",
  "value": "0x000000000000000000000000000000000000000000001207a14057eaa7cd3f2d0000000000000000000000000000000000000000000000000000000000000241",
  "reputationAmount": "85143343283873545797421"
}
```
