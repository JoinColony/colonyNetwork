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

pragma solidity 0.8.23;
pragma experimental ABIEncoderV2;

import { IColony } from "./../colony/IColony.sol";

contract SetExpenditureSingleValues {
  struct SetExpenditureValuesCallData {
    uint256[] slots;
    uint256[][] wrappedSlots;
    address payable[] recipients;
    uint256[] skills;
    address[] tokens;
    uint256[][] amounts;
  }

  function setExpenditureSingleValues(
    address colony,
    uint256 _expenditureId,
    uint256 _slot,
    address payable _recipient,
    uint256 _skillId,
    address _token,
    uint256 _amount
  ) internal {
    SetExpenditureValuesCallData memory data = SetExpenditureValuesCallData(
      new uint256[](1),
      new uint256[][](1),
      new address payable[](1),
      new uint256[](0),
      new address[](1),
      new uint256[][](1)
    );

    if (_skillId != 0) {
      data.skills = new uint256[](1);
      data.skills[0] = _skillId;
    }

    data.slots[0] = _slot;
    data.wrappedSlots[0] = new uint256[](1);
    data.wrappedSlots[0][0] = _slot;

    data.recipients[0] = _recipient;
    data.tokens[0] = _token;
    data.amounts[0] = new uint256[](1);
    data.amounts[0][0] = _amount;

    uint256[] memory emptyUint256Array;
    int256[] memory emptyInt256Array;

    IColony(colony).setExpenditureValues(
      _expenditureId,
      data.slots,
      data.recipients,
      data.slots,
      data.skills,
      emptyUint256Array,
      emptyUint256Array,
      emptyUint256Array,
      emptyInt256Array,
      data.tokens,
      data.wrappedSlots,
      data.amounts
    );
  }
}