pragma solidity ^0.4.23;

import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./IColony.sol";
import "./IReputationMiningCycle.sol";
import "./TokenLockingStorage.sol";
import "../lib/dappsys/math.sol";


contract TokenLocking is TokenLockingStorage, DSMath {
  modifier onlyColony() {
    require(IColonyNetwork(colonyNetwork).isColony(msg.sender), "token-locking-sender-not-colony");
    _;
  }

  modifier onlyReputationMiningCycle() {
    require(msg.sender == IColonyNetwork(colonyNetwork).getReputationMiningCycle(true));
    _;
  }

  modifier tokenNotLocked(address _token) {
    if (userLocks[_token][msg.sender].balance > 0) {
      require(userLocks[_token][msg.sender].lockCount == totalLockCount[_token], "token-locking-token-locked");
    }
    _;
  }

  function setColonyNetwork(address _colonyNetwork) public auth {
    colonyNetwork = _colonyNetwork;
  }

  function getColonyNetwork() public view returns (address) {
    return colonyNetwork;
  }

  function lockToken(address _token) public onlyColony returns (uint256) {
    totalLockCount[_token] += 1;
    return totalLockCount[_token];
  }

  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public onlyColony {
    require(sub(_lockId, userLocks[_token][_user].lockCount) == 1, "token-locking-invalid-lock-id");
    // If we want to unlock tokens at id greater than total lock count, we are doing something wrong
    assert(_lockId <= totalLockCount[_token]);
    userLocks[_token][_user].lockCount = _lockId;
  }

  function incrementLockCounterTo(address _token, uint256 _lockId) public {
    require(_lockId <= totalLockCount[_token] && _lockId > userLocks[_token][msg.sender].lockCount, "token-locking-invalid-lock-id");
    userLocks[_token][msg.sender].lockCount = _lockId;
  }

  function deposit(address _token, uint256 _amount) public
  tokenNotLocked(_token)
  {
    require(_amount > 0, "token-locking-invalid-amount");

    require(ERC20Extended(_token).transferFrom(msg.sender, address(this), _amount), "token-locking-transfer-failed");

    userLocks[_token][msg.sender] = Lock(totalLockCount[_token], add(userLocks[_token][msg.sender].balance, _amount));
  }

  function withdraw(address _token, uint256 _amount) public
  tokenNotLocked(_token)
  {
    require(_amount > 0, "token-locking-invalid-amount");

    address clnyToken = IColony(IColonyNetwork(colonyNetwork).getMetaColony()).getToken();
    if (_token == clnyToken) {
      bytes32 submittedHash;
      (submittedHash,,,,,,,,,,) = IReputationMiningCycle(IColonyNetwork(colonyNetwork).getReputationMiningCycle(true)).reputationHashSubmissions(msg.sender);
      require(submittedHash == 0x0);
    }

    userLocks[_token][msg.sender].balance = sub(userLocks[_token][msg.sender].balance, _amount);

    require(ERC20Extended(_token).transfer(msg.sender, _amount), "token-locking-transfer-failed");
  }

  function punishStakers(address[] _users) public onlyReputationMiningCycle {
    address clnyToken = IColony(IColonyNetwork(colonyNetwork).getMetaColony()).getToken();
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    for (uint256 i = 0; i < _users.length; i++) {
      // This is pretty harsh! Are we happy with this?
      // Alternative: lose more than they would have gained for backing the right hash.
      userLocks[clnyToken][_users[i]].balance = 0;
      // TODO: Where do these staked tokens go? Maybe split between the person who did the 'invalidate' transaction
      // and the colony network?
      // TODO: Lose rep?
    }
  }

  function getTotalLockCount(address _token) public view returns (uint256) {
    return totalLockCount[_token];
  }

  function getUserLock(address _token, address _user) public view returns (uint256, uint256) {
    return (userLocks[_token][_user].lockCount, userLocks[_token][_user].balance);
  }
}
