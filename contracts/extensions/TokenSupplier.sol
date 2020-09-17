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

import "./../../lib/dappsys/auth.sol";
import "./../../lib/dappsys/math.sol";
import "./../colony/ColonyDataTypes.sol";
import "./../colony/IColony.sol";


contract TokenSupplier is DSMath, DSAuth {

  uint256 constant PERIOD = 1 days;

  // Events

  event TokenSupplyCeilingSet(uint256 tokenSupplyCeiling);
  event TokenIssuanceRateSet(uint256 tokenIssuanceRate);
  event TokensIssued(uint256 numTokens);

  IColony colony;

  constructor(address _colony) public {
    colony = IColony(_colony);
  }

  // Storage

  uint256 public tokenSupply;
  uint256 public tokenSupplyCeiling;
  uint256 public tokenIssuanceRate;
  uint256 public lastPinged;

  // Authed

  function initialise(uint256 _tokenSupplyCeiling, uint256 _tokenIssuanceRate) public auth {
    require(lastPinged == 0, "token-supplier-already-initialised");

    tokenSupplyCeiling = _tokenSupplyCeiling;
    tokenIssuanceRate = _tokenIssuanceRate;
    lastPinged = now;
  }

  function setTokenSupplyCeiling(uint256 _tokenSupplyCeiling) public {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "token-supplier-not-root");

    tokenSupplyCeiling = _tokenSupplyCeiling;

    emit TokenSupplyCeilingSet(tokenSupplyCeiling);
  }

  function setTokenIssuanceRate(uint256 _tokenIssuanceRate) public {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "token-supplier-not-root");

    tokenIssuanceRate = _tokenIssuanceRate;

    emit TokenIssuanceRateSet(tokenIssuanceRate);
  }

  // Public

  function issueTokens() public {
    uint256 newSupply = min(
      tokenSupplyCeiling - tokenSupply,
      wmul(tokenIssuanceRate, wdiv((now - lastPinged), PERIOD))
    );

    require(newSupply > 0, "token-supplier-nothing-to-issue");

    tokenSupply = add(tokenSupply, newSupply);
    lastPinged = now;

    assert(tokenSupply <= tokenSupplyCeiling);

    colony.mintTokens(newSupply);

    emit TokensIssued(newSupply);
  }

}
