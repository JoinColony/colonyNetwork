/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/erc20.sol";
import "./ColonyExtension.sol";

// ignore-file-swc-108


contract CoinMachine is ColonyExtension {

  // Events

  event TokensBought(address buyer, uint256 numTokens, uint256 totalCost);
  event PeriodUpdated(uint256 activePeriod, uint256 currentPeriod);

  // Storage

  address purchaseToken; // The token in which we receive payments, 0x0 for eth

  uint256 periodLength; // Duration of a sale period in seconds (e.g. 3600 = 1 hour)
  uint256 alpha; // WAD-denominated float between 0 and 1 that controls how quickly the EMA adjusts
  uint256 windowSize; // In the long-term, 86% of the weighting will be in this window size

  uint256 targetPerPeriod; // Target number of tokens to sell in a period
  uint256 maxPerPeriod; // Maximum number of tokens sellable in a period

  uint256 tokensToSell_DEPRECATED; // deprecated, replaced by ERC20(token).balanceOf(address(this))

  uint256 activePeriod; // The active sale period
  uint256 activePrice; // The active sale price (a WAD ratio of averageIntake / targetPerPeriod)

  uint256 activeSold; // Tokens sold in the active period
  uint256 activeIntake; // Payment received in the active period

  uint256 emaIntake; // Averaged payment intake

  address token; // The token we are selling

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "coin-machine-caller-not-root");
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("CoinMachine");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 2;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    token = colony.getToken();
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {
    token = colony.getToken();
  }

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    uint256 unsoldTokens = ERC20(token).balanceOf(address(this));
    if (unsoldTokens > 0) ERC20(token).transfer(address(colony), unsoldTokens);

    selfdestruct(address(uint160(address(colony))));
  }

  /// @notice Must be called before any sales can be made
  /// @param _purchaseToken The token to receive payments in. Use 0x0 for ether
  /// @param _periodLength How long in seconds each period of the sale should last
  /// @param _windowSize Characteristic number of periods that should be used for the moving average. In the long-term, 86% of the weighting will be in this window size. The higher the number, the slower the price will be to adjust
  /// @param _targetPerPeriod The number of tokens to aim to sell per period
  /// @param _maxPerPeriod The maximum number of tokens that can be sold per period
  /// @param _startingPrice The sale price to start at, expressed in units of _purchaseToken per token being sold, as a WAD
  function initialise(
    address _token,
    address _purchaseToken,
    uint256 _periodLength,
    uint256 _windowSize,
    uint256 _targetPerPeriod,
    uint256 _maxPerPeriod,
    uint256 _startingPrice
  )
    public
    onlyRoot
  {
    require(activePeriod == 0, "coin-machine-already-initialised");

    require(_periodLength > 0, "coin-machine-period-too-small");
    require(_windowSize > 0, "coin-machine-window-too-small");
    require(_windowSize <= 511, "coin-machine-window-too-large");
    require(_targetPerPeriod > 0, "coin-machine-target-too-small");
    require(_maxPerPeriod >= _targetPerPeriod, "coin-machine-max-too-small");

    token = _token;

    // A value of address(0x0) denotes Ether
    purchaseToken = _purchaseToken;

    periodLength = _periodLength;
    alpha = wdiv(2, _windowSize + 1); // Two ints enter, 1 WAD leaves
    // In the long-term, 86% of the weighting will be in this window size. This is a 'standard' conversion
    // used between SMAs and EMAs, as the center of mass of the weightings is the same if this is used.
    windowSize = _windowSize;

    targetPerPeriod = _targetPerPeriod;
    maxPerPeriod = _maxPerPeriod;

    activePrice = _startingPrice;
    activePeriod = getCurrentPeriod();

    emaIntake = wmul(targetPerPeriod, _startingPrice);

    emit ExtensionInitialised();
  }

  /// @notice Purchase tokens from Coin Machine.
  /// @param _numTokens The number of tokens to purchase
  function buyTokens(uint256 _numTokens) public payable notDeprecated {
    updatePeriod();

    uint256 tokenBalance = ERC20(token).balanceOf(address(this));
    uint256 numTokens = min(min(_numTokens, maxPerPeriod - activeSold), tokenBalance);
    uint256 totalCost = wmul(numTokens, activePrice);

    activeIntake = add(activeIntake, totalCost);
    activeSold = add(activeSold, numTokens);

    assert(activeSold <= maxPerPeriod);

    if (purchaseToken == address(0x0)) {
      require(msg.value >= totalCost, "coin-machine-insufficient-funds");
      if (msg.value > totalCost) { msg.sender.transfer(msg.value - totalCost); }
    } else {
      require(ERC20Extended(purchaseToken).transferFrom(msg.sender, address(this), totalCost), "coin-machine-transfer-failed");
    }

    ERC20(token).transfer(msg.sender, numTokens);

    emit TokensBought(msg.sender, numTokens, totalCost);
  }

  /// @notice Bring the token accounting current
  function updatePeriod() public {
    uint256 currentPeriod = getCurrentPeriod();

    // If we're out of tokens, don't update
    if (ERC20(token).balanceOf(address(this)) == 0) {
      activePeriod = currentPeriod;
    }

    // We need to update the price if the active period is not the current one.
    if (activePeriod < currentPeriod) {
      uint256 initialActivePeriod = activePeriod;

      emaIntake = wmul((WAD - alpha), emaIntake) + wmul(alpha, activeIntake); // wmul(wad, int) => int
      activeIntake = 0;

      activeSold = 0;

      // Handle any additional missed periods
      uint256 periodGap = currentPeriod - activePeriod - 1;
      if (periodGap != 0) {
        emaIntake = wmul(wpow((WAD - alpha), periodGap), emaIntake);
      }

      activePeriod = currentPeriod;

      // Update the price
      activePrice = wdiv(emaIntake, targetPerPeriod);

      emit PeriodUpdated(initialActivePeriod, currentPeriod);
    }
  }

  /// @notice Get the length of the sale period
  function getPeriodLength() public view returns (uint256) {
    return periodLength;
  }

  /// @notice Get the size of the averaging window
  function getWindowSize() public view returns (uint256) {
    return windowSize;
  }

  /// @notice Get the target number of tokens to sell per period
  function getTargetPerPeriod() public view returns (uint256) {
    return targetPerPeriod;
  }

  /// @notice Get the maximum number of tokens to sell per period
  function getMaxPerPeriod() public view returns (uint256) {
    return maxPerPeriod;
  }

  /// @notice Get the current price per token
  function getCurrentPrice() public view returns (uint256) {
    uint256 currentPeriod = getCurrentPeriod();

    if (activePeriod >= currentPeriod || ERC20(token).balanceOf(address(this)) == 0) {
      return activePrice;

    // Otherwise, infer the new price
    } else {
      uint256 newIntake = emaIntake;

      // Accommodate the activePeriod
      newIntake = wmul((WAD - alpha), newIntake) + wmul(alpha, activeIntake);

      // Accommodate periods between the activePeriod and the currentPeriod
      uint256 periodGap = currentPeriod - activePeriod - 1;
      if (periodGap != 0) {
        newIntake = wmul(wpow((WAD - alpha), periodGap), newIntake);
      }

      return wdiv(newIntake, targetPerPeriod);
    }
  }

  /// @notice Get the number of remaining tokens for sale this period
  function getNumAvailable() public view returns (uint256) {
    return min(
      ERC20(token).balanceOf(address(this)),
      sub(maxPerPeriod, ((activePeriod >= getCurrentPeriod()) ? activeSold : 0))
    );
  }

  // Internal

  function getCurrentPeriod() internal view returns (uint256) {
    return block.timestamp / periodLength;
  }

  function wpow(uint256 x, uint256 n) internal pure returns (uint256) {
    // Must convert WAD (10 ** 18) to RAY (10 ** 27) and back
    return rpow(x * (10 ** 9), n) / (10 ** 9);
  }
}
