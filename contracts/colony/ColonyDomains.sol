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

import "./ColonyStorage.sol";


contract ColonyDomains is ColonyStorage {

  function initialiseColony(address _colonyNetworkAddress, address _token) public stoppable {
    require(_colonyNetworkAddress != address(0x0), "colony-network-cannot-be-zero");
    require(_token != address(0x0), "colony-token-cannot-be-zero");

    require(colonyNetworkAddress == address(0x0), "colony-already-initialised-network");
    require(token == address(0x0), "colony-already-initialised-token");

    colonyNetworkAddress = _colonyNetworkAddress;
    token = _token;
    tokenLockingAddress = IColonyNetwork(colonyNetworkAddress).getTokenLocking();

    // Initialise the task update reviewers
    setFunctionReviewers(bytes4(keccak256("setTaskBrief(uint256,bytes32)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("setTaskDueDate(uint256,uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("setTaskSkill(uint256,uint256)")), TaskRole.Manager, TaskRole.Worker);
    // We are setting a manager to both reviewers, but it will require just one signature from manager
    setFunctionReviewers(bytes4(keccak256("setTaskManagerPayout(uint256,address,uint256)")), TaskRole.Manager, TaskRole.Manager);
    setFunctionReviewers(bytes4(keccak256("setTaskEvaluatorPayout(uint256,address,uint256)")), TaskRole.Manager, TaskRole.Evaluator);
    setFunctionReviewers(bytes4(keccak256("setTaskWorkerPayout(uint256,address,uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("removeTaskEvaluatorRole(uint256)")), TaskRole.Manager, TaskRole.Evaluator);
    setFunctionReviewers(bytes4(keccak256("removeTaskWorkerRole(uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("cancelTask(uint256)")), TaskRole.Manager, TaskRole.Worker);

    setRoleAssignmentFunction(bytes4(keccak256("setTaskManagerRole(uint256,address,uint256,uint256)")));
    setRoleAssignmentFunction(bytes4(keccak256("setTaskEvaluatorRole(uint256,address)")));
    setRoleAssignmentFunction(bytes4(keccak256("setTaskWorkerRole(uint256,address)")));

    // Initialise the local skill and domain trees
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 rootDomainSkill = colonyNetwork.getSkillCount();
    initialiseDomain(rootDomainSkill);
    initialiseRootLocalSkill();

    // Set initial colony reward inverse amount to the max indicating a zero rewards to start with
    rewardInverse = 2**256 - 1;

    emit ColonyInitialised(msgSender(), _colonyNetworkAddress, _token);
  }

  function addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId) public
  stoppable
  domainNotDeprecated(_parentDomainId)
  authDomain(_permissionDomainId, _childSkillIndex, _parentDomainId)
  {
    addDomain(_permissionDomainId, _childSkillIndex, _parentDomainId, "");
  }

  function addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId, string memory _metadata) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, _parentDomainId)
  {
    // Note: Remove when we want to allow more domain hierarchy levels
    require(_parentDomainId == 1, "colony-parent-domain-not-root");

    uint256 parentSkillId = domains[_parentDomainId].skillId;

    // Setup new domain skill
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    // slither-disable-next-line reentrancy-no-eth
    uint256 newDomainSkill = colonyNetwork.addSkill(parentSkillId);

    // Add domain to local mapping
    initialiseDomain(newDomainSkill);

    if (keccak256(abi.encodePacked(_metadata)) != keccak256(abi.encodePacked(""))) {
      emit DomainMetadata(msgSender(), domainCount, _metadata);
    }
  }

  function editDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, string memory _metadata) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  {
    if (keccak256(abi.encodePacked(_metadata)) != keccak256(abi.encodePacked(""))) {
      emit DomainMetadata(msgSender(), _domainId, _metadata);
    }
  }

  function deprecateDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId, bool _deprecated) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  {
    if (IColonyNetwork(colonyNetworkAddress).deprecateSkill(domains[_domainId].skillId, _deprecated)) {

      emit DomainDeprecated(msgSender(), _domainId, _deprecated);
    }
  }

  function initialiseRootLocalSkill() public stoppable {
    require(rootLocalSkill == 0, "colony-root-local-skill-initialised");
    rootLocalSkill = IColonyNetwork(colonyNetworkAddress).initialiseRootLocalSkill();
  }

  function getDomain(uint256 _domainId) public view returns (Domain memory domain) {
    domain = domains[_domainId];
  }

  function getDomainCount() public view returns (uint256) {
    return domainCount;
  }

  // Internal

  function initialiseDomain(uint256 _skillId) internal {
    domainCount += 1;
    // Create a new funding pot
    fundingPotCount += 1;
    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType.Domain;
    fundingPots[fundingPotCount].associatedTypeId = domainCount;

    // Create a new domain with the given skill and new funding pot
    domains[domainCount] = Domain({
      skillId: _skillId,
      fundingPotId: fundingPotCount
    });

    emit DomainAdded(msgSender(), domainCount);
    emit FundingPotAdded(fundingPotCount);
  }

  function setFunctionReviewers(bytes4 _sig, TaskRole _firstReviewer, TaskRole _secondReviewer)
  private
  {
    reviewers[_sig] = [_firstReviewer, _secondReviewer];
  }

  function setRoleAssignmentFunction(bytes4 _sig) private {
    roleAssignmentSigs[_sig] = true;
  }

}
