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

import "./IColony.sol";


/// @title MetaColony interface
/// @notice All publicly available functions are available here and registered to work with EtherRouter Network contract
contract IMetaColony is IColony {
  /// @notice Mints CLNY in the Meta Colony and transfers them to the colony network
  /// Only allowed to be called on the Meta Colony by the colony network
  /// @param _wad Amount to mint and transfer to the colony network
  function mintTokensForColonyNetwork(uint256 _wad) public;

  /// @notice Add a new global skill, under skill `_parentSkillId`
  /// @dev Calls `IColonyNetwork.addSkill`
  /// @param _parentSkillId Id of the skill under which the new skill will be added
  /// @return skillId Id of the added skill
  function addGlobalSkill(uint256 _parentSkillId) public returns (uint256 skillId);

  /// @notice Set the Colony Network fee inverse amount
  /// @dev Calls `IColonyNetwork.setFeeInverse`
  /// @param _feeInverse Nonzero amount for the fee inverse
  function setNetworkFeeInverse(uint256 _feeInverse) public;

  /// @notice Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members
  /// @dev Calls `IColonyNetwork.addColonyVersion`
  /// @param _version The new Colony contract version
  /// @param _resolver Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract
  function addNetworkColonyVersion(uint256 _version, address _resolver) public;
}