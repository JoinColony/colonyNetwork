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

pragma solidity >=0.5.3;
pragma experimental ABIEncoderV2;

import "./ColonyStorage.sol";
import "./IEtherRouter.sol";


contract Colony is ColonyStorage, PatriciaTreeProofs {

  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public pure returns (uint256 colonyVersion) { return 1; }

  function setFounderRole(address _user) public stoppable auth {
    // To allow only one address to have founder role at a time, we have to remove current founder from their role
    ColonyAuthority colonyAuthority = ColonyAuthority(address(authority));
    colonyAuthority.setUserRole(msg.sender, uint8(ColonyRole.Founder), false);
    colonyAuthority.setUserRole(_user, uint8(ColonyRole.Founder), true);

    emit ColonyFounderRoleSet(msg.sender, _user);
  }

  function setAdminRole(address _user) public stoppable auth {
    ColonyAuthority(address(authority)).setUserRole(_user, uint8(ColonyRole.Admin), true);

    emit ColonyAdminRoleSet(_user);
  }

  function setAdministrationRole(
    uint256 _parentDomainId,
    uint256 _domainProofIndex,
    address _user,
    uint256 _domainId
  ) public stoppable auth2(_parentDomainId, _domainId, _domainProofIndex)
  {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Administration), true);
  }

  function setFundingRole(
    uint256 _parentDomainId,
    uint256 _domainProofIndex,
    address _user,
    uint256 _domainId
  ) public stoppable auth2(_parentDomainId, _domainId, _domainProofIndex)
  {
    ColonyAuthority(address(authority)).setUserRole(_user, _domainId, uint8(ColonyRole.Funding), true);
  }

  function setArchitectureRole(
    uint256 _parentDomainId,
    uint256 _domainProofIndex,
    address _user,
    uint256 _domainId
  ) public stoppable auth2(_parentDomainId, _domainId, _domainProofIndex)
  {
    // Because this permission has some restrictions on domains of action, we transparently implement it as two roles
    ColonyAuthority colonyAuthority = ColonyAuthority(address(authority));
    colonyAuthority.setUserRole(_user, _domainId, uint8(ColonyRole.Architecture), true);
    colonyAuthority.setUserRole(_user, _domainId, uint8(ColonyRole.ArchitectureSubdomain), true);
  }

  function setRootRole(address _user) public stoppable auth2(1, 1, 0) {
    ColonyAuthority(address(authority)).setUserRole(_user, uint8(ColonyRole.Root), true);
  }

  // Can only be called by the founder role.
  function removeAdminRole(address _user) public stoppable auth {
    ColonyAuthority(address(authority)).setUserRole(_user, uint8(ColonyRole.Admin), false);

    emit ColonyAdminRoleRemoved(_user);
  }

  function hasUserRole(address _user, uint256 _domainId, ColonyRole _role) public view returns (bool) {
    return ColonyAuthority(address(authority)).hasUserRole(_user, _domainId, uint8(_role));
  }

  function getColonyNetwork() public view returns (address) {
    return colonyNetworkAddress;
  }

  function getToken() public view returns (address) {
    return token;
  }

  function initialiseColony(address _colonyNetworkAddress, address _token) public stoppable {
    require(colonyNetworkAddress == address(0x0), "colony-already-initialised-network");
    require(token == address(0x0), "colony-already-initialised-token");
    colonyNetworkAddress = _colonyNetworkAddress;
    token = _token;

    // Initialise the task update reviewers
    setFunctionReviewers(bytes4(keccak256("setTaskBrief(uint256,bytes32)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("setTaskDueDate(uint256,uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("setTaskSkill(uint256,uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("setTaskDomain(uint256,uint256)")), TaskRole.Manager, TaskRole.Worker);
    // We are setting a manager to both reviewers, but it will require just one signature from manager
    setFunctionReviewers(bytes4(keccak256("setTaskManagerPayout(uint256,address,uint256)")), TaskRole.Manager, TaskRole.Manager);
    setFunctionReviewers(bytes4(keccak256("setTaskEvaluatorPayout(uint256,address,uint256)")), TaskRole.Manager, TaskRole.Evaluator);
    setFunctionReviewers(bytes4(keccak256("setTaskWorkerPayout(uint256,address,uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("removeTaskEvaluatorRole(uint256)")), TaskRole.Manager, TaskRole.Evaluator);
    setFunctionReviewers(bytes4(keccak256("removeTaskWorkerRole(uint256)")), TaskRole.Manager, TaskRole.Worker);
    setFunctionReviewers(bytes4(keccak256("cancelTask(uint256)")), TaskRole.Manager, TaskRole.Worker);

    setRoleAssignmentFunction(bytes4(keccak256("setTaskManagerRole(uint256,address)")));
    setRoleAssignmentFunction(bytes4(keccak256("setTaskEvaluatorRole(uint256,address)")));
    setRoleAssignmentFunction(bytes4(keccak256("setTaskWorkerRole(uint256,address)")));

    // Initialise the root domain
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 rootLocalSkill = colonyNetwork.getSkillCount();
    initialiseDomain(rootLocalSkill);

    // Set initial colony reward inverse amount to the max indicating a zero rewards to start with
    rewardInverse = 2**256 - 1;

    emit ColonyInitialised(_colonyNetworkAddress, _token);
  }

  function bootstrapColony(address[] memory _users, int[] memory _amounts) public
  stoppable
  auth
  isInBootstrapPhase
  {
    require(_users.length == _amounts.length, "colony-bootstrap-bad-inputs");

    for (uint i = 0; i < _users.length; i++) {
      require(_amounts[i] >= 0, "colony-bootstrap-bad-amount-input");
      require(uint256(_amounts[i]) <= fundingPots[1].balance[token], "colony-bootstrap-not-enough-tokens");
      fundingPots[1].balance[token] = sub(fundingPots[1].balance[token], uint256(_amounts[i]));
      nonRewardPotsTotal[token] = sub(nonRewardPotsTotal[token], uint256(_amounts[i]));

      ERC20Extended(token).transfer(_users[i], uint256(_amounts[i]));
      IColonyNetwork(colonyNetworkAddress).appendReputationUpdateLog(_users[i], _amounts[i], domains[1].skillId);
    }

    emit ColonyBootstrapped(_users, _amounts);
  }

  function mintTokens(uint _wad) public
  stoppable
  auth
  {
    if (address(this) == IColonyNetwork(colonyNetworkAddress).getMetaColony()) {
      ERC20Extended(token).mint(_wad);
    } else {
      ERC20Extended(token).mint(address(this), _wad);
    }
  }

  function mintTokensForColonyNetwork(uint _wad) public stoppable {
    // Only the colony Network can call this function
    require(msg.sender == colonyNetworkAddress, "colony-access-denied-only-network-allowed");
    // Function only valid on the Meta Colony
    require(address(this) == IColonyNetwork(colonyNetworkAddress).getMetaColony(), "colony-access-denied-only-meta-colony-allowed");
    ERC20Extended(token).mint(_wad);
    ERC20Extended(token).transfer(colonyNetworkAddress, _wad);
  }

  function registerColonyLabel(string memory colonyName, string memory orbitdb) public stoppable auth {
    IColonyNetwork(colonyNetworkAddress).registerColonyLabel(colonyName, orbitdb);
  }

  function addGlobalSkill(uint _parentSkillId) public
  stoppable
  auth
  returns (uint256)
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addSkill(_parentSkillId, true);
  }

  function setNetworkFeeInverse(uint256 _feeInverse) public
  stoppable
  auth
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.setFeeInverse(_feeInverse);
  }

  function addNetworkColonyVersion(uint256 _version, address _resolver) public
  stoppable
  auth
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addColonyVersion(_version, _resolver);
  }

  function addDomain(uint256 _permissionDomainId, uint256 _domainProofIndex, uint256 _parentDomainId) public
  stoppable
  auth2(_permissionDomainId, _parentDomainId, _domainProofIndex)
  domainExists(_parentDomainId)
  {
    // Note: Remove when we want to allow more domain hierarchy levels
    require(_parentDomainId == 1, "colony-parent-domain-not-root");

    uint256 parentSkillId = domains[_parentDomainId].skillId;

    // Setup new local skill
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 newLocalSkill = colonyNetwork.addSkill(parentSkillId, false);

    // Add domain to local mapping
    initialiseDomain(newLocalSkill);
  }

  function getDomain(uint256 _id) public view returns (Domain memory domain) {
    domain = domains[_id];
  }

  function getDomainCount() public view returns (uint256) {
    return domainCount;
  }

  function verifyReputationProof(bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)
  public view
  stoppable
  returns (bool)
  {
    uint256 colonyAddress;
    uint256 skillid;
    uint256 userAddress;
    assembly {
        colonyAddress := mload(add(key,32))
        skillid := mload(add(key,52)) // Colony address was 20 bytes long, so add 20 bytes
        userAddress := mload(add(key,84)) // Skillid was 32 bytes long, so add 32 bytes
    }
    colonyAddress >>= 96;
    userAddress >>= 96;

    // Require that the user is proving their own reputation in this colony.
    if (address(colonyAddress) != address(this) || address(userAddress) != msg.sender) {
      return false;
    }

    // Get roothash from colonynetwork
    bytes32 rootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    bytes32 impliedHash = getImpliedRootHashKey(key, value, branchMask, siblings);
    if (rootHash != impliedHash) {
      return false;
    }

    return true;
  }

  function upgrade(uint256 _newVersion) public always auth {
    // Upgrades can only go up in version
    uint256 currentVersion = version();
    require(_newVersion > currentVersion, "colony-version-must-be-newer");
    // Requested version has to be registered
    address newResolver = IColonyNetwork(colonyNetworkAddress).getColonyVersionResolver(_newVersion);
    require(newResolver != address(0x0), "colony-version-must-be-registered");
    IEtherRouter currentColony = IEtherRouter(address(this));
    currentColony.setResolver(newResolver);

    emit ColonyUpgraded(currentVersion, _newVersion);
  }

  function checkNotAdditionalProtectedVariable(uint256 _slot) public view recovery {
    bool protected = false;
    uint256 networkAddressSlot;
    assembly {
      // Use this if statement once https://github.com/sc-forks/solidity-coverage/issues/287 fixed
      // if eq(slot, colonyNetworkAddress_slot) { protected := 1 }
      networkAddressSlot := colonyNetworkAddress_slot
    }
    if (networkAddressSlot==_slot) {
      protected = true;
    }
    require(!protected, "colony-protected-variable");
  }

  function setFunctionReviewers(bytes4 _sig, TaskRole _firstReviewer, TaskRole _secondReviewer)
  private
  {
    reviewers[_sig] = [_firstReviewer, _secondReviewer];
  }

  function setRoleAssignmentFunction(bytes4 _sig) private {
    roleAssignmentSigs[_sig] = true;
  }

  function initialiseDomain(uint256 _skillId) private skillExists(_skillId) {
    domainCount += 1;
    // Create a new funding pot
    fundingPotCount += 1;
    fundingPots[fundingPotCount] = FundingPot({
      associatedType: FundingPotAssociatedType.Domain,
      associatedTypeId: domainCount,
      payoutsWeCannotMake: 0
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
