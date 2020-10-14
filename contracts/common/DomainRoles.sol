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

pragma solidity 0.7.3; // ignore-swc-103

import "./../../lib/dappsys/roles.sol";


contract DomainRoles is DSRoles {
  mapping(address=>mapping(uint256=>bytes32)) internal userDomainRoles;

  // New function signatures taking arbitrary domains

  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return userDomainRoles[who][where];
  }

  function setUserRole(address who, uint256 where, uint8 role, bool enabled) public auth {
    bytes32 lastRoles = userDomainRoles[who][where];
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    if (enabled) {
      userDomainRoles[who][where] = lastRoles | shifted;
    } else {
      userDomainRoles[who][where] = lastRoles & BITNOT(shifted);
    }
  }

  function hasUserRole(address who, uint256 where, uint8 role) public view returns (bool) {
    bytes32 roles = getUserRoles(who, where);
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    return bytes32(0) != roles & shifted;
  }

  function canCall(address caller, uint256 where, address code, bytes4 sig) public view returns (bool) {
    bytes32 hasRoles = getUserRoles(caller, where);
    bytes32 needsOneOf = getCapabilityRoles(code, sig);
    return bytes32(0) != hasRoles & needsOneOf;
  }

  function canCallOnlyBecause(address caller, uint256 where, uint8 role, address code, bytes4 sig) public view returns (bool) {
    bytes32 hasRoles = getUserRoles(caller, where);
    bytes32 needsOneOf = getCapabilityRoles(code, sig);
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    // See if the permission comes from a *specific* role
    return bytes32(0) == (needsOneOf & hasRoles) ^ shifted;
  }

  // Support old function signatures for root domain

  function setUserRole(address who, uint8 role, bool enabled) public override auth {
    return setUserRole(who, 1, role, enabled);
  }

  function hasUserRole(address who, uint8 role) public view override returns (bool) {
    return hasUserRole(who, 1, role);
  }

  function canCall(address caller, address code, bytes4 sig) public view override returns (bool) {
    return canCall(caller, 1, code, sig);
  }

}
