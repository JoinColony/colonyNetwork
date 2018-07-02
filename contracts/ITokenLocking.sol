pragma solidity ^0.4.23;


contract ITokenLocking {

  /// @notice Set the ColonyNetwork contract address
  /// @dev ColonyNetwork is used for checking if sender is a colony created on colony network
  /// @param _colonyNetwork Address of the ColonyNetwork
  function setColonyNetwork(address _colonyNetwork) public;

  /// @notice Get ColonyNetwork address
  /// @return ColonyNetwork address
  function getColonyNetwork() public view returns (address);

  /// @notice Locks everyones' tokens on `_token` address
  /// @param _token Address of the token we want to lock
  /// @return Current total token lock count
  function lockToken(address _token) public returns (uint256);

  /// @notice Increments the lock counter for the `_user`. Can only be called by a colony
  /// @param _token Address of the token we want to unlock
  /// @param _user Address of the user
  function unlockTokenForUser(address _token, address _user, uint256 _lockId) public;

  /// @notice Increments senders lock count to `_lockId`.
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

  /// @notice Get deposited balance by `_user`
  /// @param _user Address of the user
  /// @return Users deposited amount
  function getUserDepositedBalance(address _token, address _user) public view returns(uint256);

  /// @notice Get global token lock count
  /// @param _token Address of the token
  /// @return Global token lock count
  function getTotalLockCount(address _token) public view returns (uint256);

  /// @notice Get user token lock count
  /// @param _token Address of the token
  /// @param _user Address of the user
  /// @return User token lock count
  function getUserLockCount(address _token, address _user) public view returns (uint256);
}
