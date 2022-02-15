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

import "./../../lib/dappsys/math.sol";
import "./../colony/IMetaColony.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../common/ERC20Extended.sol";
import "./../common/BasicMetaTransaction.sol";
import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./../tokenLocking/TokenLockingStorage.sol";


contract TokenLocking is TokenLockingStorage, DSMath, BasicMetaTransaction { // ignore-swc-123
  modifier calledByColonyOrNetwork() {
    require(
      colonyNetwork == msgSender() || IColonyNetwork(colonyNetwork).isColony(msgSender()),
      "colony-token-locking-sender-not-colony-or-network"
    );
    _;
  }

  modifier tokenNotLocked(address _token, bool _force) {
    if (_force) {
      userLocks[_token][msgSender()].lockCount = totalLockCount[_token];
    }
    require(isTokenUnlocked(_token, msgSender()), "colony-token-locking-token-locked");
    _;
  }

  modifier notObligated(address _token, uint256 _amount) {
    require(
      sub(userLocks[_token][msgSender()].balance, _amount) >= totalObligations[msgSender()][_token],
      "colony-token-locking-excess-obligation"
    );
    _;
  }

  // Public functions

  function getMetatransactionNonce(address userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[userAddress];
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user] = add(metatransactionNonces[user], 1);
  }

  function setColonyNetwork(address _colonyNetwork) public auth {
    require(_colonyNetwork != address(0x0), "colony-token-locking-network-cannot-be-zero");

    colonyNetwork = _colonyNetwork;

    emit ColonyNetworkSet(_colonyNetwork);
  }

  function getColonyNetwork() public view returns (address) {
    return colonyNetwork;
  }

  function lockToken(address _token) public calledByColonyOrNetwork returns (uint256) {
    totalLockCount[_token] += 1;
    lockers[_token][totalLockCount[_token]] = msgSender();

    emit TokenLocked(_token, msgSender(), totalLockCount[_token]);

    return totalLockCount[_token];
  }

  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public
  calledByColonyOrNetwork
  {
    require(lockers[_token][_lockId] == msgSender(), "colony-token-locking-not-locker");

    // If we want to unlock tokens at id greater than total lock count, we are doing something wrong
    require(_lockId <= totalLockCount[_token], "colony-token-invalid-lockid");

    // These checks should happen in this order, as the second is stricter than the first
    uint256 lockCountDelta = sub(_lockId, userLocks[_token][_user].lockCount);
    require(lockCountDelta != 0, "colony-token-locking-already-unlocked");
    require(lockCountDelta == 1, "colony-token-locking-has-previous-active-locks");

    userLocks[_token][_user].lockCount = _lockId; // Basically just a ++

    emit UserTokenUnlocked(_token, _user, _lockId);
  }

  function incrementLockCounterTo(address _token, uint256 _lockId) public {
    require(_lockId <= totalLockCount[_token] && _lockId > userLocks[_token][msgSender()].lockCount, "colony-token-locking-invalid-lock-id");
    userLocks[_token][msgSender()].lockCount = _lockId;
  }

  // Deprecated interface
  function deposit(address _token, uint256 _amount) public {
    deposit(_token, _amount, false);
  }

  function deposit(address _token, uint256 _amount, bool _force) public tokenNotLocked(_token, _force) {
    Lock storage lock = userLocks[_token][msgSender()];
    lock.balance = add(lock.balance, _amount);

    // Handle the pendingBalance, if any (idempotent operation)
    if (_force) {
      lock.balance = add(lock.balance, lock.pendingBalance);
      delete lock.pendingBalance;
    }

    // Actually claim the tokens
    require(ERC20Extended(_token).transferFrom(msgSender(), address(this), _amount), "colony-token-locking-transfer-failed"); // ignore-swc-123

    emit UserTokenDeposited(_token, msgSender(), lock.balance);
  }

  function depositFor(address _token, uint256 _amount, address _recipient) public {
    require(ERC20Extended(_token).transferFrom(msgSender(), address(this), _amount), "colony-token-locking-transfer-failed"); // ignore-swc-123

    makeConditionalDeposit(_token, _amount, _recipient);

    emit UserTokenDeposited(_token, _recipient, userLocks[_token][_recipient].balance);
  }

  function transfer(address _token, uint256 _amount, address _recipient, bool _force) public
  notObligated(_token, _amount)
  tokenNotLocked(_token, _force)
  {
    Lock storage userLock = userLocks[_token][msgSender()];
    userLock.balance = sub(userLock.balance, _amount);

    makeConditionalDeposit(_token, _amount, _recipient);

    emit UserTokenTransferred(_token, msgSender(), _recipient, _amount);
  }

  // Deprecated interface
  function withdraw(address _token, uint256 _amount) public {
    withdraw(_token, _amount, false);
  }

  function withdraw(address _token, uint256 _amount, bool _force) public
  notObligated(_token, _amount)
  tokenNotLocked(_token, _force)
  {
    Lock storage lock = userLocks[_token][msgSender()];
    lock.balance = sub(lock.balance, _amount);

    require(ERC20Extended(_token).transfer(msgSender(), _amount), "colony-token-locking-transfer-failed");

    emit UserTokenWithdrawn(_token, msgSender(), _amount);
  }

  function approveStake(address _user, uint256 _amount, address _token) public calledByColonyOrNetwork() {
    approvals[_user][_token][msgSender()] = add(approvals[_user][_token][msgSender()], _amount);

    emit UserTokenApproved(_token, _user, msgSender(), _amount);
  }

  function obligateStake(address _user, uint256 _amount, address _token) public calledByColonyOrNetwork() {
    approvals[_user][_token][msgSender()] = sub(approvals[_user][_token][msgSender()], _amount);
    obligations[_user][_token][msgSender()] = add(obligations[_user][_token][msgSender()], _amount);
    totalObligations[_user][_token] = add(totalObligations[_user][_token], _amount);

    require(userLocks[_token][_user].balance >= totalObligations[_user][_token], "colony-token-locking-insufficient-deposit");

    emit UserTokenObligated(_token, _user, msgSender(), _amount);
  }

  function deobligateStake(address _user, uint256 _amount, address _token) public calledByColonyOrNetwork() {
    obligations[_user][_token][msgSender()] = sub(obligations[_user][_token][msgSender()], _amount);
    totalObligations[_user][_token] = sub(totalObligations[_user][_token], _amount);

    emit UserTokenDeobligated(_token, _user, msgSender(), _amount);
  }

  function transferStake(address _user, uint256 _amount, address _token, address _recipient) public calledByColonyOrNetwork() {
    obligations[_user][_token][msgSender()] = sub(obligations[_user][_token][msgSender()], _amount);
    totalObligations[_user][_token] = sub(totalObligations[_user][_token], _amount);

    // Transfer the the tokens
    Lock storage userLock = userLocks[_token][_user];
    userLock.balance = sub(userLock.balance, _amount);

    makeConditionalDeposit(_token, _amount, _recipient);

    emit StakeTransferred(_token, msgSender(), _user, _recipient, _amount);
  }

  function reward(address _recipient, uint256 _amount) public pure { // solhint-disable-line no-empty-blocks

  }

  function getTotalLockCount(address _token) public view returns (uint256) {
    return totalLockCount[_token];
  }

  function getUserLock(address _token, address _user) public view returns (Lock memory lock) {
    lock = userLocks[_token][_user];
  }

  function getTotalObligation(address _user, address _token) public view returns (uint256) {
    return totalObligations[_user][_token];
  }

  function getApproval(address _user, address _token, address _obligator) public view returns (uint256) {
    return approvals[_user][_token][_obligator];
  }

  function getObligation(address _user, address _token, address _obligator) public view returns (uint256) {
    return obligations[_user][_token][_obligator];
  }

  // Internal functions

  // slither-disable-next-line reentrancy-no-eth
  function makeConditionalDeposit(address _token, uint256 _amount, address _user) internal {
    Lock storage userLock = userLocks[_token][_user];
    if (isTokenUnlocked(_token, _user)) {
      userLock.balance = add(userLock.balance, _amount);
    } else {
      // If the transfer fails (for any reason), add tokens to pendingBalance
      // slither-disable-next-line unchecked-transfer
      try ERC20Extended(_token).transfer(_user, _amount) returns (bool success) {
        if (!success) {
          userLock.pendingBalance = add(userLock.pendingBalance, _amount);
        }
      } catch {
        userLock.pendingBalance = add(userLock.pendingBalance, _amount);
      }
    }
  }

  function isTokenUnlocked(address _token, address _user) internal view returns (bool) {
    return userLocks[_token][_user].lockCount == totalLockCount[_token];
  }
}
