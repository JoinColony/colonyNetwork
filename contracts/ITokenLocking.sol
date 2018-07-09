pragma solidity ^0.4.23;


contract ITokenLocking {

  /// @notice Set the ColonyNetwork contract address
  /// @dev ColonyNetwork is used for checking if sender is a colony created on colony network
  /// @param _colonyNetwork Address of the ColonyNetwork
  function setColonyNetwork(address _colonyNetwork) public;

  /// @notice Get ColonyNetwork address
  /// @return ColonyNetwork address
  function getColonyNetwork() public view returns (address networkAddress);

  /// @notice Locks everyones' tokens on `_token` address
  /// @param _token Address of the token we want to lock
  /// @return Updated total token lock count
  function lockToken(address _token) public returns (uint256 lockCount);

  /// @notice Increments the lock counter to `_lockId` for the `_user` if user's lock count is less than `_lockId` by 1.
  /// Can only be called by a colony
  /// @param _token Address of the token we want to unlock
  /// @param _user Address of the user
  /// @param _lockId Id of the lock we want to increment to
  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public;

  /// @notice Increments sender's lock count to `_lockId`.
  /// @param _token Address of the token we want to increment lock count for
  /// @param _lockId Id of the lock user wants to increment to
  function incrementLockCounterTo(address _token, uint256 _lockId) public;

  /// @notice Deposit `_amount` of colony tokens. Can only be called if user tokens are not locked
  /// Before calling this function user has to allow that their tokens can be transferred by token locking contract
  /// @param _amount Amount to deposit
  function deposit(address _token, uint256 _amount) public;

  /// @notice Withdraw `_amount` of deposited tokens. Can only be called if user tokens are not locked
  /// @param _amount Amount to withdraw
  function withdraw(address _token, uint256 _amount) public;

  /// @notice Get global lock count for a specific token
  /// @param _token Address of the token
  /// @return Global token lock count
  function getTotalLockCount(address _token) public view returns (uint256 lockCount);

  /// @notice Get user token lock info (lock count and deposited amount)
  /// @param _token Address of the token
  /// @param _user Address of the user
  /// @return User's token lock count
  /// @return User's deposited amount
  function getUserLock(address _token, address _user) public view returns (uint256 lockCount, uint256 amount);
}
