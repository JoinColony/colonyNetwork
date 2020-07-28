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

import "./../common/IEtherRouter.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyStorage.sol";


contract Colony is ColonyStorage, PatriciaTreeProofs {

  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public pure returns (uint256 colonyVersion) { return 4; }

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

  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return ColonyAuthority(address(authority)).getUserRoles(who, where);
  }

  function getColonyNetwork() public view returns (address) {
    return colonyNetworkAddress;
  }

  function getToken() public view returns (address) {
    return token;
  }

  function emitDomainReputationPenalty(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    address _user,
    int256 _amount
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  {
    require(_amount <= 0, "colony-penalty-cannot-be-positive");
    IColonyNetwork(colonyNetworkAddress).appendReputationUpdateLog(_user, _amount, domains[_domainId].skillId);
  }

  function emitSkillReputationPenalty(uint256 _skillId, address _user, int256 _amount)
  public stoppable auth validGlobalSkill(_skillId)
  {
    require(_amount <= 0, "colony-penalty-cannot-be-positive");
    IColonyNetwork(colonyNetworkAddress).appendReputationUpdateLog(_user, _amount, _skillId);
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

      assert(ERC20Extended(token).transfer(_users[i], uint256(_amounts[i])));
      IColonyNetwork(colonyNetworkAddress).appendReputationUpdateLog(_users[i], _amounts[i], domains[1].skillId);
    }

    emit ColonyBootstrapped(_users, _amounts);
  }

  function mintTokens(uint _wad) public
  stoppable
  auth
  {
    ERC20Extended(token).mint(address(this), _wad); // ignore-swc-107
  }

  function mintTokensFor(address _guy, uint _wad) public
  stoppable
  auth
  {
    ERC20Extended(token).mint(_guy, _wad); // ignore-swc-107
  }

  function mintTokensForColonyNetwork(uint _wad) public stoppable {
    // Only the colony Network can call this function
    require(msg.sender == colonyNetworkAddress, "colony-access-denied-only-network-allowed");
    // Function only valid on the Meta Colony
    require(address(this) == IColonyNetwork(colonyNetworkAddress).getMetaColony(), "colony-access-denied-only-meta-colony-allowed");
    ERC20Extended(token).mint(_wad);
    assert(ERC20Extended(token).transfer(colonyNetworkAddress, _wad));
  }

  function registerColonyLabel(string memory colonyName, string memory orbitdb) public stoppable auth {
    IColonyNetwork(colonyNetworkAddress).registerColonyLabel(colonyName, orbitdb);
  }

  function updateColonyOrbitDB(string memory orbitdb) public stoppable auth {
    IColonyNetwork(colonyNetworkAddress).updateColonyOrbitDB(orbitdb);
  }

  function addGlobalSkill() public
  stoppable
  auth
  returns (uint256)
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addSkill(0); // ignore-swc-107
  }

  function deprecateGlobalSkill(uint256 _skillId) public
  stoppable
  auth
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.deprecateSkill(_skillId);
  }

  function setNetworkFeeInverse(uint256 _feeInverse) public
  stoppable
  auth
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.setFeeInverse(_feeInverse); // ignore-swc-107
  }

  function addNetworkColonyVersion(uint256 _version, address _resolver) public
  stoppable
  auth
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addColonyVersion(_version, _resolver);
  }

  function addDomain(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _parentDomainId) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, _parentDomainId)
  {
    // Note: Remove when we want to allow more domain hierarchy levels
    require(_parentDomainId == 1, "colony-parent-domain-not-root");

    uint256 parentSkillId = domains[_parentDomainId].skillId;

    // Setup new local skill
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 newLocalSkill = colonyNetwork.addSkill(parentSkillId);

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
    // Upgrades can only go up in version, one at a time
    uint256 currentVersion = version();
    require(_newVersion == currentVersion + 1, "colony-version-must-be-one-newer");
    // Requested version has to be registered
    address newResolver = IColonyNetwork(colonyNetworkAddress).getColonyVersionResolver(_newVersion);
    require(newResolver != address(0x0), "colony-version-must-be-registered");
    IEtherRouter currentColony = IEtherRouter(address(this));
    currentColony.setResolver(newResolver);
    // This is deliberately an external call, because we don't know what we need to do for our next upgrade yet.
    // Because it's called after setResolver, it'll do the new finishUpgrade, which will be populated with what we know
    // we need to do once we know what's in it!
    this.finishUpgrade();
    emit ColonyUpgraded(currentVersion, _newVersion);
  }

  // v4 to v5
  function finishUpgrade() public always {
    ColonyAuthority colonyAuthority = ColonyAuthority(address(authority));
    bytes4 sig;

    // Add stake management functionality (colonyNetwork#757)
    sig = bytes4(keccak256("transferStake(uint256,uint256,address,address,uint256,uint256,address)"));
    colonyAuthority.setRoleCapability(uint8(ColonyRole.Arbitration), address(this), sig, true);

    // Add reputation penalty functionality (colonyNetwork#845)
    sig = bytes4(keccak256("emitDomainReputationPenalty(uint256,uint256,uint256,address,int256)"));
    colonyAuthority.setRoleCapability(uint8(ColonyRole.Arbitration), address(this), sig, true);
    sig = bytes4(keccak256("emitSkillReputationPenalty(uint256,address,int256)"));
    colonyAuthority.setRoleCapability(uint8(ColonyRole.Arbitration), address(this), sig, true);
  }

  function checkNotAdditionalProtectedVariable(uint256 _slot) public view recovery {
    require(_slot != COLONY_NETWORK_SLOT, "colony-protected-variable");
  }

  function approveStake(address _approvee, uint256 _domainId, uint256 _amount) public stoppable {
    approvals[msg.sender][_approvee][_domainId] = add(approvals[msg.sender][_approvee][_domainId], _amount);

    ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking()).approveStake(msg.sender, _amount, token);
  }

  function obligateStake(address _user, uint256 _domainId, uint256 _amount) public stoppable {
    approvals[_user][msg.sender][_domainId] = sub(approvals[_user][msg.sender][_domainId], _amount);
    obligations[_user][msg.sender][_domainId] = add(obligations[_user][msg.sender][_domainId], _amount);

    ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking()).obligateStake(_user, _amount, token);
  }

  function deobligateStake(address _user, uint256 _domainId, uint256 _amount) public stoppable {
    obligations[_user][msg.sender][_domainId] = sub(obligations[_user][msg.sender][_domainId], _amount);

    ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking()).deobligateStake(_user, _amount, token);
  }

  function transferStake(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _obligator,
    address _user,
    uint256 _domainId,
    uint256 _amount,
    address _beneficiary
  ) public stoppable authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  {
    obligations[_user][_obligator][_domainId] = sub(obligations[_user][_obligator][_domainId], _amount);

    ITokenLocking(IColonyNetwork(colonyNetworkAddress).getTokenLocking()).transferStake(_user, _amount, token, _beneficiary);
  }

  function getApproval(address _user, address _obligator, uint256 _domainId) public view returns (uint256) {
    return approvals[_user][_obligator][_domainId];
  }

  function getObligation(address _user, address _obligator, uint256 _domainId) public view returns (uint256) {
    return obligations[_user][_obligator][_domainId];
  }

  function initialiseDomain(uint256 _skillId) internal skillExists(_skillId) {
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

  function setFunctionReviewers(bytes4 _sig, TaskRole _firstReviewer, TaskRole _secondReviewer)
  private
  {
    reviewers[_sig] = [_firstReviewer, _secondReviewer];
  }

  function setRoleAssignmentFunction(bytes4 _sig) private {
    roleAssignmentSigs[_sig] = true;
  }
}
