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

    uint256 numTokens = min(_numTokens, getNumAvailable());
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

  // Make sure this is called at least once during the averaging period
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
      currPeriod = nextPeriod(currPeriod);
    }

    // In case we missed multiple periods
    while (getCurrPeriod() != currPeriod) {
      pastIntakes[currPeriod] = 0;
      tokenSurplus = add(tokenSurplus, tokensPerPeriod);
      currPeriod = nextPeriod(currPeriod);
    }

    // Update the price
    if (newPeriod) {
      currPrice = wdiv(getAverageIntake(), tokensPerPeriod);
    }
  }

  function getPeriodLength() public view returns (uint256) {
    return periodLength;
  }

  function getNumPeriods() public view returns (uint256) {
    return numPeriods;
  }

  function getTokensPerPeriod() public view returns (uint256) {
    return tokensPerPeriod;
  }

  function getMaxPerPeriod() public view returns (uint256) {
    return maxPerPeriod;
  }

  function getCurrPrice() public view returns (uint256) {
    if (currPeriod == getCurrPeriod()) {
      return currPrice;
    } else {
      uint256 virtualSum = pastIntakes[getCurrPeriod()];
      uint256 virtualPeriod = nextPeriod(getCurrPeriod());
      uint256 virtualCurrPeriod = nextPeriod(currPeriod);

      while (virtualPeriod != getCurrPeriod()) {
        if (virtualPeriod == currPeriod) {
          virtualSum += currIntake;
        } else if (virtualPeriod == virtualCurrPeriod) {
          virtualCurrPeriod = nextPeriod(virtualCurrPeriod);
        } else {
          virtualSum += pastIntakes[virtualPeriod];
        }
        virtualPeriod = nextPeriod(virtualPeriod);
      }

      uint256 virtualAverageIntake = virtualSum / numPeriods;
      return wdiv(virtualAverageIntake, tokensPerPeriod);
    }
  }

  function getNumAvailable() public view returns (uint256) {
    if (currPeriod == getCurrPeriod()) {
      return sub(maxPerPeriod, tokensSold);
    } else {
      return maxPerPeriod;
    }
  }

  function getTokenSurplus() public view returns (uint256) {
    uint256 virtualTokenSurplus;
    uint256 x;
    (virtualTokenSurplus, x) = getTokenSurplusAndDeficit();
    return virtualTokenSurplus;
  }

  function getTokenDeficit() public view returns (uint256) {
    uint256 x;
    uint256 virtualTokenDeficit;
    (x, virtualTokenDeficit) = getTokenSurplusAndDeficit();
    return virtualTokenDeficit;
  }

  // Internal

  function getTokenSurplusAndDeficit() internal view returns (uint256, uint256) {
    uint256 virtualPeriod = currPeriod;
    uint256 virtualTokenSurplus = tokenSurplus;
    uint256 virtualTokenDeficit = tokenDeficit;

    while (virtualPeriod != getCurrPeriod()) {
      virtualTokenSurplus = add(virtualTokenSurplus, tokensPerPeriod);
      virtualPeriod = nextPeriod(virtualPeriod);
    }

    if (tokensSold <= tokensPerPeriod) {
      virtualTokenSurplus = add(virtualTokenSurplus, sub(tokensPerPeriod, tokensSold));
    } else {
      virtualTokenDeficit = add(virtualTokenDeficit, sub(tokensSold, tokensPerPeriod));
    }

    if (virtualTokenSurplus >= virtualTokenDeficit) {
      return (sub(virtualTokenSurplus, virtualTokenDeficit), 0);
    } else {
      return (0, sub(virtualTokenDeficit, virtualTokenSurplus));
    }
  }

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

  function nextPeriod(uint256 _period) internal view returns (uint256) {
    return (_period + 1) % numPeriods;
  }
}
