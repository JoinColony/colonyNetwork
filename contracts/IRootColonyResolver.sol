pragma solidity ^0.4.8;

import "./Modifiable.sol";
import "./Destructible.sol";


contract IRootColonyResolver is Destructible, Modifiable {

  address public rootColonyAddress;

  /// @notice this function takes an address (Supposedly, the RootColony address)
  /// @param rootColonyAddress the RootColony address
  function registerRootColony(address rootColonyAddress);
}
