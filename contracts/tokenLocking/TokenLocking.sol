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
    if (userLocks[_token][msg.sender].balance > 0 || userLocks[_token][msg.sender].pendingBalance > 0) {
      require(userLocks[_token][msg.sender].lockCount == totalLockCount[_token], "colony-token-locking-token-locked");
    }
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

  function deposit(address _token, uint256 _amount, bool _force) public
  tokenNotLocked(_token, _force)
  {
    require(_amount > 0, "colony-token-locking-invalid-amount");
    require(ERC20Extended(_token).transferFrom(msg.sender, address(this), _amount), "colony-token-locking-transfer-failed"); // ignore-swc-123

    Lock storage lock = userLocks[_token][msg.sender];
    uint256 newAmount = add(lock.balance, _amount);
    uint256 newTimestamp = getNewTimestamp(lock.balance, _amount, lock.timestamp, now);
    userLocks[_token][msg.sender] = Lock(totalLockCount[_token], newAmount, newTimestamp, lock.pendingBalance);

    emit UserTokenDeposited(_token, msg.sender, lock.balance, lock.timestamp);
  }

  function claim(address _token, bool _force) public
  tokenNotLocked(_token, _force)
  {
    Lock storage lock = userLocks[_token][msg.sender];
    require(lock.pendingBalance > 0, "colony-token-locking-no-pending");

    lock.timestamp = getNewTimestamp(lock.balance, lock.pendingBalance, lock.timestamp, now);
    lock.balance = add(lock.balance, lock.pendingBalance);
    lock.pendingBalance = 0;

    emit UserTokenClaimed(_token, msg.sender, lock.balance, lock.timestamp);
  }

  function transfer(address _token, uint256 _amount, address _recipient, bool _force) public
  tokenNotLocked(_token, _force)
  hashNotSubmitted(_token)
  {
    require(_amount > 0, "colony-token-locking-invalid-amount");

    Lock storage userLock = userLocks[_token][msg.sender];
    Lock storage recipientLock = userLocks[_token][_recipient];
    userLock.balance = sub(userLock.balance, _amount);
    recipientLock.pendingBalance = add(recipientLock.pendingBalance, _amount);

    emit UserTokenTransferred(_token, msg.sender, _recipient, _amount);
  }

  function withdraw(address _token, uint256 _amount, bool _force) public
  tokenNotLocked(_token, _force)
  hashNotSubmitted(_token)
  {
    require(_amount > 0, "colony-token-locking-invalid-amount");

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

  function approveStake(address _colony, uint256 _amount) public {
    address token = IColony(_colony).getToken();

    approvals[msg.sender][token][_colony] = add(approvals[msg.sender][token][_colony], _amount);
  }

  function obligateStake(address _user, uint256 _amount) public calledByColony() {
    address token = IColony(msg.sender).getToken();

    approvals[_user][token][msg.sender] = sub(approvals[_user][token][msg.sender], _amount);
    obligations[_user][token][msg.sender] = add(obligations[_user][token][msg.sender], _amount);
    totalObligations[_user][token] = add(totalObligations[_user][token], _amount);

    require(userLocks[token][_user].balance >= totalObligations[_user][token], "colony-token-locking-insufficient-deposit");
  }

  function deobligateStake(address _user, uint256 _amount) public calledByColony() {
    address token = IColony(msg.sender).getToken();

    obligations[_user][token][msg.sender] = sub(obligations[_user][token][msg.sender], _amount);
    totalObligations[_user][token] = sub(totalObligations[_user][token], _amount);
  }

  function slashStake(address _user, uint256 _amount, address _beneficiary) public calledByColony() {
    address token = IColony(msg.sender).getToken();

    obligations[_user][token][msg.sender] = sub(obligations[_user][token][msg.sender], _amount);
    totalObligations[_user][token] = sub(totalObligations[_user][token], _amount);

    // Transfer the the tokens
    Lock storage userLock = userLocks[token][_user];
    Lock storage beneficiaryLock = userLocks[token][_beneficiary];
    userLock.balance = sub(userLock.balance, _amount);
    beneficiaryLock.pendingBalance = add(beneficiaryLock.pendingBalance, _amount);
  }

  function getTotalLockCount(address _token) public view returns (uint256) {
    return totalLockCount[_token];
  }

  function getUserLock(address _token, address _user) public view returns (Lock memory lock) {
    lock = userLocks[_token][_user];
  }

  // Internal functions

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
