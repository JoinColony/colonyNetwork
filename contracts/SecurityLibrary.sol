import "EternalStorage.sol";


library SecurityLibrary
{
  // Manages records for admins and owners stored in the format:
  // sha3('admin:', address) -> bool isUserAdmin , e.g. 0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> true

  enum UserRole { Owner, Admin }

  bytes32 constant owner = "security:owner:";
  bytes32 constant ownersCount = "security:ownersCount";
  bytes32 constant admin = "security:admin:";
  bytes32 constant adminsCount = "security:adminsCount";

  event PermissionAdded(address _user, uint _role);
  event PermissionRemoved(address _user, uint _role);

  function countUsersInRole(address _storageContract, uint _role)
  constant returns(uint256)
  {
    bytes32 roleCount = _role == uint(UserRole.Owner) ? ownersCount : adminsCount;
    return EternalStorage(_storageContract).getUIntValue(sha3(roleCount));
  }

  function userIsInRole(address _storageContract, address _user, uint _role)
  constant returns (bool)
  {
    bytes32 role = _role == uint(UserRole.Owner) ? owner : admin;
    return EternalStorage(_storageContract).getBooleanValue(sha3(role, _user));
  }

  function addUserToRole(address _storageContract, address _user, uint _role)
  {
    bytes32 role = _role == uint(UserRole.Owner) ? owner : admin;
    bytes32 roleCount = _role == uint(UserRole.Owner) ? ownersCount : adminsCount;

      // if user is part of this role already
    var userIsInRole = EternalStorage(_storageContract).getBooleanValue(sha3(role, _user));
    if (userIsInRole) { throw; }

    EternalStorage(_storageContract).setBooleanValue(sha3(role, _user), true);

    // Increment the counting in storage for this role
    var usersCount = EternalStorage(_storageContract).getUIntValue(sha3(roleCount));
    usersCount += 1;
    EternalStorage(_storageContract).setUIntValue(sha3(roleCount), usersCount);

    PermissionAdded(_user, _role);
  }

  function removeUserFromRole(address _storageContract, address _user, uint _role)
  {
    bytes32 role = _role == uint(UserRole.Owner) ? owner : admin;
    bytes32 roleCount = _role == uint(UserRole.Owner) ? ownersCount : adminsCount;

    // if user is doesnt belong to this role
    var userIsInRole = EternalStorage(_storageContract).getBooleanValue(sha3(role, _user));
    if (!userIsInRole) { throw; }

    // if there is only one owner, keep her/him :p
    // if they want to leave, they can kill the colony
    var isUserOwner = EternalStorage(_storageContract).getBooleanValue(sha3(owner, msg.sender));
    if (_role == uint(UserRole.Owner)) {
      if (!isUserOwner) { throw; }

      var countOwners = EternalStorage(_storageContract).getUIntValue(sha3(roleCount));
      if (countOwners == 1) { throw; }

    } else if (_role == uint(UserRole.Admin)) {

      // Admins can leave the colony at their own will but they cannot remove other admins
      if(msg.sender != _user && !isUserOwner) {
        throw;
      }
    }

    EternalStorage(_storageContract).deleteBooleanValue(sha3(role, _user));

    // Decrement the counting in storage for this role
    var usersCount = EternalStorage(_storageContract).getUIntValue(sha3(roleCount));
    usersCount -= 1;
    EternalStorage(_storageContract).setUIntValue(sha3(roleCount), usersCount);

    PermissionRemoved(_user, _role);
  }
}
