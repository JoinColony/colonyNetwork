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

pragma solidity ^0.5.8;
pragma experimental ABIEncoderV2;

import "./../colony/ColonyDataTypes.sol";
import "./../colony/IColony.sol";
import "./ExtensionFactory.sol";
import "./FundingQueue.sol";


contract FundingQueueFactory is ExtensionFactory, ColonyDataTypes { // ignore-swc-123
  mapping (address => FundingQueue) public deployedExtensions;

  modifier isRoot(address _colony) {
    require(IColony(_colony).hasUserRole(msg.sender, 1, ColonyRole.Root), "colony-extension-user-not-root"); // ignore-swc-123
    _;
  }

  function deployExtension(address _colony) external isRoot(_colony) {
    require(deployedExtensions[_colony] == FundingQueue(0x00), "colony-extension-already-deployed");
    FundingQueue newExtensionAddress = new FundingQueue(_colony);
    deployedExtensions[_colony] = newExtensionAddress;

    emit ExtensionDeployed("FundingQueue", _colony, address(newExtensionAddress));
  }

  function removeExtension(address _colony) external isRoot(_colony) {
    deployedExtensions[_colony] = FundingQueue(0x00);

    emit ExtensionRemoved("FundingQueue", _colony);
  }
}
