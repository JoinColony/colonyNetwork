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

import "../EtherRouter.sol";
import "../IColony.sol";


contract ColonyExtension is EtherRouter {
  IColony colony;

  function install(address _colony, address _resolver) public auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    setResolver(_resolver);
  }

  function uninstall(address payable _beneficiary) public auth {
    require(uninstallable(), "extension-not-uninstallable");

    selfdestruct(_beneficiary);
  }

  // This can be overridden on a per-extension basis to reflect extension state
  function uninstallable() public view returns (bool) {
    return true;
  }
}
