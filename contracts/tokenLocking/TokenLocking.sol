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
pragma experimental "ABIEncoderV2";

import "./../../lib/dappsys/math.sol";
import "./../colony/IMetaColony.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../common/ERC20Extended.sol";
import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./../tokenLocking/TokenLockingStorage.sol";


contract TokenLocking is TokenLockingStorage, DSMath { // ignore-swc-123
  modifier calledByColony() {
    require(IColonyNetwork(colonyNetwork).isColony(msg.sender), "colony-token-locking-sender-not-colony");
    _;
  }

  modifier onlyReputationMiningCycle() {
    require(
      msg.sender == IColonyNetwork(colonyNetwork).getReputationMiningCycle(true),
      "colony-token-locking-sender-not-reputation-mining-cycle");
    _;
  }

  modifier tokenNotLocked(address _token, bool _force) {
    if (_force) {
      userLocks[_token][msg.sender].lockCount = totalLockCount[_token];
    }
    require(isTokenUnlocked(_token, msg.sender), "colony-token-locking-token-locked");
    _;
  }

  // Prevent reputation miners from withdrawing stake during the mining process.
  modifier hashNotSubmitted(address _token) {
    address clnyToken = IMetaColony(IColonyNetwork(colonyNetwork).getMetaColony()).getToken();
    if (_token == clnyToken) {
      bytes32 submissionHash = IReputationMiningCycle(IColonyNetwork(colonyNetwork).getReputationMiningCycle(true)).getReputationHashSubmission(msg.sender).proposedNewRootHash;
      require(submissionHash == 0x0, "colony-token-locking-hash-submitted");
    }
    _;
  }

  modifier notObligated(address _token, uint256 _amount) {
    require(
      sub(userLocks[_token][msg.sender].balance, _amount) >= totalObligations[msg.sender][_token],
      "colony-token-locking-excess-obligation"
    );
    _;
  }

  // Public functions

  function setColonyNetwork(address _colonyNetwork) public auth {
    colonyNetwork = _colonyNetwork;

    emit ColonyNetworkSet(_colonyNetwork);
  }

  function getColonyNetwork() public view returns (address) {
    return colonyNetwork;
  }

  function lockToken(address _token) public calledByColony returns (uint256) {
    totalLockCount[_token] += 1;

    emit TokenLocked(_token, totalLockCount[_token]);

    return totalLockCount[_token];
  }

  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public
  calledByColony
  {
    // If we want to unlock tokens at id greater than total lock count, we are doing something wrong
    require(_lockId <= totalLockCount[_token], "colony-token-invalid-lockid");

    // These checks should happen in this order, as the second is stricter than the first
    uint256 lockCountDelta = sub(_lockId, userLocks[_token][_user].lockCount);
    require(lockCountDelta != 0, "colony-token-already-unlocked");
    require(lockCountDelta == 1, "colony-token-locking-has-previous-active-locks");

    userLocks[_token][_user].lockCount = _lockId; // Basically just a ++

    emit UserTokenUnlocked(_token, _user, _lockId);
  }

  function incrementLockCounterTo(address _token, uint256 _lockId) public {
    require(_lockId <= totalLockCount[_token] && _lockId > userLocks[_token][msg.sender].lockCount, "colony-token-locking-invalid-lock-id");
    userLocks[_token][msg.sender].lockCount = _lockId;
  }

  function deposit(address _token, uint256 _amount) public {
    require(ERC20Extended(_token).transferFrom(msg.sender, address(this), _amount), "colony-token-locking-transfer-failed"); // ignore-swc-123

    makeConditionalDeposit(_token, _amount, msg.sender);

    Lock storage lock = userLocks[_token][msg.sender];
    emit UserTokenDeposited(_token, msg.sender, lock.balance, lock.timestamp);
  }

  function depositFor(address _token, uint256 _amount, address _recipient) public {
    require(ERC20Extended(_token).transferFrom(msg.sender, address(this), _amount), "colony-token-locking-transfer-failed"); // ignore-swc-123

    makeConditionalDeposit(_token, _amount, _recipient);

    Lock storage lock = userLocks[_token][_recipient];
    emit UserTokenDeposited(_token, _recipient, lock.balance, lock.timestamp);
  }

  function claim(address _token, bool _force) public
  tokenNotLocked(_token, _force)
  {
    Lock storage lock = userLocks[_token][msg.sender];

    lock.timestamp = getNewTimestamp(lock.balance, lock.pendingBalance, lock.timestamp, now);
    lock.balance = add(lock.balance, lock.pendingBalance);
    lock.pendingBalance = 0;

    emit UserTokenClaimed(_token, msg.sender, lock.balance, lock.timestamp);
  }

  function transfer(address _token, uint256 _amount, address _recipient, bool _force) public
  hashNotSubmitted(_token)
  notObligated(_token, _amount)
  tokenNotLocked(_token, _force)
  {
    Lock storage userLock = userLocks[_token][msg.sender];
    userLock.balance = sub(userLock.balance, _amount);
    makeConditionalDeposit(_token, _amount, _recipient);

    emit UserTokenTransferred(_token, msg.sender, _recipient, _amount);
  }

  // Deprecated interface
  function withdraw(address _token, uint256 _amount) public {
    withdraw(_token, _amount, false);
  }

  function withdraw(address _token, uint256 _amount, bool _force) public
  hashNotSubmitted(_token)
  notObligated(_token, _amount)
  tokenNotLocked(_token, _force)
  {
    Lock storage lock = userLocks[_token][msg.sender];
    lock.balance = sub(lock.balance, _amount);

    require(ERC20Extended(_token).transfer(msg.sender, _amount), "colony-token-locking-transfer-failed");

    emit UserTokenWithdrawn(_token, msg.sender, _amount);
  }

  function punishStakers(address[] memory _stakers, address _beneficiary, uint256 _amount) public onlyReputationMiningCycle {
    address clnyToken = IMetaColony(IColonyNetwork(colonyNetwork).getMetaColony()).getToken();
    uint256 lostStake;
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    for (uint256 i = 0; i < _stakers.length; i++) {
      lostStake = min(userLocks[clnyToken][_stakers[i]].balance, _amount);
      userLocks[clnyToken][_stakers[i]].balance = sub(userLocks[clnyToken][_stakers[i]].balance, lostStake);
      userLocks[clnyToken][_beneficiary].balance = add(userLocks[clnyToken][_beneficiary].balance, lostStake);
      // TODO: Lose rep?

      emit ReputationMinerPenalised(_stakers[i], _beneficiary, lostStake);
    }
  }

  function approveStake(address _user, uint256 _amount, address _token) public calledByColony() {
    approvals[_user][_token][msg.sender] = add(approvals[_user][_token][msg.sender], _amount);
  }

  function obligateStake(address _user, uint256 _amount, address _token) public calledByColony() {
    approvals[_user][_token][msg.sender] = sub(approvals[_user][_token][msg.sender], _amount);
    obligations[_user][_token][msg.sender] = add(obligations[_user][_token][msg.sender], _amount);
    totalObligations[_user][_token] = add(totalObligations[_user][_token], _amount);

    require(userLocks[_token][_user].balance >= totalObligations[_user][_token], "colony-token-locking-insufficient-deposit");
  }

  function deobligateStake(address _user, uint256 _amount, address _token) public calledByColony() {
    obligations[_user][_token][msg.sender] = sub(obligations[_user][_token][msg.sender], _amount);
    totalObligations[_user][_token] = sub(totalObligations[_user][_token], _amount);
  }

  function transferStake(address _user, uint256 _amount, address _token, address _recipient) public calledByColony() {
    obligations[_user][_token][msg.sender] = sub(obligations[_user][_token][msg.sender], _amount);
    totalObligations[_user][_token] = sub(totalObligations[_user][_token], _amount);

    // Transfer the the tokens
    Lock storage userLock = userLocks[_token][_user];
    userLock.balance = sub(userLock.balance, _amount);
    makeConditionalDeposit(_token, _amount, _recipient);
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

  // Internal functions

  function makeConditionalDeposit(address _token, uint256 _amount, address _user) internal {
    Lock storage userLock = userLocks[_token][_user];
    if (isTokenUnlocked(_token, _user)) {
      userLock.timestamp = getNewTimestamp(userLock.balance, _amount, userLock.timestamp, now);
      userLock.balance = add(userLock.balance, _amount);
    } else {
      userLock.pendingBalance = add(userLock.pendingBalance, _amount);
    }
  }

  function isTokenUnlocked(address _token, address _user) internal view returns (bool) {
    return userLocks[_token][_user].lockCount == totalLockCount[_token];
  }

  uint256 constant UINT192_MAX = 2**192 - 1; // Used for updating the deposit timestamp

  function getNewTimestamp(uint256 _prevWeight, uint256 _currWeight, uint256 _prevTime, uint256 _currTime) internal pure returns (uint256) {
    uint256 prevWeight = _prevWeight;
    uint256 currWeight = _currWeight;

    // Needed to prevent overflows in the timestamp calculation
    while ((prevWeight >= UINT192_MAX) || (currWeight >= UINT192_MAX)) {
      prevWeight /= 2;
      currWeight /= 2;
    }

    return add(mul(prevWeight, _prevTime), mul(currWeight, _currTime)) / add(prevWeight, currWeight);
  }
}
