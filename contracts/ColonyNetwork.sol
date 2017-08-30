pragma solidity ^0.4.15;

import "./Colony.sol";


contract ColonyNetwork {
  uint256 _colonyCount;
  mapping (uint => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;

  function createColony(bytes32 name) {
    var colonyAddress = new Colony(name);
    _colonyCount += 1;
    _coloniesIndex[_colonyCount] = colonyAddress;
    _colonies[name] = colonyAddress;
  }

  // Returns the address of a Colony by index
  function getColony(bytes32 _name)
  constant returns (address)
  {
    return _colonies[_name];
  }

  function getColonyAt(uint _idx)
  constant returns (address)
  {
    return _coloniesIndex[_idx];
  }

  function getLatestColonyVersion()
  constant returns (uint256)
  {
    var colony = new Colony("");
    return colony.version();
  }

  /// @notice this function returns the amount of colonies created
  /// @return the amount of colonies created
  function countColonies()
  constant returns (uint256)
  {
    return _colonyCount;
  }

  function ()
  payable
  { }
}
