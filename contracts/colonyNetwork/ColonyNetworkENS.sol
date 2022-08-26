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

pragma solidity 0.7.3;

import "./../ens/ENS.sol";
import "./ColonyNetworkStorage.sol";
import "./../common/MultiChain.sol";


/// @title First-In-First-Served ENS Registrar
/// @notice A registrar that allocates subdomains to the first person to claim them.
/// @notice Source modified from https://github.com/ensdomains/ens/blob/master/contracts/FIFSRegistrar.sol
contract ColonyNetworkENS is ColonyNetworkStorage, MultiChain {

  bytes32 constant USER_HASH = keccak256("user");
  bytes32 constant COLONY_HASH = keccak256("colony");

  modifier unowned(bytes32 node, string memory domainName) {
    address currentOwner = ENS(ens).owner(keccak256(abi.encodePacked(node, keccak256(abi.encodePacked(domainName)))));
    require(currentOwner == address(0x0), "colony-label-already-owned");
    _;
  }

  bytes4 constant INTERFACE_META_ID = 0x01ffc9a7;
  bytes4 constant ADDR_INTERFACE_ID = 0x3b3b57de;

  function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
    return (interfaceID == INTERFACE_META_ID ||
      interfaceID == ADDR_INTERFACE_ID );
  }

  function setupRegistrar(address _ens, bytes32 _rootNode) public stoppable auth {
    require(_ens != address(0x0), "colony-ens-cannot-be-zero");

    ens = _ens;
    rootNode = _rootNode;

    userNode = keccak256(abi.encodePacked(rootNode, USER_HASH));
    colonyNode = keccak256(abi.encodePacked(rootNode, COLONY_HASH));

    emit RegistrarInitialised(_ens, _rootNode);
  }

  function registerUserLabel(string memory username, string memory orbitdb)
  public
  stoppable
  // NB there is no way to call this as a colony yet - this is just future proofing us once there is
  notCalledByColony
  unowned(userNode, username)
  {
    require(bytes(username).length > 0, "colony-user-label-invalid");
    require(bytes(userLabels[msgSender()]).length == 0, "colony-user-label-already-owned");

    bytes32 subnode = keccak256(abi.encodePacked(username));
    bytes32 node = keccak256(abi.encodePacked(userNode, subnode));

    userLabels[msgSender()] = username;
    records[node].addr = msgSender();
    records[node].orbitdb = orbitdb;

    ENS(ens).setSubnodeOwner(userNode, subnode, address(this));
    ENS(ens).setResolver(node, address(this));

    emit UserLabelRegistered(msgSender(), subnode);
  }

  function registerColonyLabel(string memory colonyName, string memory orbitdb)
  public
  calledByColony
  unowned(colonyNode, colonyName)
  stoppable
  {
    require(bytes(colonyName).length > 0, "colony-colony-label-invalid");
    require(bytes(colonyLabels[msgSender()]).length == 0, "colony-already-labeled");

    bytes32 subnode = keccak256(abi.encodePacked(colonyName));
    bytes32 node = keccak256(abi.encodePacked(colonyNode, subnode));

    colonyLabels[msgSender()] = colonyName;
    records[node].addr = msgSender();
    records[node].orbitdb = orbitdb;

    ENS(ens).setSubnodeOwner(colonyNode, subnode, address(this));
    ENS(ens).setResolver(node, address(this));

    emit ColonyLabelRegistered(msgSender(), subnode);
  }

  function updateColonyOrbitDB(string memory orbitdb)
  public
  calledByColony
  stoppable
  {
    string storage label = colonyLabels[msgSender()];
    require(bytes(label).length > 0, "colony-colony-not-labeled");
    bytes32 subnode = keccak256(abi.encodePacked(label));
    bytes32 node = keccak256(abi.encodePacked(colonyNode, subnode));
    records[node].orbitdb = orbitdb;
  }

  function updateUserOrbitDB(string memory orbitdb)
  public
  notCalledByColony
  stoppable
  {
    string storage label = userLabels[msgSender()];
    require(bytes(label).length > 0, "colony-user-not-labeled");
    bytes32 subnode = keccak256(abi.encodePacked(label));
    bytes32 node = keccak256(abi.encodePacked(userNode, subnode));
    records[node].orbitdb = orbitdb;
  }

  function getProfileDBAddress(bytes32 node) public view returns (string memory orbitDB) {
    return records[node].orbitdb;
  }

  function lookupRegisteredENSDomain(address addr) public view returns(string memory domain) {
    if (bytes(userLabels[addr]).length != 0) {
      return string(abi.encodePacked(userLabels[addr], ".user.", getGlobalENSDomain()));
    } else if (bytes(colonyLabels[addr]).length != 0) {
      return string(abi.encodePacked(colonyLabels[addr], ".colony.", getGlobalENSDomain()));
    } else {
      return "";
    }
  }

  function addr(bytes32 node) public view returns (address) {
    return records[node].addr;
  }

  function getENSRegistrar() public view returns (address) {
    return ens;
  }

  function getGlobalENSDomain() internal view returns (string memory) {
    if (isMainnet()) {
      return "joincolony.eth";
    } else if (isGoerli()) {
      return "joincolony.test";
    } else if (isXdai()) {
      return "joincolony.colonyxdai";
    }
    require(false, "colony-network-unsupported-network");
  }
}
