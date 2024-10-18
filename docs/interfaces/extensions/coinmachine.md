# Coin Machine Extension (`CoinMachine`)

Coin Machine is a mechanism to sell tokens within a colony, simplifying the process for all participants involved. It introduces the functionality to sell limited amounts of tokens in fixed-price batches, adjusting prices up or down in between sale periods based on recent demand. Coin Machine sacrifices continual availability and real-time price adjustment for the simplicity of fixed price and fixed supply, thereby also sidestepping the challenges of price manipulation, volatility, and front-running.

_This is a Colony Extension which conforms to the extension interface found [here](icolonyextension.md)._

See [here](https://colony.gitbook.io/colony/extensions/coin-machine) for more information.

  
## Interface Methods

### ▸ `authority():DSAuthority authority`

Get the authority of the contract



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|authority|DSAuthority|The authority of the contract

### ▸ `buyTokens(uint256 _numTokens)`

Purchase tokens from Coin Machine.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_numTokens|uint256|The number of tokens to purchase


### ▸ `deprecate(bool _deprecated)`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### ▸ `executeMetaTransaction(address _user, bytes memory _payload, bytes32 _sigR, bytes32 _sigS, uint8 _sigV):bytes returnData`

Main function to be called when user wants to execute meta transaction. The actual function to be called should be passed as param with name functionSignature Here the basic signature recovery is being used. Signature is expected to be generated using personal_sign method.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of user trying to do meta transaction
|_payload|bytes|Function call to make via meta transaction
|_sigR|bytes32|R part of the signature
|_sigS|bytes32|S part of the signature
|_sigV|uint8|V part of the signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|returnData|bytes|Return data returned by the actual function called

### ▸ `finishUpgrade()`

A function to be called after an upgrade has been done from v2 to v3.

*Note: Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to be external so it can be an external call.*



### ▸ `getActiveIntake():uint256 _intake`

Get the number of tokens received in the period that the price was last updated for or a purchase was made



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_intake|uint256|Amount of tokens received

### ▸ `getActivePeriod():uint256 _period`

Get the period that the price was last updated for or a purchase was made



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_period|uint256|The active period

### ▸ `getActiveSold():uint256 _sold`

Get the number of tokens sold in the period that the price was last updated for or a purchase was made



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_sold|uint256|Amount of tokens sold

### ▸ `getCapabilityRoles(bytes4 _sig):bytes32 roles`

Gets the bytes32 representation of the roles authorized to call a function


**Parameters**

|Name|Type|Description|
|---|---|---|
|_sig|bytes4|The function signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|roles|bytes32|bytes32 representation of the authorized roles

### ▸ `getColony():address colony`

Gets the address of the extension's colony



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colony|address|The address of the colony

### ▸ `getCurrentPrice():uint256 _price`

Get the current price per token



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_price|uint256|Current price

### ▸ `getDeprecated():bool deprecated`

Gets the boolean indicating whether or not the extension is deprecated



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|deprecated|bool|Boolean indicating whether or not the extension is deprecated

### ▸ `getEMAIntake():uint256 _amount`

Get the EMA of the number of tokens received each period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_amount|uint256|Amount of tokens received

### ▸ `getEvolvePrice():bool _evolve`

Get the evolvePrice boolean



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_evolve|bool|The evolvePrice boolean

### ▸ `getMaxPerPeriod():uint256 _max`

Get the maximum number of tokens to sell per period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_max|uint256|Maximum number of tokens

### ▸ `getMaxPurchase(address _user):uint256 _max`

Get the maximum amount of tokens a user can purchase in a period


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_max|uint256|Maximum amount of tokens

### ▸ `getMetatransactionNonce(address userAddress):uint256 nonce`

Gets the next metatransaction nonce for user that should be used targeting this contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The address of the user that will sign the metatransaction

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce that should be used for the next metatransaction

### ▸ `getPeriodLength():uint256 _length`

Get the length of the sale period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_length|uint256|Length of the sale period

### ▸ `getPurchaseToken():address _token`

Get the address of the token being used to make purchases



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The token's address

### ▸ `getSellableTokens():uint256 _remaining`

Get the number of remaining tokens for sale this period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_remaining|uint256|Tokens remaining

### ▸ `getTargetPerPeriod():uint256 _target`

Get the target number of tokens to sell per period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_target|uint256|Target number of tokens

### ▸ `getToken():address _token`

Get the address of the token being sold



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The token's address

### ▸ `getTokenBalance():uint256 _balance`

Get the remaining balance of tokens



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_balance|uint256|Remaining token balance

### ▸ `getUserLimit(address _user):uint256 _max`

Get the maximum amount of tokens a user can purchase in total


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_max|uint256|Maximum amount of tokens

### ▸ `getWhitelist():address _whitelist`

Get the address of the whitelist (if exists)



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_whitelist|address|Address of Whitelist contract

### ▸ `getWindowSize():uint256 _size`

Get the size of the averaging window



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_size|uint256|Size of the averaging window

### ▸ `identifier():bytes32 _identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_identifier|bytes32|The extension's identifier

### ▸ `initialise(address _token, address _purchaseToken, uint256 _periodLength, uint256 _windowSize, uint256 _targetPerPeriod, uint256 _maxPerPeriod, uint256 _userLimitFraction, uint256 _startingPrice, address _whitelist)`

Must be called before any sales can be made


**Parameters**

|Name|Type|Description|
|---|---|---|
|_token|address|The token we are selling. Cannot be ether
|_purchaseToken|address|The token to receive payments in. Use 0x0 for ether
|_periodLength|uint256|How long in seconds each period of the sale should last
|_windowSize|uint256|Characteristic number of periods that should be used for the moving average. In the long-term, 86% of the weighting will be in this window size. The higher the number, the slower the price will be to adjust
|_targetPerPeriod|uint256|The number of tokens to aim to sell per period
|_maxPerPeriod|uint256|The maximum number of tokens that can be sold per period
|_userLimitFraction|uint256|The fraction of the total sale that a single user can buy (in WAD)
|_startingPrice|uint256|The sale price to start at, expressed in units of _purchaseToken per token being sold, as a WAD
|_whitelist|address|Optionally an address of a whitelist contract to use can be provided. Pass 0x0 if no whitelist being used


### ▸ `install(address _colony)`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### ▸ `multicall(bytes[] calldata _data):bytes[] results`

Call multiple functions in the current contract and return the data from all of them if they all succeed

*Note: The `msg.value` should not be trusted for any method callable from multicall.*

**Parameters**

|Name|Type|Description|
|---|---|---|
|_data|bytes[]|The encoded function data for each of the calls to make to this contract

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|results|bytes[]|The results from each of the calls passed in via data

### ▸ `owner():address owner`

Get the owner of the contract



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|owner|address|The owner of the contract

### ▸ `setOwner(address owner_)`

Set the owner of the contract


**Parameters**

|Name|Type|Description|
|---|---|---|
|owner_|address|The new owner of the contract


### ▸ `setWhitelist(address _whitelist)`

Set the address for an (optional) whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_whitelist|address|The address of the whitelist


### ▸ `uninstall()`

Called when uninstalling the extension




### ▸ `updatePeriod()`

Bring the token accounting current




### ▸ `verify(address _user, uint256 _nonce, uint256 _chainId, bytes memory _payload, bytes32 _sigR, bytes32 _sigS, uint8 _sigV):bool bool`

Verifies the signature for the metatransaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|Address of user trying to do meta transaction
|_nonce|uint256|Nonce of the user
|_chainId|uint256|Chain id where the signature is valid for
|_payload|bytes|Function call to make via meta transaction
|_sigR|bytes32|R part of the signature
|_sigS|bytes32|S part of the signature
|_sigV|uint8|V part of the signature

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|bool|bool|indicating if the signature is valid or not

### ▸ `version():uint256 colonyVersion`

Get the Colony contract version. Starts from 1 and is incremented with every deployed contract change.



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|colonyVersion|uint256|Version number