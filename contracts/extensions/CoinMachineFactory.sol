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

pragma solidity 0.5.8;
pragma experimental ABIEncoderV2;

import "./../colony/ColonyAuthority.sol";
import "./../colony/ColonyDataTypes.sol";
import "./../colony/IColony.sol";
import "./ExtensionFactory.sol";
import "./CoinMachine.sol";


contract CoinMachineFactory is ExtensionFactory, ColonyDataTypes { // ignore-swc-123
  mapping (address => CoinMachine) public deployedExtensions;

  function deployExtension(address _colony) external {
    require(IColony(_colony).hasUserRole(msg.sender, 1, ColonyRole.Root), "colony-extension-user-not-root"); // ignore-swc-123
    require(deployedExtensions[_colony] == CoinMachine(0x00), "colony-extension-already-deployed");
    CoinMachine newExtensionAddress = new CoinMachine(_colony);
    deployedExtensions[_colony] = newExtensionAddress;
    emit ExtensionDeployed("CoinMachine", _colony, address(newExtensionAddress));
  }

  function removeExtension(address _colony) external {
    require(IColony(_colony).hasUserRole(msg.sender, 1, ColonyRole.Root), "colony-extension-user-not-root"); // ignore-swc-123
    deployedExtensions[_colony] = CoinMachine(0x00);
    emit ExtensionRemoved("CoinMachine", _colony);
  }
}
