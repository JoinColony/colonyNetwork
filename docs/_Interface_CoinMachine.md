## Interface Methods

### `buyTokens`

Purchase tokens from Coin Machine.


**Parameters**

|Name|Type|Description|
|---|---|---|
|_numTokens|uint256|The number of tokens to purchase


### `deprecate`

Called when deprecating (or undeprecating) the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_deprecated|bool|Indicates whether the extension should be deprecated or undeprecated


### `finishUpgrade`

Called when upgrading the extension




### `getActiveIntake`

Get the number of tokens received in the period that the price was last updated for or a purchase was made



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|intake|uint256|Amount of tokens received

### `getActivePeriod`

Get the period that the price was last updated for or a purchase was made



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|period|uint256|The active period

### `getActiveSold`

Get the number of tokens sold in the period that the price was last updated for or a purchase was made



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|sold|uint256|Amount of tokens sold

### `getCurrentPrice`

Get the current price per token



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|price|uint256|Current price

### `getEMAIntake`

Get the EMA of the number of tokens received each period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|amount|uint256|Amount of tokens received

### `getEvolvePrice`

Get the evolvePrice boolean



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|evolve|bool|The evolvePrice boolean

### `getMaxPerPeriod`

Get the maximum number of tokens to sell per period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|max|uint256|Maximum number of tokens

### `getMaxPurchase`

Get the maximum amount of tokens a user can purchase in a period


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|max|uint256|Maximum amount of tokens

### `getMetatransactionNonce`

Gets the next nonce for a meta-transaction


**Parameters**

|Name|Type|Description|
|---|---|---|
|userAddress|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|nonce|uint256|The nonce

### `getPeriodLength`

Get the length of the sale period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|length|uint256|Length of the sale period

### `getPurchaseToken`

Get the address of the token being used to make purchases



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The token's address

### `getSellableTokens`

Get the number of remaining tokens for sale this period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|remaining|uint256|Tokens remaining

### `getTargetPerPeriod`

Get the target number of tokens to sell per period



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|target|uint256|Target number of tokens

### `getToken`

Get the address of the token being sold



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|token|address|The token's address

### `getTokenBalance`

Get the remaining balance of tokens



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|balance|uint256|Remaining token balance

### `getUserLimit`

Get the maximum amount of tokens a user can purchase in total


**Parameters**

|Name|Type|Description|
|---|---|---|
|_user|address|The user's address

**Return Parameters**

|Name|Type|Description|
|---|---|---|
|max|uint256|Maximum amount of tokens

### `getWhitelist`

Get the address of the whitelist (if exists)



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|whitelist|address|Address of Whitelist contract

### `getWindowSize`

Get the size of the averaging window



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|size|uint256|Size of the averaging window

### `identifier`

Returns the identifier of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|identifier|bytes32|The extension's identifier

### `initialise`

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


### `install`

Configures the extension


**Parameters**

|Name|Type|Description|
|---|---|---|
|_colony|address|The colony in which the extension holds permissions


### `setWhitelist`

Set the address for an (optional) whitelist


**Parameters**

|Name|Type|Description|
|---|---|---|
|_whitelist|address|The address of the whitelist


### `uninstall`

Called when uninstalling the extension




### `updatePeriod`

Bring the token accounting current




### `version`

Returns the version of the extension



**Return Parameters**

|Name|Type|Description|
|---|---|---|
|version|uint256|The extension's version number