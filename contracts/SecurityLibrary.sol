import "EternalStorage.sol";


library SecurityLibrary
{
  event AdminAdded(address _user);

  event AdminRemoved(address _user);

  // Manages records for admins stored in the format:
  // sha3('admin:', address) -> bool isUserAdmin , e.g. 0xd91cf6dac04d456edc5fcb6659dd8ddedbb26661 -> true

  function getAdminsCount(address _storageContract)
  constant returns(uint256)
  {
    return EternalStorage(_storageContract).getUIntValue(sha3("AdminsCount"));
  }

  function addAdmin(address _storageContract, address _user)
  {
    var userIsAdmin = EternalStorage(_storageContract).getBooleanValue(sha3("admin:', _user));
    if(userIsAdmin) { throw; }

    EternalStorage(_storageContract).setBooleanValue(sha3("admin:", _user), true);

    // Increment the admins count in storage
    var adminsCount = EternalStorage(_storageContract).getUIntValue(sha3("AdminsCount"));
    EternalStorage(_storageContract).setUIntValue(sha3("AdminsCount"), adminsCount + 1);

    AdminAdded(_user);
  }

  function removeAdmin(address _storageContract, address _user)
  {
    var userIsAdmin = EternalStorage(_storageContract).getBooleanValue(sha3("admin:", _user));
    if(!userIsAdmin) { throw; }

    var adminsCount = EternalStorage(_storageContract).getUIntValue(sha3("AdminsCount"));
    if (adminsCount == 1) { throw; }

    EternalStorage(_storageContract).deleteBooleanValue(sha3("admin:", _user));

    // Decrement the admins count in storage
    adminsCount -= 1;
    EternalStorage(_storageContract).setUIntValue(sha3("AdminsCount"), adminsCount);

    AdminRemoved(_user);
  }

  function isUserAdmin(address _storageContract, address _user)
  constant returns (bool)
  {
    return EternalStorage(_storageContract).getBooleanValue(sha3("admin:", _user));
  }
}
