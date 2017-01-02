pragma solidity ^0.4.0;

import "EternalStorage.sol";


library SecurityLibrary {
  // Manages records for admins and owners stored in the format:
  // keccak256('security:owner:', address) -> bool isUserOwner , e.g. 0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> true
  // keccak256('security:admin:', address) -> bool isUserAdmin , e.g. 0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> true
  // keccak256('security:ownersCount') -> uint256 owners count , e.g. security:ownersCount -> 2
  // keccak256('security:adminsCount') -> uint256 admins count , e.g. adminsCount -> 15

  enum UserRole { Owner, Admin }

  bytes32 constant OWNER = "security:owner:";
  bytes32 constant OWNERS_COUNT = "security:ownersCount";
  bytes32 constant ADMIN = "security:admin:";
  bytes32 constant ADMINS_COUNT = "security:adminsCount";

  event PermissionAdded(address _user, uint _role);
  event PermissionRemoved(address _user, uint _role);

  function countUsersInRole(address _storageContract, uint _role)
  constant returns(uint256)
  {
    bytes32 roleCount = _role == uint(UserRole.Owner) ? OWNERS_COUNT : ADMINS_COUNT;
    return EternalStorage(_storageContract).getUIntValue(keccak256(roleCount));
  }

  function userIsInRole(address _storageContract, address _user, uint _role)
  constant returns (bool)
  {
    bytes32 role = _role == uint(UserRole.Owner) ? OWNER : ADMIN;
    return EternalStorage(_storageContract).getBooleanValue(keccak256(role, _user));
  }

  function addUserToRole(address _storageContract, address _user, uint _role) {
    bytes32 role = _role == uint(UserRole.Owner) ? OWNER : ADMIN;
    bytes32 roleCount = _role == uint(UserRole.Owner) ? OWNERS_COUNT : ADMINS_COUNT;

      // if user is part of this role already
    var userIsInRole = EternalStorage(_storageContract).getBooleanValue(keccak256(role, _user));
    if (userIsInRole) { throw; }

    EternalStorage(_storageContract).setBooleanValue(keccak256(role, _user), true);

    // Increment the counting in storage for this role
    var usersCount = EternalStorage(_storageContract).getUIntValue(keccak256(roleCount));
    usersCount += 1;
    EternalStorage(_storageContract).setUIntValue(keccak256(roleCount), usersCount);

    PermissionAdded(_user, _role);
  }

  function removeUserFromRole(address _storageContract, address _user, uint _role) {
    bytes32 role = _role == uint(UserRole.Owner) ? OWNER : ADMIN;
    bytes32 roleCount = _role == uint(UserRole.Owner) ? OWNERS_COUNT : ADMINS_COUNT;

    // if user is doesnt belong to this role
    var userIsInRole = EternalStorage(_storageContract).getBooleanValue(keccak256(role, _user));
    if (!userIsInRole) { throw; }

    // Ensure this is NOT the last owner leaving the colony
    var isUserOwner = EternalStorage(_storageContract).getBooleanValue(keccak256(OWNER, msg.sender));
    if (_role == uint(UserRole.Owner)) {
      if (!isUserOwner) { throw; }

      var countOwners = EternalStorage(_storageContract).getUIntValue(keccak256(roleCount));
      if (countOwners == 1) { throw; }
    }
    EternalStorage(_storageContract).deleteBooleanValue(keccak256(role, _user));

    // Decrement the counting in storage for this role
    var usersCount = EternalStorage(_storageContract).getUIntValue(keccak256(roleCount));
    usersCount -= 1;
    EternalStorage(_storageContract).setUIntValue(keccak256(roleCount), usersCount);

    PermissionRemoved(_user, _role);
  }
}
