pragma solidity ^0.4.8;

import "./Modifiable.sol";
import "./Destructible.sol";


contract IRootColonyResolver is Destructible, Modifiable {

  address public rootColonyAddress;

  /// @notice this function takes an address (Supposedly, the ColonyNetwork address)
  /// @param rootColonyAddress the ColonyNetwork address
  function registerRootColony(address rootColonyAddress);
}
