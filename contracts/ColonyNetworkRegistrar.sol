/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "./ens/ENS.sol";
import "./ColonyNetworkStorage.sol";


/// @title First-In-First-Served ENS Registrar
/// @notice A registrar that allocates subdomains to the first person to claim them.
/// @notice Source modified from https://github.com/ensdomains/ens/blob/master/contracts/FIFSRegistrar.sol
contract ColonyNetworkRegistrar is ColonyNetworkStorage {

  bytes32 constant USER_HASH = keccak256("user");
  bytes32 constant COLONY_HASH = keccak256("colony");

  modifier unowned(bytes32 node, bytes32 subnode) {
    address currentOwner = ENS(ens).owner(keccak256(abi.encodePacked(node, subnode)));
    require(currentOwner == 0);
    _;
  }

  event UserLabelRegistered(address indexed user, bytes32 label);
  event ColonyLabelRegistered(address indexed colony, bytes32 label);

  function setupRegistrar(address _ens, bytes32 _rootNode) public auth {
    ens = _ens;
    rootNode = _rootNode;
    userNode = keccak256(abi.encodePacked(rootNode, USER_HASH));
    colonyNode = keccak256(abi.encodePacked(rootNode, COLONY_HASH));
    ENS(ens).setSubnodeOwner(rootNode, USER_HASH, this);
    ENS(ens).setSubnodeOwner(rootNode, COLONY_HASH, this);
  }

  function registerUserLabel(bytes32 subnode)
  public
  unowned(userNode, subnode)
  {
    require(userLabels[msg.sender] == 0, "user-already-labeled");
    userLabels[msg.sender] = subnode;

    ENS(ens).setSubnodeOwner(userNode, subnode, msg.sender);
    emit UserLabelRegistered(msg.sender, subnode);
  }

  function registerColonyLabel(bytes32 subnode)
  public
  calledByColony
  unowned(colonyNode, subnode)
  {
    require(colonyLabels[msg.sender] == 0, "colony-already-labeled");

    colonyLabels[msg.sender] = subnode;
    ENS(ens).setSubnodeOwner(colonyNode, subnode, msg.sender);
    emit ColonyLabelRegistered(msg.sender, subnode);
  }

}
