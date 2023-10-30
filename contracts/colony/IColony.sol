// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity >=0.8.21; // ignore-swc-103
pragma experimental ABIEncoderV2;

import { IRecovery } from "./../common/IRecovery.sol";
import { IBasicMetaTransaction } from "./../common/IBasicMetaTransaction.sol";
import { IMulticall } from "./../common/IMulticall.sol";
import { ColonyDataTypes } from "./ColonyDataTypes.sol";

interface IColony is ColonyDataTypes, IRecovery, IBasicMetaTransaction, IMulticall {
  // Implemented in DSAuth.sol
  /// @notice Get the `ColonyAuthority` for the colony.
  /// @return colonyAuthority The `ColonyAuthority` contract address
  function authority() external view returns (address colonyAuthority);

  /// @notice Get the colony `owner` address. This should be address(0x0) at all times.
  /// @dev Used for testing.
  /// @return colonyOwner Address of the colony owner
  function owner() external view returns (address colonyOwner);

  // Implemented in Colony.sol
  /// @notice Get the Colony contract version.
  /// Starts from 1 and is incremented with every deployed contract change.
  /// @return colonyVersion Version number
  function version() external pure returns (uint256 colonyVersion);

  /// @notice Upgrades a colony to a new Colony contract version `_newVersion`.
  /// @dev Downgrades are not allowed, i.e. `_newVersion` should be higher than the currect colony version.
  /// @param _newVersion The target version for the upgrade
  function upgrade(uint _newVersion) external;

  /// @notice A function to be called after an upgrade has been done from v2 to v3.
  /// @dev Can only be called by the colony itself, and only expected to be called as part of the `upgrade()` call. Required to
  /// be external so it can be an external call.
  function finishUpgrade() external;

  /// @notice Returns the colony network address set on the Colony.
  /// @dev The colonyNetworkAddress we read here is set once, during `initialiseColony`.
  /// @return colonyNetwork The address of Colony Network instance
  function getColonyNetwork() external view returns (address colonyNetwork);

  /// @notice Get the colony token.
  /// @return tokenAddress Address of the token contract
  function getToken() external view returns (address tokenAddress);

  /// @notice @deprecated
  /// @notice Execute arbitrary transaction on behalf of the Colony
  /// @param _to Contract to receive the function call (cannot be this contract, network or token locking)
  /// @param _action Bytes array encoding the function call and arguments
  /// @return success Boolean indicating whether the transaction succeeded
  function makeArbitraryTransaction(
    address _to,
    bytes memory _action
  ) external returns (bool success);

  /// @notice Execute arbitrary transactions on behalf of the Colony in series
  /// @param _targets Array of addressed to be targeted
  /// @param _actions Array of Bytes arrays encoding the function calls and arguments
  /// @param _strict Boolean indicating whether if one transaction fails, the whole call to this function should fail.
  /// @return success Boolean indicating whether the transactions succeeded
  function makeArbitraryTransactions(
    address[] memory _targets,
    bytes[] memory _actions,
    bool _strict
  ) external returns (bool success);

  /// @notice Executes a single arbitrary transaction
  /// @dev Only callable by the colony itself. If you wish to use this functionality, you should
  /// use the makeAbitraryTransactions function
  /// @param _target Contract to receive the function call
  /// @param _action Bytes array encoding the function call and arguments
  /// @return success Boolean indicating whether the transactions succeeded
  function makeSingleArbitraryTransaction(
    address _target,
    bytes memory _action
  ) external returns (bool success);

  /// @notice Emit a metadata string for a transaction
  /// @param _txHash Hash of transaction being annotated (0x0 for current tx)
  /// @param _metadata String of metadata for tx
  function annotateTransaction(bytes32 _txHash, string memory _metadata) external;

  /// @notice Set new colony root role.
  /// Can be called by root role only.
  /// @param _user User we want to give an root role to
  /// @param _setTo The state of the role permission (true assign the permission, false revokes it)
  function setRootRole(address _user, bool _setTo) external;

