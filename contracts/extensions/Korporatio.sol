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

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "./../../lib/dappsys/erc20.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract Korporatio is ColonyExtensionMeta {

  // Constants

  // Events

  event ApplicationCreated(uint256 indexed stakeId, address indexed applicant);
  event ApplicationCancelled(uint256 indexed stakeId);
  event StakeReclaimed(uint256 indexed stakeId);
  event StakeSlashed(uint256 indexed stakeId);
  event ApplicationUpdated(uint256 indexed stakeId, bytes32 ipfsHash);
  event ApplicationSubmitted(uint256 indexed stakeId);

  // Data structures

  struct Application {
    address applicant;
    uint256 stakeAmount;
    uint256 cancelledAt;
  }

  // Storage

  address colonyNetworkAddress;

  uint256 stakeFraction;
  uint256 claimDelay;

  uint256 numApplications;
  mapping (uint256 => Application) applications;

  // Modifiers

  modifier onlyApplicant(uint256 _applicationId) {
    require(msgSender() == applications[_applicationId].applicant, "korporatio-not-applicant");
    _;
  }

  // Overrides

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("Korporatio");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    colonyNetworkAddress = colony.getColonyNetwork();
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(payable(address(colony)));
  }

  // Public

  function initialise(uint256 _stakeFraction, uint256 _claimDelay) public {
    require(
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Architecture),
      "korporatio-not-root-architect"
    );

    stakeFraction = _stakeFraction;
    claimDelay = _claimDelay;
  }

  function createApplication(
    bytes memory _colonyKey,
    bytes memory _colonyValue,
    uint256 _colonyBranchMask,
    bytes32[] memory _colonySiblings,
    bytes memory _userKey,
    bytes memory _userValue,
    uint256 _userBranchMask,
    bytes32[] memory _userSiblings
  )
    public
    notDeprecated
  {
    require(stakeFraction > 0, "korporatio-not-initialised");

    bytes32 rootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    uint256 rootSkillId = colony.getDomain(1).skillId;

    uint256 colonyReputation = checkReputation(rootHash, rootSkillId, address(0x0), _colonyKey, _colonyValue, _colonyBranchMask, _colonySiblings);
    uint256 userReputation = checkReputation(rootHash, rootSkillId, msgSender(), _userKey, _userValue, _userBranchMask, _userSiblings);

    uint256 requiredStake = wmul(colonyReputation, stakeFraction);
    require(userReputation >= requiredStake, "korporatio-insufficient-rep");

    applications[++numApplications] = Application({
      applicant: msgSender(),
      stakeAmount: requiredStake,
      cancelledAt: UINT256_MAX
    });

    colony.obligateStake(msgSender(), 1, requiredStake);

    emit ApplicationCreated(numApplications, msgSender());
  }

  function createFreeApplication() public notDeprecated {
    require (
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root) ||
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Administration),
      "korporatio-must-submit-stake"
    );

    applications[++numApplications] = Application({
      applicant: msgSender(),
      stakeAmount: 0,
      cancelledAt: UINT256_MAX
    });

    emit ApplicationCreated(numApplications, msgSender());
  }

  function cancelApplication(uint256 _applicationId) public onlyApplicant(_applicationId) {
    applications[_applicationId].cancelledAt = block.timestamp;

    emit ApplicationCancelled(_applicationId);
  }

  function reclaimStake(uint256 _applicationId) public onlyApplicant(_applicationId) {
    Application storage application = applications[_applicationId];
    require(application.applicant == msgSender(), "korporatio-not-applicant");
    require(application.cancelledAt + claimDelay <= block.timestamp, "korporatio-cannot-reclaim");

    uint256 stakeAmount = application.stakeAmount;
    delete applications[_applicationId];

    colony.deobligateStake(msgSender(), 1, stakeAmount);

    emit StakeReclaimed(_applicationId);
  }

  function slashStake(uint256 _applicationId, bool _punish) public {
    require(applications[_applicationId].stakeAmount > 0, "korporatio-cannot-slash");

    require(
      colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Arbitration),
      "korporatio-caller-not-arbitration"
    );

    address applicant = applications[_applicationId].applicant;
    uint256 stakeAmount = applications[_applicationId].stakeAmount;
    delete applications[_applicationId];

    colony.transferStake(1, UINT256_MAX, address(this), applicant, 1, stakeAmount, address(0x0));
    if (_punish) { colony.emitDomainReputationPenalty(1, UINT256_MAX, 1, applicant, -int256(stakeAmount)); }

    emit StakeSlashed(_applicationId);
  }

  function updateApplication(uint256 _applicationId, bytes32 _ipfsHash) public onlyApplicant(_applicationId) {
    require(applications[_applicationId].cancelledAt == UINT256_MAX, "korporatio-stake-cancelled");

    emit ApplicationUpdated(_applicationId, _ipfsHash);
  }

  function submitApplication(uint256 _applicationId) public {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "korporatio-caller-not-root");
    require(applications[_applicationId].cancelledAt == UINT256_MAX, "korporatio-stake-cancelled");

    applications[_applicationId].cancelledAt = block.timestamp;

    emit ApplicationSubmitted(_applicationId);
  }

  // View

  function getStakeFraction() external view returns (uint256) {
    return stakeFraction;
  }

  function getClaimDelay() external view returns (uint256) {
    return claimDelay;
  }

  function getNumApplications() external view returns (uint256) {
    return numApplications;
  }

  function getApplication(uint256 _id) external view returns (Application memory application) {
    application = applications[_id];
  }
}
