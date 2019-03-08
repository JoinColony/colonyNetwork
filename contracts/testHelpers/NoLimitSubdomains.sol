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

pragma solidity >=0.4.23 <0.5.0;
pragma experimental ABIEncoderV2;

import "./../ColonyStorage.sol";

contract NoLimitSubdomains is ColonyStorage {
  function addDomain(uint256 _parentDomainId) public
  stoppable
  auth
  domainExists(_parentDomainId)
  {
    uint256 parentSkillId = domains[_parentDomainId].skillId;

    // Setup new local skill
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 newLocalSkill = colonyNetwork.addSkill(parentSkillId);

    // Add domain to local mapping
    initialiseDomain(newLocalSkill);
  }

  // We copy this function from Colony.sol to here because it's private, not internal, so we can't access it even if we inherit
  function initialiseDomain(uint256 _skillId) private skillExists(_skillId) {
    domainCount += 1;
    // Create a new funding pot
    fundingPotCount += 1;
    fundingPots[fundingPotCount] = FundingPot({
      associatedType: FundingPotAssociatedType.Domain,
      associatedTypeId: domainCount
    });

    // Create a new domain with the given skill and new funding pot
    domains[domainCount] = Domain({
      skillId: _skillId,
      fundingPotId: fundingPotCount
    });

    emit DomainAdded(domainCount);
    emit FundingPotAdded(fundingPotCount);
  }

}
