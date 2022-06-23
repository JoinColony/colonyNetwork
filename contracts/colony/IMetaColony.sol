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

pragma solidity >=0.7.3; // ignore-swc-103
pragma experimental "ABIEncoderV2";

import "./IColony.sol";


/// @title MetaColony interface
/// @notice All externally available functions are available here and registered to work with EtherRouter Network contract
interface IMetaColony is IColony {
  /// @notice Mints CLNY in the Meta Colony and transfers them to the colony network.
  /// Only allowed to be called on the Meta Colony by the colony network.
  /// @param _wad Amount to mint and transfer to the colony network
  function mintTokensForColonyNetwork(uint256 _wad) external;

  /// @notice Add a new global skill.
  /// @dev Calls `IColonyNetwork.addSkill`.
  /// @return skillId Id of the added skill
  function addGlobalSkill() external returns (uint256 skillId);

  /// @notice Mark a global skill as deprecated which stops new tasks and payments from using it.
  /// @dev Calls `IColonyNetwork.deprecateSkill`.
  /// @param _skillId Id of the added skill
  function deprecateGlobalSkill(uint256 _skillId) external;

  /// @notice Set the Colony Network fee inverse amount.
  /// @dev Calls `IColonyNetwork.setFeeInverse`.
  /// @param _feeInverse Nonzero amount for the fee inverse
  function setNetworkFeeInverse(uint256 _feeInverse) external;

  /// @notice Set a token's status in the payout whitelist on the Colony Network
  /// @param _token The token being set
  /// @param _status The whitelist status
  function setPayoutWhitelist(address _token, bool _status) external;

  /// @notice Adds a new Colony contract version and the address of associated `_resolver` contract. Secured function to authorised members.
  /// @dev Calls `IColonyNetwork.addColonyVersion`.
  /// @param _version The new Colony contract version
  /// @param _resolver Address of the `Resolver` contract which will be used with the underlying `EtherRouter` contract
  function addNetworkColonyVersion(uint256 _version, address _resolver) external;

  /// @notice Called to set the total per-cycle reputation reward, which will be split between all miners.
  /// @dev Calls the corresponding function on the ColonyNetwork.
  /// @param _amount The CLNY awarded per mining cycle to the miners
  function setReputationMiningCycleReward(uint256 _amount) external;

  /// @notice Add a new extension/version to the Extensions repository.
  /// @dev Calls `IColonyNetwork.addExtensionToNetwork`.
  /// @dev The extension version is queried from the resolver itself.
  /// @param _extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param _resolver The deployed resolver containing the extension contract logic
  function addExtensionToNetwork(bytes32 _extensionId, address _resolver) external;
}