  /// @notice Set new colony arbitration role.
  /// Can be called by root role or architecture role.
  /// @param _permissionDomainId Domain in which the caller has root role
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _user User we want to give an arbitration role to
  /// @param _domainId Domain in which we are giving user the role
  /// @param _setTo The state of the role permission (true assign the permission, false revokes it)
  function setArbitrationRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) external;

  /// @notice Set new colony architecture role.
  /// Can be called by root role or architecture role.
  /// @param _permissionDomainId Domain in which the caller has root/architecture role
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _user User we want to give an architecture role to
  /// @param _domainId Domain in which we are giving user the role
  /// @param _setTo The state of the role permission (true assign the permission, false revokes it)
  function setArchitectureRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) external;

  /// @notice Set new colony funding role.
  /// Can be called by root role or architecture role.
  /// @param _permissionDomainId Domain in which the caller has root/architecture role
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _user User we want to give an funding role to
  /// @param _domainId Domain in which we are giving user the role
  /// @param _setTo The state of the role permission (true assign the permission, false revokes it)
  function setFundingRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) external;

  /// @notice Set new colony admin role.
  /// Can be called by root role or architecture role.
  /// @param _permissionDomainId Domain in which the caller has root/architecture role
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _user User we want to give an admin role to
  /// @param _domainId Domain in which we are giving user the role
  /// @param _setTo The state of the role permission (true assign the permission, false revokes it)
  function setAdministrationRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) external;

  /// @notice Set several roles in one transaction.
  /// Can be called by root role or architecture role.
  /// @param _permissionDomainId Domain in which the caller has root/architecture role
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _user User we want to give a role to
  /// @param _domainId Domain in which we are giving user the role
  /// @param _roles Byte array representing the desired role setting (1 for on, 0 for off)
  function setUserRoles(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bytes32 _roles
  ) external;

  /// @notice Check whether a given user has a given role for the colony.
  /// Calls the function of the same name on the colony's authority contract.
  /// @param _user The user whose role we want to check
  /// @param _domainId The domain where we want to check for the role
  /// @param _role The role we want to check for
  /// @return hasRole Boolean indicating whether the given user has the given role in domain
  function hasUserRole(
    address _user,
    uint256 _domainId,
    ColonyRole _role
  ) external view returns (bool hasRole);

  /// @notice Check whether a given user has a given role for the colony, in a child domain.
  /// Calls the function of the same name on the colony's authority contract and an internal inheritance validator function
  /// @param _user The user whose role we want to check
  /// @param _domainId Domain in which the caller has the role
  /// @param _role The role we want to check for
  /// @param _childSkillIndex The index that the `_childDomainId` is relative to `_domainId`
  /// @param _childDomainId The domain where we want to use the role
  /// @return hasRole Boolean indicating whether the given user has the given role in domain
  function hasInheritedUserRole(
    address _user,
    uint256 _domainId,
    ColonyRole _role,
    uint256 _childSkillIndex,
    uint256 _childDomainId
  ) external view returns (bool hasRole);

  /// @notice Check whether a given user can modify roles in the target domain `_childDomainId`.
  /// Mostly a convenience function to provide a uniform interface for extension contracts validating permissions
  /// @param _user The user whose permissions we want to check
  /// @param _domainId Domain in which the caller has the role (currently Root or Architecture)
  /// @param _childSkillIndex The index that the `_childDomainId` is relative to `_domainId`
  /// @param _childDomainId The domain where we want to edit roles
  /// @return canSet Boolean indicating whether the given user is allowed to edit roles in the target domain.
  function userCanSetRoles(
    address _user,
    uint256 _domainId,
    uint256 _childSkillIndex,
    uint256 _childDomainId
  ) external view returns (bool canSet);

  /// @notice Gets the bytes32 representation of the roles for a user in a given domain
  /// @param _user The user whose roles we want to get
  /// @param _domain The domain we want to get roles in
  /// @return roles bytes32 representation of the held roles
  function getUserRoles(address _user, uint256 _domain) external view returns (bytes32 roles);

  /// @notice Gets the bytes32 representation of the roles authorized to call a function
  /// @param _sig The function signature
  /// @return roles bytes32 representation of the authorized roles
  function getCapabilityRoles(bytes4 _sig) external view returns (bytes32 roles);

  /// @notice Emit a positive domain reputation update. Available only to Root role holders
  /// @param _domainId The domain where the user will gain reputation
  /// @param _user The user who will gain reputation
  /// @param _amount The (positive) amount of reputation to gain
  function emitDomainReputationReward(uint256 _domainId, address _user, int256 _amount) external;

  /// @notice Emit a positive skill reputation update. Available only to Root role holders
  /// @param _skillId The skill where the user will gain reputation
  /// @param _user The user who will gain reputation
  /// @param _amount The (positive) amount of reputation to gain
  function emitSkillReputationReward(uint256 _skillId, address _user, int256 _amount) external;

  /// @notice Emit a negative domain reputation update. Available only to Arbitration role holders
  /// @param _permissionDomainId The domainId in which I hold the Arbitration role
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _domainId The domain where the user will lose reputation
  /// @param _user The user who will lose reputation
  /// @param _amount The (negative) amount of reputation to lose
  function emitDomainReputationPenalty(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    address _user,
    int256 _amount
  ) external;

  /// @notice Emit a negative skill reputation update. Available only to Arbitration role holders in the root domain
  /// @param _skillId The skill where the user will lose reputation
  /// @param _user The user who will lose reputation
  /// @param _amount The (negative) amount of reputation to lose
  function emitSkillReputationPenalty(uint256 _skillId, address _user, int256 _amount) external;

  /// @notice Called once when the colony is created to initialise certain storage slot values.
  /// @dev Sets the reward inverse to the uint max 2**256 - 1.
  /// @param _colonyNetworkAddress Address of the colony network
  /// @param _token Address of the colony ERC20 Token
  function initialiseColony(address _colonyNetworkAddress, address _token) external;

  /// @notice Called to change the metadata associated with a colony. Expected to be a IPFS hash of a
  /// JSON blob, but not enforced to any degree by the contracts
  /// @param _metadata IPFS hash of the metadata
  function editColony(string memory _metadata) external;

  /// @notice Called to change the metadata associated with a colony. Expected to be a IPFS hash of a
  /// delta to a JSON blob, but not enforced to any degree by the contracts
  /// @param _metadataDelta IPFS hash of the metadata delta
  function editColonyByDelta(string memory _metadataDelta) external;

  /// @notice Allows the colony to bootstrap itself by having initial reputation and token `_amount` assigned to `_users`.
  /// This reputation is assigned in the colony-wide domain. Secured function to authorised members.
  /// @dev Only allowed to be called when `taskCount` is `0` by authorized addresses.
  /// @param _users Array of address to bootstrap with reputation
  /// @param _amount Amount of reputation/tokens for every address
  function bootstrapColony(address[] memory _users, int[] memory _amount) external;

  /// @notice Mint `_wad` amount of colony tokens. Secured function to authorised members.
  /// @param _wad Amount to mint
  function mintTokens(uint256 _wad) external;

  /// @notice Mint `_wad` amount of colony tokens and send to `_guy`. Secured function to authorised members.
  /// @param _guy Recipient of new tokens
  /// @param _wad Amount to mint
  function mintTokensFor(address _guy, uint256 _wad) external;

  /// @notice Lock the colony's token. Can only be called by a network-managed extension.
  /// @return timesLocked The amount of times the token was locked
  function lockToken() external returns (uint256 timesLocked);

  /// @notice Unlock the colony's token for a user. Can only be called by a network-managed extension.
  /// @param user The user to unlock
  /// @param lockId The specific lock to unlock
  function unlockTokenForUser(address user, uint256 lockId) external;

  /// @notice Register colony's ENS label.
  /// @param colonyName The label to register.
  /// @param orbitdb The path of the orbitDB database associated with the colony name
  function registerColonyLabel(string memory colonyName, string memory orbitdb) external;

  /// @notice Update a colony's orbitdb address. Can only be called by a colony with a registered subdomain
  /// @param orbitdb The path of the orbitDB database to be associated with the colony
  function updateColonyOrbitDB(string memory orbitdb) external;

  /// @notice Install an extension to the colony. Secured function to authorised members.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param version The new extension version to install
  function installExtension(bytes32 extensionId, uint256 version) external;

  /// @notice Upgrade an extension in a colony. Secured function to authorised members.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param newVersion The version to upgrade to (must be one larger than the current version)
  function upgradeExtension(bytes32 extensionId, uint256 newVersion) external;

  /// @notice Set the deprecation of an extension in a colony. Secured function to authorised members.
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  /// @param deprecated Whether to deprecate the extension or not
  function deprecateExtension(bytes32 extensionId, bool deprecated) external;

  /// @notice Uninstall an extension from a colony. Secured function to authorised members.
  /// @dev This is a permanent action -- re-installing the extension will deploy a new contract
  /// @dev It is recommended to deprecate an extension before uninstalling to allow active objects to be resolved
  /// @param extensionId keccak256 hash of the extension name, used as an indentifier
  function uninstallExtension(bytes32 extensionId) external;

  /// @notice Initialise the local skill tree for the colony.
  function initialiseRootLocalSkill() external;

  /// @notice Add a new local skill for the colony. Secured function to authorised members.
  function addLocalSkill() external;

  /// @notice Deprecate a local skill for the colony. Secured function to authorised members.
  /// @param localSkillId Id for the local skill
  /// @param deprecated Deprecation status to set for the skill
  function deprecateLocalSkill(uint256 localSkillId, bool deprecated) external;

  /// @notice Get the root local skill id
  /// @return rootLocalSkill The root local skill id
  function getRootLocalSkill() external view returns (uint256 rootLocalSkill);

  /// @notice Add a colony domain, and its respective local skill under skill with id `_parentSkillId`.
  /// New funding pot is created and associated with the domain here.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _parentDomainId Id of the domain under which the new one will be added
  /// @dev Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.
  function addDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _parentDomainId
  ) external;

  /// @notice Add a colony domain, and its respective local skill under skill with id `_parentSkillId`.
  /// New funding pot is created and associated with the domain here.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _parentDomainId Id of the domain under which the new one will be added
  /// @param _metadata Metadata relating to the domain. Expected to be the IPFS hash of a JSON blob, but not enforced by the contracts.
  /// @dev Adding new domains is currently retricted to one level only, i.e. `_parentDomainId` has to be the root domain id: `1`.
  /// @dev We expect this function to only be used by the dapp
  function addDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _parentDomainId,
    string memory _metadata
  ) external;

  /// @notice Add a colony domain, and its respective local skill under skill with id `_parentSkillId`.
  /// New funding pot is created and associated with the domain here.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _domainId Id of the domain being edited
  /// @param _metadata Metadata relating to the domain. Expected to be the IPFS hash of a JSON blob, but not enforced by the contracts.
  function editDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    string memory _metadata
  ) external;

  /// @notice Deprecate a domain, preventing certain actions from happening there
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _domainId Id of the domain being deprecated
  /// @param _deprecated Whether or not the domain is deprecated
  function deprecateDomain(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    bool _deprecated
  ) external;

  /// @notice Get a domain by id.
  /// @param _id Id of the domain which details to get
  /// @return domain The domain
  function getDomain(uint256 _id) external view returns (Domain memory domain);

  /// @notice Get the number of domains in the colony.
  /// @return count The domain count. Min 1 as the root domain is created at the same time as the colony
  function getDomainCount() external view returns (uint256 count);

  /// @notice Helper function that can be used by a client to verify the correctness of a patricia proof they have been supplied with.
  /// @param key The key of the element the proof is for.
  /// @param value The value of the element that the proof is for.
  /// @param branchMask The branchmask of the proof
  /// @param siblings The siblings of the proof
  /// @return isValid True if the proof is valid, false otherwise.
  /// @dev For more detail about branchMask and siblings, examine the PatriciaTree implementation.
  /// While external, likely only to be used by the Colony contracts, as it checks that the user is proving their own
  /// reputation in the current colony. The `verifyProof` function can be used to verify any proof, though this function
  /// is not currently exposed on the Colony's EtherRouter.
  function verifyReputationProof(
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) external view returns (bool isValid);

  // Implemented in ColonyExpenditure.sol

  /// @notice Update the default global claim delay for expenditures
  /// @param _globalClaimDelay The new default global claim delay
  function setDefaultGlobalClaimDelay(uint256 _globalClaimDelay) external;

  /// @notice Add a new expenditure in the colony. Secured function to authorised members.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`,
  /// (only used if `_permissionDomainId` is different to `_domainId`)
  /// @param _domainId The domain where the expenditure belongs
  /// @return expenditureId Identifier of the newly created expenditure
  function makeExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  ) external returns (uint256 expenditureId);

  /// @notice Updates the expenditure owner. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _newOwner New owner of expenditure
  function transferExpenditure(uint256 _id, address _newOwner) external;

  /// @notice @deprecated
  /// @notice Updates the expenditure owner. Can only be called by Arbitration role.
  /// @dev This is now deprecated and will be removed in a future version
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`,
  /// (only used if `_permissionDomainId` is different to `_domainId`)
  /// @param _id Expenditure identifier
  /// @param _newOwner New owner of expenditure
  function transferExpenditureViaArbitration(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    address _newOwner
  ) external;

  /// @notice Cancels the expenditure and prevents further editing. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  function cancelExpenditure(uint256 _id) external;

  /// @notice Locks the expenditure and prevents further editing. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  function lockExpenditure(uint256 _id) external;

  /// @notice Finalizes the expenditure and allows for funds to be claimed. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  function finalizeExpenditure(uint256 _id) external;

  /// @notice Sets the metadata for an expenditure. Can only be called by expenditure owner.
  /// @dev Can only be called while expenditure is in draft state.
  /// @param _id Id of the expenditure
  /// @param _metadata IPFS hash of the metadata
  function setExpenditureMetadata(uint256 _id, string memory _metadata) external;

  /// @notice Sets the metadata for an expenditure. Can only be called by Arbitration role.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`,
  /// @param _id Id of the expenditure
  /// @param _metadata IPFS hash of the metadata
  function setExpenditureMetadata(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    string memory _metadata
  ) external;

  /// @notice @deprecated
  /// @notice Sets the recipient on an expenditure slot. Can only be called by expenditure owner.
  /// @dev Can only be called while expenditure is in draft state.
  /// @param _id Id of the expenditure
  /// @param _slot Slot for the recipient address
  /// @param _recipient Address of the recipient
  function setExpenditureRecipient(uint256 _id, uint256 _slot, address payable _recipient) external;

  /// @notice Sets the recipients in given expenditure slots. Can only be called by expenditure owner.
  /// @dev Can only be called while expenditure is in draft state.
  /// @param _id Id of the expenditure
  /// @param _slots Array of slots to set recipients
  /// @param _recipients Addresses of the recipients
  function setExpenditureRecipients(
    uint256 _id,
    uint256[] memory _slots,
    address payable[] memory _recipients
  ) external;

  /// @notice @deprecated
  /// @notice Set the token payout on an expenditure slot. Can only be called by expenditure owner.
  /// @dev Can only be called while expenditure is in draft state.
  /// @param _id Id of the expenditure
  /// @param _slot Number of the slot
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amount Payout amount
  function setExpenditurePayout(
    uint256 _id,
    uint256 _slot,
    address _token,
    uint256 _amount
  ) external;

  /// @notice Set the token payouts in given expenditure slots. Can only be called by expenditure owner.
  /// @dev Can only be called while expenditure is in draft state.
  /// @param _id Id of the expenditure
  /// @param _slots Array of slots to set payouts
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amounts Payout amounts
  function setExpenditurePayouts(
    uint256 _id,
    uint256[] memory _slots,
    address _token,
    uint256[] memory _amounts
  ) external;

  /// @notice Set the token payout in a given expenditure slot. Can only be called by an Arbitration user.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _id Id of the expenditure
  /// @param _slot The slot to set the payout
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @param _amount Payout amount
  function setExpenditurePayout(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _slot,
    address _token,
    uint256 _amount
  ) external;

  /// @notice @deprecated
  /// @notice Sets the skill on an expenditure slot. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _slot Number of the slot
  /// @param _skillId Id of the new skill to set
  function setExpenditureSkill(uint256 _id, uint256 _slot, uint256 _skillId) external;

  /// @notice Sets the skill on an expenditure slot. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _slots Array of slots to set skills
  /// @param _skillIds Ids of the new skills to set
  function setExpenditureSkills(
    uint256 _id,
    uint256[] memory _slots,
    uint256[] memory _skillIds
  ) external;

  /// @notice @deprecated
  /// @notice Sets the claim delay on an expenditure slot. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _slot Number of the slot
  /// @param _claimDelay Duration of time (in seconds) to delay
  function setExpenditureClaimDelay(uint256 _id, uint256 _slot, uint256 _claimDelay) external;

  /// @notice Sets the claim delays in given expenditure slots. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _slots Array of slots to set claim delays
  /// @param _claimDelays Durations of time (in seconds) to delay
  function setExpenditureClaimDelays(
    uint256 _id,
    uint256[] memory _slots,
    uint256[] memory _claimDelays
  ) external;

  /// @notice Sets the payout modifiers in given expenditure slots. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _slots Array of slots to set payout modifiers
  /// @param _payoutModifiers Values (between +/- WAD) to modify the payout & reputation bonus
  function setExpenditurePayoutModifiers(
    uint256 _id,
    uint256[] memory _slots,
    int256[] memory _payoutModifiers
  ) external;

  /// @notice Set many values of an expenditure simultaneously. Can only be called by expenditure owner.
  /// @param _id Expenditure identifier
  /// @param _recipientSlots Array of slots to set recipients
  /// @param _recipients Addresses of the recipients
  /// @param _skillIdSlots Array of slots to set skills
  /// @param _skillIds Ids of the new skills to set
  /// @param _claimDelaySlots Array of slots to set claim delays
  /// @param _claimDelays Durations of time (in seconds) to delay
  /// @param _payoutModifierSlots Array of slots to set payout modifiers
  /// @param _payoutModifiers Values (between +/- WAD) to modify the payout & reputation bonus
  /// @param _payoutTokens Addresses of the tokens, `0x0` value indicates Ether
  /// @param _payoutSlots 2-dimensional array of slots to set payouts
  /// @param _payoutValues 2-dimensional array of the payout amounts
  function setExpenditureValues(
    uint256 _id,
    uint256[] memory _recipientSlots,
    address payable[] memory _recipients,
    uint256[] memory _skillIdSlots,
    uint256[] memory _skillIds,
    uint256[] memory _claimDelaySlots,
    uint256[] memory _claimDelays,
    uint256[] memory _payoutModifierSlots,
    int256[] memory _payoutModifiers,
    address[] memory _payoutTokens,
    uint256[][] memory _payoutSlots,
    uint256[][] memory _payoutValues
  ) external;

  /// @notice Set arbitrary state on an expenditure slot. Can only be called by Arbitration role.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`,
  /// (only used if `_permissionDomainId` is different to `_domainId`)
  /// @param _id Expenditure identifier
  /// @param _storageSlot Number of the top-level storage slot (25, 26, or 27)
  /// @param _mask Array of booleans indicated whether a key is a mapping (F) or an array index (T).
  /// @param _keys Array of additional keys (for mappings & arrays)
  /// @param _value Value to set at location
  function setExpenditureState(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _storageSlot,
    bool[] memory _mask,
    bytes32[] memory _keys,
    bytes32 _value
  ) external;

  /// @notice Claim the payout for an expenditure slot. Here the network receives a fee from each payout.
  /// @param _id Expenditure identifier
  /// @param _slot Number of the slot
  /// @param _token Address of the token, `0x0` value indicates Ether
  function claimExpenditurePayout(uint256 _id, uint256 _slot, address _token) external;

  /// @notice Get the number of expenditures in the colony.
  /// @return count The expenditure count
  function getExpenditureCount() external view returns (uint256 count);

  /// @notice Returns an existing expenditure.
  /// @param _id Expenditure identifier
  /// @return expenditure The expenditure
  function getExpenditure(uint256 _id) external view returns (Expenditure memory expenditure);

  /// @notice Returns an existing expenditure slot.
  /// @param _id Expenditure identifier
  /// @param _slot Expenditure slot
  /// @return expenditureSlot The expenditure slot
  function getExpenditureSlot(
    uint256 _id,
    uint256 _slot
  ) external view returns (ExpenditureSlot memory expenditureSlot);

  /// @notice Returns an existing expenditure slot's payout for a token.
  /// @param _id Expenditure identifier
  /// @param _slot Expenditure slot
  /// @param _token Token address
  /// @return amount Amount of the payout for that slot/token.
  function getExpenditureSlotPayout(
    uint256 _id,
    uint256 _slot,
    address _token
  ) external view returns (uint256 amount);

  /// @notice Set the reward inverse to pay out from revenue. e.g. if the fee is 1% (or 0.01), set 100.
  /// @param _rewardInverse The inverse of the reward
  function setRewardInverse(uint256 _rewardInverse) external;

  /// @notice Return 1 / the reward to pay out from revenue. e.g. if the fee is 1% (or 0.01), return 100.
  /// @return rewardInverse The inverse of the reward
  function getRewardInverse() external view returns (uint256 rewardInverse);

  /// @notice Start next reward payout for `_token`. All funds in the reward pot for `_token` will become unavailable.
  /// @notice Add a new payment in the colony. Can only be called by users with root permission.
  /// All tokens will be locked, and can be unlocked by calling `waiveRewardPayout` or `claimRewardPayout`.
  /// @param _token Address of the token used for reward payout
  /// @param key Some Reputation hash tree key
  /// @param value Reputation value
  /// @param branchMask The branchmask of the proof
  /// @param siblings The siblings of the proof
  function startNextRewardPayout(
    address _token,
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) external;

  /// @notice Claim the reward payout at `_payoutId`. User needs to provide their reputation and colony-wide reputation
  /// which will be proven via Merkle proof inside this function.
  /// Can only be called if payout is active, i.e if 60 days have not passed from its creation.
  /// Can only be called if next in queue.
  /// @param _payoutId Id of the reward payout
  /// @param _squareRoots Square roots of values used in equation:
  /// `_squareRoots[0]` - square root of user reputation,
  /// `_squareRoots[1]` - square root of user tokens (deposited in TokenLocking),
  /// `_squareRoots[2]` - square root of total reputation,
  /// `_squareRoots[3]` - square root of total tokens,
  /// `_squareRoots[4]` - square root of numerator (user reputation * user tokens),
  /// `_squareRoots[5]` - square root of denominator (total reputation * total tokens),
  /// `_squareRoots[6]` - square root of payout amount.
  /// @param key Some Reputation hash tree key
  /// @param value Reputation value
  /// @param branchMask The branchmask of the proof
  /// @param siblings The siblings of the proof
  function claimRewardPayout(
    uint256 _payoutId,
    uint256[7] memory _squareRoots,
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) external;

  /// @notice Get useful information about specific reward payout.
  /// @param _payoutId Id of the reward payout
  /// @return rewardPayoutCycle RewardPayoutCycle, containing propertes:
  ///  `reputationState` Reputation root hash at the time of creation,
  ///  `colonyWideReputation` Colony wide reputation in `reputationState`,
  ///  `totalTokens` Total colony tokens at the time of creation,
  ///  `amount` Total amount of tokens taken aside for reward payout,
  ///  `tokenAddress` Token address,
  ///  `blockTimestamp` Block number at the time of creation.
  function getRewardPayoutInfo(
    uint256 _payoutId
  ) external view returns (RewardPayoutCycle memory rewardPayoutCycle);

  /// @notice Finalises the reward payout. Allows creation of next reward payouts for token that has been used in `_payoutId`.
  /// Can only be called when reward payout cycle is finished i.e when 60 days have passed from its creation.
  /// @param _payoutId Id of the reward payout
  function finalizeRewardPayout(uint256 _payoutId) external;

  /// @notice Get the non-mapping properties of a pot by id.
  /// @param _id Id of the pot which details to get
  /// @return associatedType The FundingPotAssociatedType value of the current funding pot, e.g. Domain, Expenditure
  /// @return associatedTypeId Id of the associated type, e.g. if associatedType = FundingPotAssociatedType.Domain, this refers to the domainId
  /// @return payoutsWeCannotMake Number of payouts that cannot be completed with the current funding
  /// @dev For the reward funding pot (e.g. id: 0) this returns (0, 0, 0).
  function getFundingPot(
    uint256 _id
  )
    external
    view
    returns (
      FundingPotAssociatedType associatedType,
      uint256 associatedTypeId,
      uint256 payoutsWeCannotMake
    );

  /// @notice Get the number of funding pots in the colony.
  /// @return count The funding pots count
  function getFundingPotCount() external view returns (uint256 count);

  /// @notice Get the `_token` balance of pot with id `_potId`.
  /// @param _potId Id of the funding pot
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return balance Funding pot supply balance
  function getFundingPotBalance(
    uint256 _potId,
    address _token
  ) external view returns (uint256 balance);

  /// @notice Get the assigned `_token` payouts of pot with id `_potId`.
  /// @param _potId Id of the funding pot
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return payout Funding pot payout amount
  function getFundingPotPayout(
    uint256 _potId,
    address _token
  ) external view returns (uint256 payout);

  /// @notice Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _childSkillIndex The child index in _permissionDomainId where I will be taking this action
  /// @param _domainId The domain where I am taking this action, pointed to by _permissionDomainId and _childSkillIndex
  /// @param _fromChildSkillIndex In the array of child skills for the skill associated with the domain pointed to by _permissionDomainId + _childSkillIndex,
  ///         the index of the skill associated with the domain that contains _fromPot
  /// @param _toChildSkillIndex The same, but for the _toPot which the funds are being moved to
  /// @param _fromPot Funding pot id providing the funds
  /// @param _toPot Funding pot id receiving the funds
  /// @param _amount Amount of funds
  /// @param _token Address of the token, `0x0` value indicates Ether
  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    address _token
  ) external;

  /// @notice @deprecated
  /// @notice Move a given amount: `_amount` of `_token` funds from funding pot with id `_fromPot` to one with id `_toPot`.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action
  /// @param _fromChildSkillIndex The child index in `_permissionDomainId` where we can find the domain for `_fromPotId`
  /// @param _toChildSkillIndex The child index in `_permissionDomainId` where we can find the domain for `_toPotId`
  /// @param _fromPot Funding pot id providing the funds
  /// @param _toPot Funding pot id receiving the funds
  /// @param _amount Amount of funds
  /// @param _token Address of the token, `0x0` value indicates Ether
  function moveFundsBetweenPots(
    uint256 _permissionDomainId,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _fromPot,
    uint256 _toPot,
    uint256 _amount,
    address _token
  ) external;

  /// @notice Move any funds received by the colony in `_token` denomination to the top-level domain pot,
  /// siphoning off a small amount to the reward pot. If called against a colony's own token, no fee is taken.
  /// @param _token Address of the token, `0x0` value indicates Ether
  function claimColonyFunds(address _token) external;

  /// @notice Get the total amount of tokens `_token` minus amount reserved to be paid to the reputation and token holders as rewards.
  /// @param _token Address of the token, `0x0` value indicates Ether
  /// @return amount Total amount of tokens in funding pots other than the rewards pot (id 0)
  function getNonRewardPotsTotal(address _token) external view returns (uint256 amount);

  /// @notice Allow the _approvee to obligate some amount of tokens as a stake.
  /// @param _approvee Address of the account we are willing to let obligate us.
  /// @param _domainId Domain in which we are willing to be obligated.
  /// @param _amount Amount of internal token up to which we are willing to be obligated.
  function approveStake(address _approvee, uint256 _domainId, uint256 _amount) external;

  /// @notice Obligate the user some amount of tokens as a stake.
  /// @param _user Address of the account we are obligating.
  /// @param _domainId Domain in which we are obligating the user.
  /// @param _amount Amount of internal token we are obligating.
  function obligateStake(address _user, uint256 _domainId, uint256 _amount) external;

  /// @notice Deobligate the user some amount of tokens, releasing the stake.
  /// @param _user Address of the account we are deobligating.
  /// @param _domainId Domain in which we are deobligating the user.
  /// @param _amount Amount of internal token we are deobligating.
  function deobligateStake(address _user, uint256 _domainId, uint256 _amount) external;

  /// @notice Transfer some amount of obligated tokens.
  /// Can be called by the arbitration role.
  /// @param _permissionDomainId The domainId in which I have the permission to take this action.
  /// @param _childSkillIndex The child index in `_permissionDomainId` where we can find `_domainId`.
  /// @param _obligator Address of the account who set the obligation.
  /// @param _user Address of the account we are transferring.
  /// @param _domainId Domain in which we are transferring the tokens.
  /// @param _amount Amount of internal token we are transferring.
  /// @param _recipient Recipient of the transferred tokens.
  function transferStake(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _obligator,
    address _user,
    uint256 _domainId,
    uint256 _amount,
    address _recipient
  ) external;

  /// @notice View an approval to obligate tokens.
  /// @param _user User allowing their tokens to be obligated.
  /// @param _obligator Address of the account we are willing to let obligate us.
  /// @param _domainId Domain in which we are willing to be obligated.
  /// @return approval The amount the user has approved
  function getApproval(
    address _user,
    address _obligator,
    uint256 _domainId
  ) external view returns (uint256 approval);

  /// @notice View an obligation of tokens.
  /// @param _user User whose tokens are obligated.
  /// @param _obligator Address of the account who obligated us.
  /// @param _domainId Domain in which we are obligated.
  /// @return obligation The amount that is currently obligated
  function getObligation(
    address _user,
    address _obligator,
    uint256 _domainId
  ) external view returns (uint256 obligation);

  /// @notice Get the domain corresponding to a funding pot
  /// @param _fundingPotId Id of the funding pot
  /// @return domainId Id of the corresponding domain
  function getDomainFromFundingPot(uint256 _fundingPotId) external view returns (uint256 domainId);

  /// @notice Burn tokens held by the colony. Can only burn tokens held in the root funding pot.
  /// @param token The address of the token to burn
  /// @param amount The amount of tokens to burn
  function burnTokens(address token, uint256 amount) external;

  /// @notice unlock the native colony token, if possible
  function unlockToken() external;

  /// @notice Update the internal bookkeeping around external ERC20 approvals
  /// @param token The address of the token which was approved
  /// @param spender The account we have approved
  function updateApprovalAmount(address token, address spender) external;

  /// @notice Get the current approval amount
  /// @param token The address of the token which was approved
  /// @param spender The account we have approved
  /// @return amount The token approval amount
  function getTokenApproval(address token, address spender) external view returns (uint256 amount);

  /// @notice Get the current total approval amount across all spenders
  /// @param token The address of the token which was approved
  /// @return amount The total token approval amount
  function getTotalTokenApproval(address token) external view returns (uint256 amount);
}
