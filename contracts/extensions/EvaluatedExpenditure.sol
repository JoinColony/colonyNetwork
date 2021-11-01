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

import "./ColonyExtension.sol";
import "./../common/BasicMetaTransaction.sol";

// ignore-file-swc-108


contract EvaluatedExpenditure is ColonyExtension, BasicMetaTransaction {

  uint256 constant EXPENDITURESLOTS_SLOT = 26;
  uint256 constant PAYOUT_MODIFIER_OFFSET = 2;
  bool constant MAPPING = false;
  bool constant ARRAY = true;
  mapping(address => uint256) metatransactionNonces;

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("EvaluatedExpenditure");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 2;
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

  function getMetatransactionNonce(address _userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[_userAddress];
  }

  function incrementMetatransactionNonce(address _user) override internal {
    metatransactionNonces[_user] = add(metatransactionNonces[_user], 1);
  }

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

}
