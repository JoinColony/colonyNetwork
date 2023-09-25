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

pragma solidity 0.8.21;
pragma experimental ABIEncoderV2;

import "./ColonyStorage.sol";
import "./../common/ContractRecoveryDataTypes.sol";

contract ColonyRoles is ColonyStorage, ContractRecoveryDataTypes {
  function setRootRole(address _user, bool _setTo) public stoppable auth {
    ColonyAuthority(address(authority)).setUserRole(_user, uint8(ColonyRole.Root), _setTo);

    emit ColonyRoleSet(msgSender(), _user, 1, uint8(ColonyRole.Root), _setTo);
  }

  function setArbitrationRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId) {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Arbitration), _setTo);

    emit ColonyRoleSet(msgSender(), _user, _domainId, uint8(ColonyRole.Arbitration), _setTo);
  }

  function setArchitectureRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId) {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Architecture), _setTo);

    emit ColonyRoleSet(msgSender(), _user, _domainId, uint8(ColonyRole.Architecture), _setTo);
  }

  function setFundingRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId) {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Funding), _setTo);

    emit ColonyRoleSet(msgSender(), _user, _domainId, uint8(ColonyRole.Funding), _setTo);
  }

  function setAdministrationRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId) {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Administration), _setTo);

    emit ColonyRoleSet(msgSender(), _user, _domainId, uint8(ColonyRole.Administration), _setTo);
  }

  function setUserRoles(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bytes32 _roles
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId) {
    // This is not strictly necessary, since these roles are never used in subdomains
    require(_roles & ROOT_ROLES == 0 || _domainId == 1, "colony-bad-domain-for-role");

    bool setTo;
    bytes32 existingRoles = ColonyAuthority(address(authority)).getUserRoles(_user, _domainId);
    bytes32 rolesChanged = _roles ^ existingRoles;
    bytes32 roles = _roles;

    // Update the storage slot tracking number of recovery roles before all the external calls are complete
    // This takes advantage of the fact that the recovery role is the LSB in the roles bytemaps
    if (uint256(rolesChanged) % 2 == 1) {
      setTo = uint256(roles) % 2 == 1;
      if (setTo) {
        recoveryRolesCount += 1;
      } else {
        recoveryRolesCount -= 1;
      }
    }

    for (uint8 roleId; roleId < uint8(ColonyRole.NUMBER_OF_ROLES); roleId += 1) {
      bool changed = uint256(rolesChanged) % 2 == 1;
      if (changed) {
        setTo = uint256(roles) % 2 == 1;

        ColonyAuthority(address(authority)).setUserRole(_user, _domainId, roleId, setTo);
        emit ColonyRoleSet(msgSender(), _user, _domainId, roleId, setTo);
      }
      roles >>= 1;
      rolesChanged >>= 1;
    }
  }

  function hasUserRole(address _user, uint256 _domainId, ColonyRole _role) public view returns (bool) {
    return ColonyAuthority(address(authority)).hasUserRole(_user, _domainId, uint8(_role));
  }

  function hasInheritedUserRole(
    address _user,
    uint256 _domainId,
    ColonyRole _role,
    uint256 _childSkillIndex,
    uint256 _childDomainId
  ) public view returns (bool) {
    return (hasUserRole(_user, _domainId, _role) && validateDomainInheritance(_domainId, _childSkillIndex, _childDomainId));
  }

  function userCanSetRoles(address _user, uint256 _domainId, uint256 _childSkillIndex, uint256 _childDomainId) public view returns (bool) {
    return (hasUserRole(_user, 1, ColonyRole.Root) ||
      (_domainId != _childDomainId && hasInheritedUserRole(_user, _domainId, ColonyRole.Architecture, _childSkillIndex, _childDomainId)));
  }

  function getUserRoles(address _user, uint256 _domain) public view returns (bytes32) {
    return ColonyAuthority(address(authority)).getUserRoles(_user, _domain);
  }

  function getCapabilityRoles(bytes4 _sig) public view returns (bytes32) {
    return ColonyAuthority(address(authority)).getCapabilityRoles(address(this), _sig);
  }
}
