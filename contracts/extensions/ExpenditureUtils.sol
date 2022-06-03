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


contract ExpenditureUtils is ColonyExtensionMeta, PatriciaTreeProofs {

  // Storage

  uint256 stakeFraction;

  mapping (address => mapping (uint256 => uint256)) stakes;

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "evaluated-expenditure-caller-not-root");
    _;
  }

  // Overrides

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("ExpenditureUtils");
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
    uint256 stake = wmul(domainRep, stakeFraction);

    colony.obligateStake(msgSender(), _domainId, stake);
    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, _domainId);

    stakes[msgSender()][expenditureId] = stake;
    colony.transferExpenditure(expenditureId, msgSender());
  }

  function slashStake(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _expenditureId,
    address _owner
  )
    public
  {
    uint256 stake = stakes[_owner][_expenditureId];
    require(stake > 0, "expenditure-utils-nothing-to-slash");

    uint256 expenditureDomainId = colony.getExpenditure(_expenditureId).domainId;
    require(
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, ColonyDataTypes.ColonyRole.Arbitration, _childSkillIndex, expenditureDomainId),
      "expenditure-utils-caller-not-arbitration"
    );

    delete stakes[_owner][_expenditureId];
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), _owner, expenditureDomainId, stake, address(0x0));
  }

  function reclaimStake(uint256 _expenditureId) public {
    uint256 stake = stakes[msgSender()][_expenditureId];
    require(stake > 0, "expenditure-utils-nothing-to-claim");

    ColonyDataTypes.Expenditure memory expenditure = colony.getExpenditure(_expenditureId);
    require(
      expenditure.status == ColonyDataTypes.ExpenditureStatus.Cancelled ||
      expenditure.status == ColonyDataTypes.ExpenditureStatus.Finalized,
      "expenditure-utils-expenditure-invalid-state"
    );

    delete stakes[msgSender()][_expenditureId];
    colony.deobligateStake(msgSender(), expenditure.domainId, stake);
  }

  uint256 constant EXPENDITURESLOTS_SLOT = 26;
  uint256 constant PAYOUT_MODIFIER_OFFSET = 2;
  bool constant MAPPING = false;
  bool constant ARRAY = true;

  /// @notice Sets the payout modifiers in given expenditure slots, using the arbitration permission
  /// @param _permissionDomainId The domainId in which the extension has the arbitration permission
  /// @param _childSkillIndex The index that the `_domainId` is relative to `_permissionDomainId`
  /// @param _id Expenditure identifier
  /// @param _slots Array of slots to set payout modifiers
  /// @param _payoutModifiers Values (between +/- WAD) to modify the payout & reputation bonus
  function setExpenditurePayoutModifiers(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256[] memory _slots,
    int256[] memory _payoutModifiers
  )
    public
  {
    require(_slots.length == _payoutModifiers.length, "evaluated-expenditure-bad-slots");
    require(colony.getExpenditure(_id).owner == msgSender(), "evaluated-expenditure-not-owner");

    bool[] memory mask = new bool[](2);
    bytes32[] memory keys = new bytes32[](2);

    mask[0] = MAPPING;
    mask[1] = ARRAY;

    keys[1] = bytes32(PAYOUT_MODIFIER_OFFSET);

    for (uint256 i; i < _slots.length; i++) {
      keys[0] = bytes32(_slots[i]);

      colony.setExpenditureState(
        _permissionDomainId,
        _childSkillIndex,
        _id,
        EXPENDITURESLOTS_SLOT,
        mask,
        keys,
        bytes32(_payoutModifiers[i])
      );
    }
  }

// Internal

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
    require(rootHash == impliedRoot, "expenditure-utils-invalid-root-hash");


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

    require(keyColonyAddress == address(colony), "expenditure-utils-invalid-colony-address");
    require(keySkillId == colony.getDomain(_domainId).skillId, "expenditure-utils-invalid-skill-id");
    require(keyUserAddress == address(0x0), "expenditure-utils-invalid-user-address");

    return reputationValue;
  }
}
