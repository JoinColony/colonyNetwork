# Meta Colony (`IMetaColony`)

The Meta Colony is a special colony which controls the Colony Network.
This colony has access to a number of special functions used to manage
various parameters of the network.

  
## Interface Methods

### ▸ `addExtensionToNetwork(bytes32 _extensionId, address _resolver)`

Add a new extension/version to the Extensions repository.

*Note: Calls `IColonyNetwork.addExtensionToNetwork`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_extensionId|bytes32|keccak256 hash of the extension name, used as an indentifier
|_resolver|address|The deployed resolver containing the extension contract logic


### ▸ `addNetworkColonyVersion(uint256 _version, address _resolver)`

Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members.

*Note: Calls `IColonyNetwork.addColonyVersion`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The new Colony contract version
|_resolver|address|Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract


### ▸ `initialiseReputationMining(uint256 miningChainId, bytes32 newHash, uint256 newNLeaves)`

Creates initial inactive reputation mining cycle.

*Note: Only callable from metacolony*

**Parameters**

|Name|Type|Description|
|---|---|---|
|miningChainId|uint256|The chainId of the chain the mining cycle is being created on Can either be this chain or another chain, and the function will behave differently depending on which is the case.
|newHash|bytes32|The root hash of the reputation state tree
|newNLeaves|uint256|The number of leaves in the state tree


### ▸ `setColonyBridgeAddress(address _bridgeAddress)`

Called to set the address of the colony bridge contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|_bridgeAddress|address|The address of the bridge


### ▸ `setNetworkFeeInverse(uint256 _feeInverse)`

Set the Colony Network fee inverse amount.

*Note: Calls `IColonyNetwork.setFeeInverse`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_feeInverse|uint256|Nonzero amount for the fee inverse


### ▸ `setPayoutWhitelist(address _token, bool _status)`

Set a token's status in the payout whitelist on the Colony Network


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The token being set
|_status|bool|The whitelist status


### ▸ `setReputationMiningCycleReward(uint256 _amount)`

Called to set the total per-cycle reputation reward, which will be split between all miners.

*Note: Calls the corresponding function on the ColonyNetwork.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|The CLNY awarded per mining cycle to the miners