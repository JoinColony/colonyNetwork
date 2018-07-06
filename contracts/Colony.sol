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

import "./ColonyStorage.sol";
import "./PatriciaTree/PatriciaTreeProofs.sol";
import "./EtherRouter.sol";


contract Colony is ColonyStorage, PatriciaTreeProofs {

  // This function, exactly as defined, is used in build scripts. Take care when updating.
  // Version number should be upped with every change in Colony or its dependency contracts or libraries.
  function version() public pure returns (uint256) { return 1; }

  function setOwnerRole(address _user) public auth {
    // To allow only one address to have owner role at a time, we have to remove current owner from their role
    Authority colonyAuthority = Authority(authority);
    colonyAuthority.setUserRole(msg.sender, OWNER_ROLE, false);
    colonyAuthority.setUserRole(_user, OWNER_ROLE, true);
  }

  function setAdminRole(address _user) public auth {
    Authority(authority).setUserRole(_user, ADMIN_ROLE, true);
  }

  // Can only be called by the owner role.
  function removeAdminRole(address _user) public auth {
    Authority(authority).setUserRole(_user, ADMIN_ROLE, false);
  }

  function setToken(address _token) public
  auth
  {
    token = ERC20Extended(_token);
  }

  function getToken() public view returns (address) {
    return token;
  }

  function initialiseColony(address _address) public {
    require(colonyNetworkAddress == 0x0, "colony-initialise-bad-address");
    colonyNetworkAddress = _address;

    // Initialise the task update reviewers
    setFunctionReviewers(bytes4(keccak256("setTaskBrief(uint256,bytes32)")), MANAGER, WORKER);
    setFunctionReviewers(bytes4(keccak256("setTaskDueDate(uint256,uint256)")), MANAGER, WORKER);
    setFunctionReviewers(bytes4(keccak256("setTaskSkill(uint256,uint256)")), MANAGER, WORKER);
    // We are setting a manager to both reviewers, but it will require just one signature from manager
    setFunctionReviewers(bytes4(keccak256("setTaskManagerPayout(uint256,address,uint256)")), MANAGER, MANAGER);
    setFunctionReviewers(bytes4(keccak256("setTaskEvaluatorPayout(uint256,address,uint256)")), MANAGER, EVALUATOR);
    setFunctionReviewers(bytes4(keccak256("setTaskWorkerPayout(uint256,address,uint256)")), MANAGER, WORKER);
    setFunctionReviewers(bytes4(keccak256("removeTaskEvaluatorRole(uint256)")), MANAGER, EVALUATOR);
    setFunctionReviewers(bytes4(keccak256("removeTaskWorkerRole(uint256)")), MANAGER, WORKER);

    setRoleAssignmentFunction(bytes4(keccak256("setTaskManagerRole(uint256,address)")));
    setRoleAssignmentFunction(bytes4(keccak256("setTaskEvaluatorRole(uint256,address)")));
    setRoleAssignmentFunction(bytes4(keccak256("setTaskWorkerRole(uint256,address)")));

    // Initialise the root domain
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 rootLocalSkill = colonyNetwork.getSkillCount();
    initialiseDomain(rootLocalSkill);
  }

  function bootstrapColony(address[] _users, int[] _amounts) public
  auth
  isInBootstrapPhase
  {
    require(_users.length == _amounts.length, "colony-bootstrap-bad-inputs");

    for (uint i = 0; i < _users.length; i++) {
      require(_amounts[i] >= 0, "colony-bootstrap-bad-amount-input");

      token.transfer(_users[i], uint(_amounts[i]));
      IColonyNetwork(colonyNetworkAddress).appendReputationUpdateLog(_users[i], _amounts[i], domains[1].skillId);
    }
  }

  function mintTokens(uint _wad) public
  auth
  {
    return token.mint(_wad);
  }

  function mintTokensForColonyNetwork(uint _wad) public {
    require(msg.sender == colonyNetworkAddress, "colony-access-denied-only-network-allowed"); // Only the colony Network can call this function
    require(this == IColonyNetwork(colonyNetworkAddress).getMetaColony(), "colony-access-denied-only-meta-colony-allowed"); // Function only valid on the Meta Colony
    token.mint(_wad);
    token.transfer(colonyNetworkAddress, _wad);
  }

  function addGlobalSkill(uint _parentSkillId) public
  auth
  returns (uint256)
  {
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    return colonyNetwork.addSkill(_parentSkillId, true);
  }

  function addDomain(uint256 _parentSkillId) public
  auth
  localSkill(_parentSkillId)
  {
    // Note: remove that when we start allowing more domain hierarchy levels
    // Instead check that the parent skill id belongs to this colony own domain
    // Get the local skill id of the root domain
    uint256 rootDomainSkillId = domains[1].skillId;
    require(_parentSkillId == rootDomainSkillId, "colony-parent-skill-not-root");

    // Setup new local skill
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
    uint256 newLocalSkill = colonyNetwork.addSkill(_parentSkillId, false);

    // Add domain to local mapping
    initialiseDomain(newLocalSkill);
  }

  function getDomain(uint256 _id) public view returns (uint256, uint256) {
    Domain storage d = domains[_id];
    return (d.skillId, d.potId);
  }

  function getDomainCount() public view returns (uint256) {
    return domainCount;
  }
  function setFunctionReviewers(bytes4 _sig, uint8 _firstReviewer, uint8 _secondReviewer)
  private
  {
    uint8[2] memory _reviewers = [_firstReviewer, _secondReviewer];
    reviewers[_sig] = _reviewers;
  }

  function setRoleAssignmentFunction(bytes4 _sig) private {
    roleAssignmentSigs[_sig] = true;
  }

  modifier verifyKey(bytes key) {
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
    require(address(colonyAddress) == address(this));
    require(address(userAddress) == msg.sender);
    _;
  }

  function verifyReputationProof(bytes key, bytes value, uint branchMask, bytes32[] siblings)  // solium-disable-line security/no-assign-params
  verifyKey(key)
  public returns (bool)
  {
    // Get roothash from colonynetwork
    bytes32 rootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    bytes32 impliedHash = getImpliedRoot(key, value, branchMask, siblings);
    require(rootHash==impliedHash, "colony-invalid-reputation-proof");
    return true;
  }

  function upgrade(uint256 _newVersion) public auth {
    // Upgrades can only go up in version
    uint256 currentVersion = version();
    require(_newVersion > currentVersion);
    // Requested version has to be registered
    address newResolver = IColonyNetwork(colonyNetworkAddress).getColonyVersionResolver(_newVersion);
    require(newResolver != 0x0);
    EtherRouter e = EtherRouter(address(this));
    e.setResolver(newResolver);
  }

  function initialiseDomain(uint256 _skillId) private skillExists(_skillId) {
    // Create a new pot
    potCount += 1;

    // Create a new domain with the given skill and new pot
    domainCount += 1;
    domains[domainCount] = Domain({
      skillId: _skillId,
      potId: potCount
    });

    emit DomainAdded(domainCount);
    emit PotAdded(potCount);
  }
}
