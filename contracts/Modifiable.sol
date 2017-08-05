pragma solidity ^0.4.8;


contract Modifiable {

  /// @notice throw if an address is invalid
  /// @param _target the address to check
  modifier throwIfAddressIsInvalid(address _target) {
    if(_target == 0x0) { throw; }
    _;
  }

  /// @notice throw if the id is invalid
  /// @param _id the ID to validate
  modifier throwIfIsEmptyString(string _id) {
    if(bytes(_id).length == 0) { throw; }
    _;
  }

  /// @notice throw if the id is invalid
  /// @param _id the ID to validate
  modifier throwIfIsEmptyBytes32(bytes32 _id) {
    if(_id == "") { throw; }
    _;
  }
}
