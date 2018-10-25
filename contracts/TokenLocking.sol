pragma solidity ^0.4.23;

import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./IColony.sol";
import "./IReputationMiningCycle.sol";
import "./TokenLockingStorage.sol";
import "../lib/dappsys/math.sol";


contract TokenLocking is TokenLockingStorage, DSMath {
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

  modifier tokenNotLocked(address _token) {
    if (userLocks[_token][msg.sender].balance > 0) {
      require(userLocks[_token][msg.sender].lockCount == totalLockCount[_token], "colony-token-locking-token-locked");
    }
    _;
  }

  modifier hashNotSubmitted(address _token) {
    address clnyToken = IColony(IColonyNetwork(colonyNetwork).getMetaColony()).getToken();
    if (_token == clnyToken) {
      bytes32 submittedHash;
      (submittedHash,,,,,,,,,,) = IReputationMiningCycle(IColonyNetwork(colonyNetwork).getReputationMiningCycle(true)).getReputationHashSubmissions(msg.sender);
      require(submittedHash == 0x0, "colony-token-locking-hash-submitted");
    }
    _;
  }

  function setColonyNetwork(address _colonyNetwork) public auth {
    colonyNetwork = _colonyNetwork;
  }

  function getColonyNetwork() public view returns (address) {
    return colonyNetwork;
  }

  function lockToken(address _token) public calledByColony returns (uint256) {
    totalLockCount[_token] += 1;
    return totalLockCount[_token];
  }

  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public
  calledByColony
  {
    uint256 lockCountDelta = sub(_lockId, userLocks[_token][_user].lockCount);
    require(lockCountDelta != 0, "colony-token-already-unlocked");
    require(lockCountDelta == 1, "colony-token-locking-has-previous-active-locks");
    // If we want to unlock tokens at id greater than total lock count, we are doing something wrong
    assert(_lockId <= totalLockCount[_token]);
    userLocks[_token][_user].lockCount = _lockId;
  }

  function incrementLockCounterTo(address _token, uint256 _lockId) public {
    require(_lockId <= totalLockCount[_token] && _lockId > userLocks[_token][msg.sender].lockCount, "colony-token-locking-invalid-lock-id");
    userLocks[_token][msg.sender].lockCount = _lockId;
  }

  uint256 constant UINT192_MAX = 2**192 - 1; // Used for updating the deposit timestamp

  function deposit(address _token, uint256 _amount) public
  tokenNotLocked(_token)
  {
    require(_amount > 0, "colony-token-locking-invalid-amount");
    require(ERC20Extended(_token).transferFrom(msg.sender, address(this), _amount), "colony-token-locking-transfer-failed");

    Lock storage lock = userLocks[_token][msg.sender];

    uint256 prevWeight = lock.balance;
    uint256 currWeight = _amount;

    // Needed to prevent overflows in the timestamp calculation
    while ((prevWeight >= UINT192_MAX) || (currWeight >= UINT192_MAX)) {
      prevWeight /= 2;
      currWeight /= 2;
    }

    uint256 timestamp = add(mul(prevWeight, lock.timestamp), mul(currWeight, now)) / add(prevWeight, currWeight);

    userLocks[_token][msg.sender] = Lock(totalLockCount[_token], add(lock.balance, _amount), timestamp);
  }

  function withdraw(address _token, uint256 _amount) public
  tokenNotLocked(_token)
  hashNotSubmitted(_token)
  {
    require(_amount > 0, "colony-token-locking-invalid-amount");

    userLocks[_token][msg.sender].balance = sub(userLocks[_token][msg.sender].balance, _amount);

    require(ERC20Extended(_token).transfer(msg.sender, _amount), "colony-token-locking-transfer-failed");
  }

  function punishStakers(address[] _stakers, address _beneficiary, uint256 _amount) public onlyReputationMiningCycle {
    address clnyToken = IColony(IColonyNetwork(colonyNetwork).getMetaColony()).getToken();
    uint256 lostStake;
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    for (uint256 i = 0; i < _stakers.length; i++) {
      lostStake = min(userLocks[clnyToken][_stakers[i]].balance, _amount);
      userLocks[clnyToken][_stakers[i]].balance = sub(userLocks[clnyToken][_stakers[i]].balance, lostStake);
      userLocks[clnyToken][_beneficiary].balance = add(userLocks[clnyToken][_beneficiary].balance, lostStake);
      // TODO: Lose rep?
    }
  }

  function getTotalLockCount(address _token) public view returns (uint256) {
    return totalLockCount[_token];
  }

  function getUserLock(address _token, address _user) public view returns (uint256, uint256, uint256) {
    Lock storage lock = userLocks[_token][_user];
    return (lock.lockCount, lock.balance, lock.timestamp);
  }
}
