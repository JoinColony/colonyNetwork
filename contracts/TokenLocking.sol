pragma solidity ^0.4.23;

import "./ERC20Extended.sol";
import "./IColonyNetwork.sol";
import "./TokenLockingStorage.sol";
import "../lib/dappsys/math.sol";

contract TokenLocking is TokenLockingStorage, DSMath {
  modifier tokenNotLocked(address _token) {
    require(userTokenLocks[_token][msg.sender].count == totalTokenLockCount[_token]);
    _;
  }

  modifier onlyColony() {
    require(IColonyNetwork(colonyNetwork).isColony(msg.sender), "token-locking-sender-not-colony");
    _;
  }


  function setColonyNetwork(address _colonyNetwork) public auth {
    colonyNetwork = _colonyNetwork;
  }

  // Used for testing purposes
  function getColonyNetwork() public view returns (address) {
    return colonyNetwork;
  }

  function lockToken(address _token) public onlyColony {
    totalTokenLockCount[_token] += 1;
  }

  function unlockTokenForUser(address _token, address _user) public onlyColony {
    // This should never throw if you are using it right, so it can't be tested
    assert(userTokenLocks[_token][_user].count < totalTokenLockCount[_token]);
    userTokenLocks[_token][_user].count += 1;
  }

  function deposit(address _token, uint256 _amount) public
  tokenNotLocked(_token)
  {
    // If we transfer before we increment `depositedBalances`, user won't be able to take advantage of re-entrance
    require(ERC20Extended(_token).transferFrom(msg.sender, address(this), _amount));

    userTokenLocks[_token][msg.sender].amount = add(userTokenLocks[_token][msg.sender].amount, _amount);
  }

  function withdraw(address _token, uint256 _amount) public
  tokenNotLocked(_token)
  {
    userTokenLocks[_token][msg.sender].amount = sub(userTokenLocks[_token][msg.sender].amount, _amount);

    require(ERC20Extended(_token).transfer(msg.sender, _amount));
  }

  function getUserDepositedBalance(address _token, address _user) public view returns (uint256) {
    return userTokenLocks[_token][_user].amount;
  }

  function usersTokensLocked(address _token, address _user) public view returns (bool) {
    return userTokenLocks[_token][_user].count < totalTokenLockCount[_token];
  }

  function getTotalTokenLockCount(address _token) public view returns (uint256) {
    return totalTokenLockCount[_token];
  }

  function getUserTokenLockCount(address _token, address _user) public view returns (uint256) {
    return userTokenLocks[_token][_user].count;
  }
}
