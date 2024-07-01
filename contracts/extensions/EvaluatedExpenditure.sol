// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.25;
pragma experimental ABIEncoderV2;

import { ColonyExtension } from "./ColonyExtension.sol";
import { BasicMetaTransaction } from "./../common/BasicMetaTransaction.sol";

// ignore-file-swc-108

contract EvaluatedExpenditure is ColonyExtension, BasicMetaTransaction {
  uint256 constant EXPENDITURESLOTS_SLOT = 26;
  uint256 constant PAYOUT_MODIFIER_OFFSET = 2;
  bool constant MAPPING = false;
  bool constant ARRAY = true;
  mapping(address => uint256) metatransactionNonces;

  // Interface overrides

  /// @notice Returns the identifier of the extension
  /// @return _identifier The extension's identifier
  function identifier() public pure override returns (bytes32 _identifier) {
    return keccak256("EvaluatedExpenditure");
  }

  /// @notice Returns the version of the extension
  /// @return _version The extension's version number
  function version() public pure override returns (uint256 _version) {
    return 7;
  }

  /// @notice Gets the next nonce for a meta-transaction
  /// @param _user The user's address
  /// @return nonce The nonce
  function getMetatransactionNonce(address _user) public view override returns (uint256 nonce) {
    return metatransactionNonces[_user];
  }

  function incrementMetatransactionNonce(address _user) internal override {
    metatransactionNonces[_user] += 1;
  }

  // Public

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
  ) public {
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
        bytes32(uint256(_payoutModifiers[i]))
      );
    }
  }
}
