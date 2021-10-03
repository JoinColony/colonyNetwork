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
pragma experimental "ABIEncoderV2";

import "./../../lib/dappsys/auth.sol";
import "./../tokenLocking/TokenLockingDataTypes.sol";

// ignore-file-swc-131
// ignore-file-swc-108


contract TokenLockingStorage is TokenLockingDataTypes, DSAuth {
  address resolver;

  // Address of ColonyNetwork contract
  address colonyNetwork;

  // Maps token to user to Lock struct
  mapping (address => mapping (address => Lock)) userLocks;

  // Maps token to total token lock count. If user token lock count is the same as global, that means that their tokens are unlocked.
  // If user token lock count is less than global, that means that their tokens are locked.
  // User's lock count should never be greater than total lock count.
  mapping (address => uint256) totalLockCount;

  // Used for stake management ([user][token]{[colony]} => amount)
  mapping (address => mapping (address => mapping (address => uint256))) approvals;
  mapping (address => mapping (address => mapping (address => uint256))) obligations;
  mapping (address => mapping (address => uint256)) totalObligations;

  // Keep track of which colony is placing which lock ([token][lockId] => colony)
  mapping (address => mapping (uint256 => address)) lockers;

  mapping(address => uint256) metatransactionNonces;
}
