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

import "../extensions/ColonyExtension.sol";


contract TestExtension is ColonyExtension {
  function version() public pure returns (uint256);

  function install(address _colony) public auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  function finishUpgrade() public auth {}

  function uninstall() public auth {
    selfdestruct(address(uint160(address(colony))));
  }
}


contract TestExtension0 is TestExtension {
  function version() public pure returns (uint256) { return 0; }
}


contract TestExtension1 is TestExtension {
  function version() public pure returns (uint256) { return 1; }
  function sendEther() external payable {}
}


contract TestExtension2 is TestExtension {
  function version() public pure returns (uint256) { return 2; }
}
