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
contract ColonyNetworkENS is ColonyNetworkStorage {

  bytes32 constant USER_HASH = keccak256("user");
  bytes32 constant COLONY_HASH = keccak256("colony");

  modifier unowned(bytes32 node, string domainName) {
    address currentOwner = ENS(ens).owner(keccak256(abi.encodePacked(node, keccak256(abi.encodePacked(domainName)))));
    require(currentOwner == 0, "colony-label-already-owned");
    _;
  }

  event UserLabelRegistered(address indexed user, bytes32 label);
  event ColonyLabelRegistered(address indexed colony, bytes32 label);

  bytes4 constant INTERFACE_META_ID = 0x01ffc9a7;
  bytes4 constant ADDR_INTERFACE_ID = 0x3b3b57de;

  function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
    return (interfaceID == INTERFACE_META_ID ||
      interfaceID == ADDR_INTERFACE_ID );
  }

  function setupRegistrar(address _ens, bytes32 _rootNode) public auth stoppable {
    ens = _ens;
    rootNode = _rootNode;
    userNode = keccak256(abi.encodePacked(rootNode, USER_HASH));
    colonyNode = keccak256(abi.encodePacked(rootNode, COLONY_HASH));
    ENS(ens).setSubnodeOwner(rootNode, USER_HASH, this);
    ENS(ens).setSubnodeOwner(rootNode, COLONY_HASH, this);
  }

  function registerUserLabel(string username, string orbitdb)
  public
  stoppable
  // NB there is no way to call this as a colony yet - this is just future proofing us once there is
  notCalledByColony
  unowned(userNode, username)
  {
    require(bytes(username).length > 0, "colony-user-label-invalid");
    require(bytes(userLabels[msg.sender]).length == 0, "colony-user-label-already-owned");
    bytes32 subnode = keccak256(abi.encodePacked(username));
    ENS(ens).setSubnodeOwner(userNode, subnode, this);
    bytes32 node = keccak256(abi.encodePacked(userNode, subnode));
    ENS(ens).setResolver(node, this);
    records[node].addr = msg.sender;
    records[node].orbitdb = orbitdb;
    userLabels[msg.sender] = username;
    emit UserLabelRegistered(msg.sender, subnode);
  }

  function registerColonyLabel(string colonyName)
  public
  calledByColony
  unowned(colonyNode, colonyName)
  stoppable
  {
    require(bytes(colonyName).length > 0, "colony-colony-label-invalid");
    require(bytes(colonyLabels[msg.sender]).length == 0, "colony-already-labeled");
    bytes32 subnode = keccak256(abi.encodePacked(colonyName));

    ENS(ens).setSubnodeOwner(colonyNode, subnode, this);
    bytes32 node = keccak256(abi.encodePacked(colonyNode, subnode));
    ENS(ens).setResolver(node, this);
    records[node].addr = msg.sender;
    colonyLabels[msg.sender] = colonyName;
    emit ColonyLabelRegistered(msg.sender, subnode);
  }

  function getProfileDBAddress(bytes32 node) public view returns (string) {
    return records[node].orbitdb;
  }

  function lookupRegisteredENSDomain(address addr) public view returns(string) {
    if (bytes(userLabels[addr]).length != 0) {
      return string(abi.encodePacked(userLabels[addr], ".user.joincolony.eth"));
    } else if (bytes(colonyLabels[addr]).length != 0) {
      return string(abi.encodePacked(colonyLabels[addr], ".colony.joincolony.eth"));
    } else {
      return "";
    }
  }

  function addr(bytes32 node) public view returns (address) {
    return records[node].addr;
  }

}
