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

pragma solidity 0.8.20;
pragma experimental ABIEncoderV2;
import "./../common/IBasicMetaTransaction.sol";

interface IColonyExtension is IBasicMetaTransaction {

  function identifier() external pure returns (bytes32);
  function version() external pure virtual returns (uint256);
  function install(address _colony) external virtual;
  function finishUpgrade() external virtual;
  function deprecate(bool _deprecated) external virtual;
  function uninstall() external virtual;

  function getCapabilityRoles(bytes4 _sig) external view virtual returns (bytes32);

  function getDeprecated() external view returns (bool);

  function getColony() external view returns(address);

  function multicall(bytes[] calldata) external virtual returns (bytes [] memory results);
}
