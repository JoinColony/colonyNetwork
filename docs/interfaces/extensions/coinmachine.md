# Coin Machine Extension (`CoinMachine`)

Coin Machine is a mechanism to sell tokens within a colony, simplifying the process for all participants involved. It introduces the functionality to sell limited amounts of tokens in fixed-price batches, adjusting prices up or down in between sale periods based on recent demand. Coin Machine sacrifices continual availability and real-time price adjustment for the simplicity of fixed price and fixed supply, thereby also sidestepping the challenges of price manipulation, volatility, and front-running.

  
## Interface Methods

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


### ▸ `finishUpgrade()`

Called when upgrading the extension




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

### ▸ `getCurrentPrice():uint256 _price`

Get the current price per token



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_price|uint256|Current price

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

### ▸ `getMetatransactionNonce(address _userAddress):uint256 _nonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|_userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_nonce|uint256|The nonce

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




### ▸ `version():uint256 _version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|_version|uint256|The extension's version number
