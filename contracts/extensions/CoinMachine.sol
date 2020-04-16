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
  ERC20Extended purchaseToken;

  uint256 periodLength;
  uint256 numPeriods;

  uint256 tokensPerPeriod;
  uint256 maxPerPeriod;
  uint256 tokenSurplus;
  uint256 tokenDeficit;

  uint256 currPeriod;
  uint256 currPrice;

  uint256 tokensSold;
  uint256 currIntake;

  mapping (uint256 => uint256) pastIntakes;

  // Public

  function initialize(
    address _purchaseToken,
    uint256 _periodLength,
    uint256 _numPeriods,
    uint256 _tokensPerPeriod,
    uint256 _maxPerPeriod,
    uint256 _startingPrice
  )
    public
  {
    require(address(purchaseToken) == address(0x0), "coin-machine-already-initialized");

    purchaseToken = ERC20Extended(_purchaseToken);

    periodLength = _periodLength;
    numPeriods = _numPeriods;

    tokensPerPeriod = _tokensPerPeriod;
    maxPerPeriod = _maxPerPeriod;

    currPrice = _startingPrice;
    currPeriod = getCurrPeriod();

    uint256 startingIntake = wmul(tokensPerPeriod, _startingPrice);
    for (uint256 i; i < _numPeriods; i++) {
      pastIntakes[i] = startingIntake;
    }
  }

  function buyTokens(uint256 _numTokens) public {
    updatePeriod();

    uint256 numTokens = min(_numTokens, getAvailable());
    uint256 totalPrice = wmul(numTokens, currPrice);

    currIntake += totalPrice;
    tokensSold += numTokens;
    assert(tokensSold <= maxPerPeriod);

    require(
      purchaseToken.transferFrom(msg.sender, address(this), totalPrice),
      "coin-machine-transfer-failed"
    );

    colony.mintTokensFor(msg.sender, numTokens);
  }

  function updatePeriod() public {
    bool newPeriod;

    if (getCurrPeriod() != currPeriod) {
      newPeriod = true;
      pastIntakes[currPeriod] = currIntake;
      currIntake = 0;

      // Handle surplus (prices falling)
      if (tokensSold < tokensPerPeriod) {
        // See how much we undersold
        uint256 difference = sub(tokensPerPeriod, tokensSold);
        // See how much we can take from the deficit
        uint256 fromDeficit = min(difference, tokenDeficit);
        // See how much we can add to the surplus
        uint256 toSurplus = sub(difference, fromDeficit);

        tokenDeficit = sub(tokenDeficit, fromDeficit);
        tokenSurplus = add(tokenSurplus, toSurplus);
      }

      // Handle deficit (prices rising)
      if (tokensSold > tokensPerPeriod) {
        // See how much we oversold
        uint256 difference = sub(tokensSold, tokensPerPeriod);
        // See how much we can pay out of past surpluses
        uint256 fromSurplus = min(difference, tokenSurplus);
        // See how much we can pay out of new deficit
        uint256 toDeficit = sub(difference, fromSurplus);

        tokenSurplus = sub(tokenSurplus, fromSurplus);
        tokenDeficit = add(tokenDeficit, toDeficit);
      }

      tokensSold = 0;
      currPeriod++;
    }

    // In case we missed a whole period
    while (getCurrPeriod() > currPeriod) {
      pastIntakes[currPeriod] = 0;
      tokenSurplus = add(tokenSurplus, tokensPerPeriod);
      currPeriod++;
    }

    // Update the price
    if (newPeriod) {
      currPrice = wdiv(getAverageIntake(), tokensPerPeriod);
    }
  }

  function getPeriodLength() public view returns (uint256) {
    return periodLength;
  }

  function getTokensPerPeriod() public view returns (uint256) {
    return tokensPerPeriod;
  }

  function getMaxPerPeriod() public view returns (uint256) {
    return maxPerPeriod;
  }

  function getCurrPrice() public view returns (uint256) {
    return currPrice;
  }

  function getTokenSurplus() public view returns (uint256) {
    return tokenSurplus;
  }

  function getTokenDeficit() public view returns (uint256) {
    return tokenDeficit;
  }

  function getAvailable() public view returns (uint256) {
    return sub(maxPerPeriod, tokensSold);
  }

  // Internal

  function getAverageIntake() internal view returns (uint256) {
    uint256 sum;

    for (uint256 i; i < numPeriods; i++) {
      sum += pastIntakes[i];
    }

    return sum / numPeriods;
  }

  function getCurrPeriod() internal view returns (uint256) {
    return (now / periodLength) % numPeriods;
  }
}
