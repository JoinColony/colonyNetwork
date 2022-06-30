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

import "./../colony/ColonyDataTypes.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract StakedExpenditure is ColonyExtensionMeta, PatriciaTreeProofs {

  // Events

  event ExpenditureMadeViaStake(address indexed creator, uint256 expenditureId, uint256 stake);
  event ExpenditureCancelled(uint256 expenditureId);
  event StakeReclaimed(uint256 expenditureId);

  // Datatypes

  struct Stake {
    address creator;
    uint256 amount;
  }

  // Storage

  uint256 stakeFraction;

  mapping (uint256 => Stake) stakes;

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "staked-expenditure-caller-not-root");
    _;
  }

  // Overrides

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("StakedExpenditure");
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
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  // Public

  function setStakeFraction(uint256 _stakeFraction) public onlyRoot {
    require(_stakeFraction <= WAD, "staked-expenditure-value-too-large");
    stakeFraction = _stakeFraction;
  }

  function makeExpenditureWithStake(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    uint256 domainRep = getReputationFromProof(_domainId, _key, _value, _branchMask, _siblings);
    uint256 stakeAmount = wmul(domainRep, stakeFraction);

    colony.obligateStake(msgSender(), _domainId, stakeAmount);
    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, _domainId);

    stakes[expenditureId] = Stake({ creator: msgSender(), amount: stakeAmount });
    colony.transferExpenditure(expenditureId, msgSender());

    emit ExpenditureMadeViaStake(msgSender(), expenditureId, stakeAmount);
  }

  function reclaimStake(uint256 _expenditureId) public {
    Stake storage stake = stakes[_expenditureId];
    require(stake.amount > 0, "staked-expenditure-nothing-to-claim");

    uint256 stakeAmount = stake.amount;
    address stakeCreator = stake.creator;
    delete stakes[_expenditureId];

    ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(_expenditureId);
    require(
      expenditure.status == ColonyDataTypes.ExpenditureStatus.Cancelled ||
      expenditure.status == ColonyDataTypes.ExpenditureStatus.Finalized,
      "staked-expenditure-expenditure-invalid-state"
    );

    colony.deobligateStake(stakeCreator, expenditure.domainId, stakeAmount);

    emit StakeReclaimed(_expenditureId);
  }

  function cancelAndReclaimStake(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _expenditureId
  )
    public
  {
    Stake storage stake = stakes[_expenditureId];
    ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(_expenditureId);

    require(expenditure.owner == msgSender(), "staked-expenditure-must-be-owner");

    require(
      expenditure.status == ColonyDataTypes.ExpenditureStatus.Draft,
      "staked-expenditure-expenditure-not-draft"
    );

    cancelExpenditure(_permissionDomainId, _childSkillIndex, _expenditureId, expenditure.owner);

    // slither-disable-next-line reentrancy-no-eth
    reclaimStake(_expenditureId);
  }

  function cancelAndPunish(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    uint256 _expenditureId,
    bool _punish
  )
    public
  {
    ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(_expenditureId);

    require(
      colony.hasInheritedUserRole(
        msgSender(),
        _callerPermissionDomainId,
        ColonyDataTypes.ColonyRole.Arbitration,
        _callerChildSkillIndex,
        expenditure.domainId
      ),
      "staked-expenditure-caller-not-arbitration"
    );
    require(
      expenditure.status != ColonyDataTypes.ExpenditureStatus.Cancelled,
      "staked-expenditure-expenditure-already-cancelled"
    );

    require(
      expenditure.status != ColonyDataTypes.ExpenditureStatus.Draft,
      "staked-expenditure-expenditure-still-draft"
    );

    if (_punish) {
      Stake storage stake = stakes[_expenditureId];
      require(stake.amount > 0, "staked-expenditure-nothing-to-slash");

      uint256 stakeAmount = stake.amount;
      address stakeCreator = stake.creator;
      delete stakes[_expenditureId];

      colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), stakeCreator, expenditure.domainId, stakeAmount, address(0x0));

      colony.emitDomainReputationPenalty(
        _permissionDomainId,
        _childSkillIndex,
        expenditure.domainId,
        stakeCreator,
        -int256(stakeAmount)
      );
    }

    cancelExpenditure(_permissionDomainId, _childSkillIndex, _expenditureId, expenditure.owner);
  }

  // View

  function getStakeFraction() public view returns (uint256) {
    return stakeFraction;
  }

  function getStake(uint256 _expenditureId) public view returns (Stake memory stake) {
    return stakes[_expenditureId];
  }

  // Internal

  uint256 constant EXPENDITURE_SLOT = 25;
  bool constant ARRAY = true;

  function cancelExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _expenditureId,
    address _expenditureOwner
  )
    internal
  {
    // Get the slot storing 0x{owner}{state}
    bool[] memory mask = new bool[](1);
    mask[0] = ARRAY;
    bytes32[] memory keys = new bytes32[](1);
    keys[0] = bytes32(uint256(0));

    // Prepare the new 0x000...{owner}{state} value
    bytes32 value = (
      bytes32(bytes20(_expenditureOwner)) >> 0x58 | // Shift the address to the right, except for one byte
      bytes32(uint256(ColonyDataTypes.ExpenditureStatus.Cancelled)) // Put this value in that rightmost byte
    );

    colony.setExpenditureState(
      _permissionDomainId,
      _childSkillIndex,
      _expenditureId,
      EXPENDITURE_SLOT,
      mask,
      keys,
      value
    );

    emit ExpenditureCancelled(_expenditureId);
  }

  function getReputationFromProof(
    uint256 _domainId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal
    view
    returns (uint256)
  {
    bytes32 rootHash = IColonyNetwork(colony.getColonyNetwork()).getReputationRootHash();
    bytes32 impliedRoot = getImpliedRootHashKey(_key, _value, _branchMask, _siblings);
    require(rootHash == impliedRoot, "staked-expenditure-invalid-root-hash");


    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkillId;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(_value, 32))
      keyColonyAddress := mload(add(_key, 20))
      keySkillId := mload(add(_key, 52))
      keyUserAddress := mload(add(_key, 72))
    }

    require(keyColonyAddress == address(colony), "staked-expenditure-invalid-colony-address");
    require(keySkillId == colony.getDomain(_domainId).skillId, "staked-expenditure-invalid-skill-id");
    require(keyUserAddress == address(0x0), "staked-expenditure-invalid-user-address");

    return reputationValue;
  }
}
