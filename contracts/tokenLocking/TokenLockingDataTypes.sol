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


interface TokenLockingDataTypes {

  event ColonyNetworkSet(address colonyNetwork);
  event TokenLocked(address indexed token, address indexed lockedBy, uint256 lockCount);
  event UserTokenUnlocked(address token, address user, uint256 lockId);
  event UserTokenDeposited(address token, address user, uint256 amount);
  event UserTokenClaimed(address token, address user, uint256 amount);
  event UserTokenTransferred(address token, address user, address recipient, uint256 amount);
  event UserTokenWithdrawn(address token, address user, uint256 amount);
  event UserTokenObligated(address token, address user, address obligatedBy, uint256 amount);
  event UserTokenDeobligated(address token, address user, address obligatedBy, uint256 amount);
  event UserTokenApproved(address token, address user, address approvedBy, uint256 amount);
  event StakeTransferred(address token, address by, address from, address to, uint256 amount);

  struct Lock {
    // User's lock count
    uint256 lockCount;
    // Deposited balance
    uint256 balance;
    // Weighted average of deposit timestamps (no longer used)
    uint256 DEPRECATED_timestamp; // solhint-disable-line var-name-mixedcase
    // Pending balance (from failed transfers), can claim with a forced deposit
    uint256 pendingBalance;
  }
}
