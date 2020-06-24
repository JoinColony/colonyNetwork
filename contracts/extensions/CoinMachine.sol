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

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/math.sol";
import "./../colony/IColony.sol";
import "./../common/ERC20Extended.sol";

// ignore-file-swc-108


contract CoinMachine is DSMath {

  IColony colony;

  constructor(address _colony) public {
    colony = IColony(_colony);
  }

  // Storage
  ERC20Extended purchaseToken; // The token in which we receive payments

  uint256 periodLength; // Duration of a sale period (i.e. one hour)
  uint256 windowSize; // Number of periods in the price averaging window (i.e. 10)

  uint256 targetPerPeriod; // Target number of tokens to sell in a period
  uint256 maxPerPeriod; // Maximum number of tokens sellable in a period
  int256 tokenSurplus; // Total tokens undersold (i.e. below target), negative means deficit

  uint256 activePeriod; // The active sale period
  uint256 activePrice; // The active sale price

  uint256 tokensSold; // Tokens sold in the active period
  uint256 activeIntake; // Payment received in the active period

  mapping (uint256 => uint256) pastIntakes; // Payment received in past periods

  // Public

  function initialise(
    address _purchaseToken,
    uint256 _periodLength,
    uint256 _windowSize,
    uint256 _targetPerPeriod,
    uint256 _maxPerPeriod,
    uint256 _startingPrice
  )
    public
  {
    require(address(purchaseToken) == address(0x0), "coin-machine-already-initialised");

    purchaseToken = ERC20Extended(_purchaseToken);

    periodLength = _periodLength;
    windowSize = _windowSize;

    targetPerPeriod = _targetPerPeriod;
    maxPerPeriod = _maxPerPeriod;

    activePrice = _startingPrice;
    activePeriod = getCurrentPeriod();

    uint256 startingIntake = wmul(targetPerPeriod, _startingPrice);
    for (uint256 i; i < _windowSize; i++) {
      pastIntakes[i] = startingIntake;
    }
  }

  function buyTokens(uint256 _numTokens) public {
    updatePeriod();

    uint256 numTokens = min(_numTokens, maxPerPeriod - tokensSold);
    uint256 totalPrice = wmul(numTokens, activePrice);

    activeIntake += totalPrice;
    tokensSold += numTokens;

    assert(tokensSold <= maxPerPeriod);

    require(
      purchaseToken.transferFrom(msg.sender, address(this), totalPrice),
      "coin-machine-transfer-failed"
    );

    colony.mintTokensFor(msg.sender, numTokens);
  }

  // Make sure this is called at least once during the averaging period
  function updatePeriod() public {
    uint256 currentPeriod = getCurrentPeriod();

    // Handle the recently elapsed period
    if (activePeriod < currentPeriod) {
      pastIntakes[toBin(activePeriod)] = activeIntake;
      activeIntake = 0;

      tokenSurplus += (int256(targetPerPeriod) - int256(tokensSold));

      tokensSold = 0;
      activePeriod += 1;
    }

    // Handle any additional missed periods
    while (activePeriod < currentPeriod) {
      pastIntakes[toBin(activePeriod)] = 0;
      tokenSurplus += int256(targetPerPeriod);
      activePeriod += 1;
    }

    // Update the price
    uint256 sum;

    for (uint256 i; i < windowSize; i++) {
      sum += pastIntakes[i];
    }

    activePrice = wdiv(sum / windowSize, targetPerPeriod);
  }

  function getPeriodLength() public view returns (uint256) {
    return periodLength;
  }

  function getWindowSize() public view returns (uint256) {
    return windowSize;
  }

  function getTargetPerPeriod() public view returns (uint256) {
    return targetPerPeriod;
  }

  function getMaxPerPeriod() public view returns (uint256) {
    return maxPerPeriod;
  }

  function getCurrentPrice() public view returns (uint256) {
    uint256 currentPeriod = getCurrentPeriod();

    if (activePeriod == currentPeriod) {
      return activePrice;

    // Otherwise, infer the new price
    } else {
      uint256 sum;
      uint256 period = currentPeriod - windowSize;

      for (; period <= currentPeriod; period++) {
        if (period < activePeriod) {
          sum += pastIntakes[toBin(period)];
        } else if (period == activePeriod) {
          sum += activeIntake;
        }
        // No `else`, any intakes between activePeriod and currentPeriod are 0
      }

      return wdiv(sum / windowSize, targetPerPeriod);
    }
  }

  function getNumAvailable() public view returns (uint256) {
    return maxPerPeriod -
      ((activePeriod == getCurrentPeriod()) ? tokensSold : 0);
  }

  function getTokenSurplus() public view returns (int256) {
    return tokenSurplus - int256(tokensSold) +
      int256((1 + getCurrentPeriod() - activePeriod) * targetPerPeriod);
  }

  // Internal

  function getCurrentPeriod() internal view returns (uint256) {
    return now / periodLength;
  }

  function toBin(uint256 period) internal view returns(uint256) {
    return period % windowSize;
  }
}
