pragma solidity ^0.4.15;

import "./Authority.sol";
import "./Colony.sol";
import "./Token.sol";


contract ColonyNetwork {
  uint256 _colonyCount;
  mapping (uint => address) _coloniesIndex;
  mapping (bytes32 => address) _colonies;

  function createColony(bytes32 name) {
    var token = new Token();
    var colony = new Colony(name, token);
    var authority = new Authority(colony);
    colony.setAuthority(authority);
    // Transfer ownership to colony creator
    colony.setOwner(msg.sender);
    authority.setOwner(msg.sender);
    token.setOwner(colony);
    _colonyCount += 1;
    _coloniesIndex[_colonyCount] = colony;
    _colonies[name] = colony;
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
    var colony = new Colony("", 0x0);
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
