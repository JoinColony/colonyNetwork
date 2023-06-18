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

pragma solidity 0.8.20; // ignore-swc-103
import "../../lib/dappsys/math.sol";

contract ScaleReputation is DSMath {
  // Note that scaleFactor should be a WAD.
  function scaleReputation(int256 reputationAmount, uint256 scaleFactor)
    internal
    pure
    returns (int256 scaledReputation)
  {
    if (reputationAmount == 0 || scaleFactor == 0) { return 0; }

    int256 sgnAmount = (reputationAmount >= 0) ? int256(1) : -1;
    int256 absAmount;

    if (reputationAmount == type(int256).min){
      absAmount = type(int256).max; // Off by one, but best we can do - probably gets capped anyway
    } else {
      absAmount = reputationAmount >= 0 ? reputationAmount : -reputationAmount;
    }

    // Guard against overflows during calculation with wmul
    if (type(uint256).max / scaleFactor < uint256(absAmount)) {
      scaledReputation = (sgnAmount == 1) ? type(int128).max : type(int128).min;
    } else {
      scaledReputation = int256(wmul(scaleFactor, uint256(absAmount))) * sgnAmount;
      // Cap inside the range of int128, as we do for all reputations
      scaledReputation = imax(type(int128).min, scaledReputation);
      scaledReputation = imin(type(int128).max, scaledReputation);
    }
  }
}
