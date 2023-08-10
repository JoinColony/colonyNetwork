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


### ▸ `addGlobalSkill():uint256 skillId`

Add a new global skill.

*Note: Calls `IColonyNetwork.addSkill`.*


**Return Parameters**

|Name|Type|Description|
|---|---|---|
|skillId|uint256|Id of the added skill

### ▸ `addNetworkColonyVersion(uint256 _version, address _resolver)`

Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members.

*Note: Calls `IColonyNetwork.addColonyVersion`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The new Colony contract version
|_resolver|address|Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract


### ▸ `deprecateGlobalSkill(uint256 _skillId)`

Mark a global skill as deprecated which stops new tasks and payments from using it.

*Note: Calls `IColonyNetwork.deprecateSkill`.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_skillId|uint256|Id of the added skill


### ▸ `mintTokensForColonyNetwork(uint256 _wad)`

Mints CLNY in the Meta Colony and transfers them to the colony network. Only allowed to be called on the Meta Colony by the colony network.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_wad|uint256|Amount to mint and transfer to the colony network


### ▸ `setBridgeData(address _bridgeAddress, uint256 _chainId, uint256 _gas, bytes memory _updateLogBefore, bytes memory _updateLogAfter, bytes memory _skillCreationBefore, bytes memory _skillCreationAfter, bytes memory _setReputationRootHashBefore, bytes memory _setReputationRootHashAfter)`

Called to set the details about bridge _bridgeAddress


**Parameters**

|Name|Type|Description|
|---|---|---|
|_bridgeAddress|address|The address of the bridge
|_chainId|uint256|The chainId of the corresponding network
|_gas|uint256|How much gas to use for a bridged transaction
|_updateLogBefore|bytes|The tx data before the dynamic part of the tx to bridge to the update log
|_updateLogAfter|bytes|The tx data after the dynamic part of the tx to bridge to the update log
|_skillCreationBefore|bytes|The tx data before the dynamic part of the tx to brdige skill creation
|_skillCreationAfter|bytes|The tx data after the dynamic part of the tx to brdige skill creation
|_setReputationRootHashBefore|bytes|The tx data before the dynamic part of the tx to bridge a new reputation root hash
|_setReputationRootHashAfter|bytes|The tx data after the dynamic part of the tx to bridge a new reputation root hash


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