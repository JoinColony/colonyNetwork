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
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/math.sol";
import "./../common/EtherRouter.sol";
import "./../colony/IColony.sol";
import "./../colony/ColonyDataTypes.sol";


abstract contract ColonyExtension is DSAuth, DSMath {

  uint256 constant UINT256_MAX = 2**256 - 1;

  event ExtensionInitialised();

  address resolver; // Align storage with EtherRouter

  IColony colony;
  bool deprecated;

  modifier notDeprecated() {
    require(!deprecated, "colony-extension-deprecated");
    _;
  }

  function identifier() public pure virtual returns (bytes32);
  function version() public pure virtual returns (uint256);
  function install(address _colony) public virtual;
  function finishUpgrade() public virtual;
  function deprecate(bool _deprecated) public virtual;
  function uninstall() public virtual;

  function getCapabilityRoles(bytes4 _sig) public view virtual returns (bytes32) {
    return bytes32(0);
  }

  function getDeprecated() public view returns (bool) {
    return deprecated;
  }

  function getColony() public view returns(address) {
    return address(colony);
  }

}
