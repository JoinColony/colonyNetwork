// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.23;
pragma experimental ABIEncoderV2;

import { TestExtensionBase } from "./TestExtensionBase.sol";

contract TestVotingToken is TestExtensionBase {
  function identifier() public pure override returns (bytes32) {
    return keccak256("VotingToken");
  }

  function version() public pure override returns (uint256) {
    return 1;
  }

  function lockToken() public returns (uint256) {
    return colony.lockToken();
  }

  function unlockTokenForUser(address _user, uint256 _lockId) public {
    colony.unlockTokenForUser(_user, _lockId);
  }
}