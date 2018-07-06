pragma solidity ^0.4.23;

import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./TokenLockingStorage.sol";
import "../lib/dappsys/math.sol";


contract TokenLocking is TokenLockingStorage, DSMath {
  modifier onlyColony() {
    require(IColonyNetwork(colonyNetwork).isColony(msg.sender), "token-locking-sender-not-colony");
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

    userLocks[_token][msg.sender].balance = sub(userLocks[_token][msg.sender].balance, _amount);

    require(ERC20Extended(_token).transfer(msg.sender, _amount), "token-locking-transfer-failed");
  }

  function getTotalLockCount(address _token) public view returns (uint256) {
    return totalLockCount[_token];
  }

  function getUserLock(address _token, address _user) public view returns (uint256, uint256) {
    return (userLocks[_token][_user].lockCount, userLocks[_token][_user].balance);
  }
}
