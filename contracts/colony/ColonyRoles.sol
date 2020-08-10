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

import "./ColonyStorage.sol";


contract ColonyRoles is ColonyStorage {

  function setRootRole(address _user, bool _setTo) public stoppable auth {
    ColonyAuthority(address(authority)).setUserRole(_user, uint8(ColonyRole.Root), _setTo);

    emit ColonyRoleSet(_user, 1, uint8(ColonyRole.Root), _setTo);
  }

  function setArbitrationRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId)
  {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Arbitration), _setTo);

    emit ColonyRoleSet(_user, _domainId, uint8(ColonyRole.Arbitration), _setTo);
  }

  function setArchitectureRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId)
  {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Architecture), _setTo);

    emit ColonyRoleSet(_user, _domainId, uint8(ColonyRole.Architecture), _setTo);
  }

  function setFundingRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId)
  {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Funding), _setTo);

    emit ColonyRoleSet(_user, _domainId, uint8(ColonyRole.Funding), _setTo);
  }

  function setAdministrationRole(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId)
  {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Administration), _setTo);

    emit ColonyRoleSet(_user, _domainId, uint8(ColonyRole.Administration), _setTo);
  }

  function setUserRoles(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _domainId,
    bytes32 _roles,
    bool _setTo
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId) archSubdomain(_permissionDomainId, _domainId)
  {
    // This is not strictly necessary, since these roles are never used in subdomains
    require(_roles & ROOT_ROLES == 0 || _domainId == 1, "colony-bad-domain-for-role");

    bytes32 roles = _roles;
    uint8 roleId;

    while (roles > 0) {
      if (uint256(roles) % 2 == 1) {
        ColonyAuthority(address(authority)).setUserRole(_user, _domainId, roleId, _setTo);

        emit ColonyRoleSet(_user, _domainId, roleId, _setTo);
      }
      roles >>= 1;
      roleId += 1;
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
  ) public view returns (bool)
  {
    return (
      hasUserRole(_user, _domainId, _role) &&
      validateDomainInheritance(_domainId, _childSkillIndex, _childDomainId)
    );
  }

  function userCanSetRoles(
    address _user,
    uint256 _domainId,
    uint256 _childSkillIndex,
    uint256 _childDomainId
  ) public view returns (bool)
  {
    return (
      hasUserRole(_user, 1, ColonyRole.Root) ||
      (_domainId != _childDomainId && hasInheritedUserRole(_user, _domainId, ColonyRole.Architecture, _childSkillIndex, _childDomainId))
    );
  }

  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return ColonyAuthority(address(authority)).getUserRoles(who, where);
  }
}