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

pragma solidity 0.8.21;
pragma experimental "ABIEncoderV2";

import { ColonyStorage } from "./ColonyStorage.sol";

contract ColonyExpenditure is ColonyStorage {
  int256 constant MAX_PAYOUT_MODIFIER = int256(WAD);
  int256 constant MIN_PAYOUT_MODIFIER = -int256(WAD);

  // Public functions

  function setDefaultGlobalClaimDelay(
    uint256 _defaultGlobalClaimDelay
  ) public stoppable auth {
    defaultGlobalClaimDelay = _defaultGlobalClaimDelay;

    emit ExpenditureGlobalClaimDelaySet(msgSender(), _defaultGlobalClaimDelay);
  }

  function makeExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  )
    public
    stoppable
    domainNotDeprecated(_domainId)
    authDomain(_permissionDomainId, _childSkillIndex, _domainId)
    returns (uint256)
  {
    expenditureCount += 1;
    fundingPotCount += 1;

    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType
      .Expenditure;
    fundingPots[fundingPotCount].associatedTypeId = expenditureCount;

    expenditures[expenditureCount] = Expenditure({
      status: ExpenditureStatus.Draft,
      owner: msgSender(),
      fundingPotId: fundingPotCount,
      domainId: _domainId,
      finalizedTimestamp: 0,
      globalClaimDelay: defaultGlobalClaimDelay
    });

    emit FundingPotAdded(fundingPotCount);
    emit ExpenditureAdded(msgSender(), expenditureCount);

    return expenditureCount;
  }

  function transferExpenditure(
    uint256 _id,
    address _newOwner
  ) public stoppable expenditureDraftOrLocked(_id) expenditureOnlyOwner(_id) {
    expenditures[_id].owner = _newOwner;

    emit ExpenditureTransferred(msgSender(), _id, _newOwner);
  }

  // Deprecated
  function transferExpenditureViaArbitration(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    address _newOwner
  )
    public
    stoppable
    expenditureDraftOrLocked(_id)
    authDomain(
      _permissionDomainId,
      _childSkillIndex,
      expenditures[_id].domainId
    )
  {
    expenditures[_id].owner = _newOwner;

    emit ExpenditureTransferred(msgSender(), _id, _newOwner);
  }

  function cancelExpenditure(
    uint256 _id
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    expenditures[_id].status = ExpenditureStatus.Cancelled;

    emit ExpenditureCancelled(msgSender(), _id);
  }

  function lockExpenditure(
    uint256 _id
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    expenditures[_id].status = ExpenditureStatus.Locked;

    emit ExpenditureLocked(msgSender(), _id);
  }

  function finalizeExpenditure(
    uint256 _id
  ) public stoppable expenditureDraftOrLocked(_id) expenditureOnlyOwner(_id) {
    FundingPot storage fundingPot = fundingPots[expenditures[_id].fundingPotId];
    require(
      fundingPot.payoutsWeCannotMake == 0,
      "colony-expenditure-not-funded"
    );

    expenditures[_id].status = ExpenditureStatus.Finalized;
    expenditures[_id].finalizedTimestamp = block.timestamp;

    emit ExpenditureFinalized(msgSender(), _id);
  }

  function setExpenditureMetadata(
    uint256 _id,
    string memory _metadata
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    emit ExpenditureMetadataSet(msgSender(), _id, _metadata);
  }

  function setExpenditureMetadata(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    string memory _metadata
  )
    public
    stoppable
    validExpenditure(_id)
    authDomain(
      _permissionDomainId,
      _childSkillIndex,
      expenditures[_id].domainId
    )
  {
    emit ExpenditureMetadataSet(msgSender(), _id, _metadata);
  }

  function setExpenditureRecipients(
    uint256 _id,
    uint256[] memory _slots,
    address payable[] memory _recipients
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    require(
      _slots.length == _recipients.length,
      "colony-expenditure-bad-slots"
    );

    for (uint256 i; i < _slots.length; i++) {
      expenditureSlots[_id][_slots[i]].recipient = _recipients[i];

      emit ExpenditureRecipientSet(msgSender(), _id, _slots[i], _recipients[i]);
    }
  }

  function setExpenditureSkills(
    uint256 _id,
    uint256[] memory _slots,
    uint256[] memory _skillIds
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    require(_slots.length == _skillIds.length, "colony-expenditure-bad-slots");

    for (uint256 i; i < _slots.length; i++) {
      require(
        isValidGlobalOrLocalSkill(_skillIds[i]),
        "colony-not-valid-global-or-local-skill"
      );

      // We only allow setting of the first skill here.
      // If we allow more in the future, make sure to have a hard limit that
      // comfortably limits respondToChallenge's gas.
      expenditureSlots[_id][_slots[i]].skills = new uint256[](1);
      expenditureSlots[_id][_slots[i]].skills[0] = _skillIds[i];

      emit ExpenditureSkillSet(msgSender(), _id, _slots[i], _skillIds[i]);
    }
  }

  function setExpenditureClaimDelays(
    uint256 _id,
    uint256[] memory _slots,
    uint256[] memory _claimDelays
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    require(
      _slots.length == _claimDelays.length,
      "colony-expenditure-bad-slots"
    );

    for (uint256 i; i < _slots.length; i++) {
      expenditureSlots[_id][_slots[i]].claimDelay = _claimDelays[i];

      emit ExpenditureClaimDelaySet(
        msgSender(),
        _id,
        _slots[i],
        _claimDelays[i]
      );
    }
  }

  function setExpenditurePayoutModifiers(
    uint256 _id,
    uint256[] memory _slots,
    int256[] memory _payoutModifiers
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    require(
      _slots.length == _payoutModifiers.length,
      "colony-expenditure-bad-slots"
    );

    for (uint256 i; i < _slots.length; i++) {
      expenditureSlots[_id][_slots[i]].payoutModifier = _payoutModifiers[i];

      emit ExpenditurePayoutModifierSet(
        msgSender(),
        _id,
        _slots[i],
        _payoutModifiers[i]
      );
    }
  }

  function setExpenditureValues(
    uint256 _id,
    uint256[] memory _recipientSlots,
    address payable[] memory _recipients,
    uint256[] memory _skillIdSlots,
    uint256[] memory _skillIds,
    uint256[] memory _claimDelaySlots,
    uint256[] memory _claimDelays,
    uint256[] memory _payoutModifierSlots,
    int256[] memory _payoutModifiers,
    address[] memory _payoutTokens,
    uint256[][] memory _payoutSlots,
    uint256[][] memory _payoutValues
  ) public stoppable expenditureDraft(_id) expenditureOnlyOwner(_id) {
    if (_recipients.length > 0) {
      setExpenditureRecipients(_id, _recipientSlots, _recipients);
    }
    if (_skillIds.length > 0) {
      setExpenditureSkills(_id, _skillIdSlots, _skillIds);
    }
    if (_claimDelays.length > 0) {
      setExpenditureClaimDelays(_id, _claimDelaySlots, _claimDelays);
    }
    if (_payoutModifiers.length > 0) {
      setExpenditurePayoutModifiers(
        _id,
        _payoutModifierSlots,
        _payoutModifiers
      );
    }
    if (_payoutTokens.length > 0) {
      setExpenditurePayouts(_id, _payoutTokens, _payoutSlots, _payoutValues);
    }
  }

  // Deprecated
  function setExpenditureRecipient(
    uint256 _id,
    uint256 _slot,
    address payable _recipient
  ) public stoppable {
    uint256[] memory slots = new uint256[](1);
    slots[0] = _slot;
    address payable[] memory recipients = new address payable[](1);
    recipients[0] = _recipient;
    setExpenditureRecipients(_id, slots, recipients);
  }

  // Deprecated
  function setExpenditureSkill(
    uint256 _id,
    uint256 _slot,
    uint256 _skillId
  ) public stoppable {
    uint256[] memory slots = new uint256[](1);
    slots[0] = _slot;
    uint256[] memory skillIds = new uint256[](1);
    skillIds[0] = _skillId;
    setExpenditureSkills(_id, slots, skillIds);
  }

  // Deprecated
  function setExpenditureClaimDelay(
    uint256 _id,
    uint256 _slot,
    uint256 _claimDelay
  ) public stoppable {
    uint256[] memory slots = new uint256[](1);
    slots[0] = _slot;
    uint256[] memory claimDelays = new uint256[](1);
    claimDelays[0] = _claimDelay;
    setExpenditureClaimDelays(_id, slots, claimDelays);
  }

  uint256 constant EXPENDITURES_SLOT = 25;
  uint256 constant EXPENDITURESLOTS_SLOT = 26;

  function setExpenditureState(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _storageSlot,
    bool[] memory _mask,
    bytes32[] memory _keys,
    bytes32 _value
  )
    public
    stoppable
    validExpenditure(_id)
    authDomain(
      _permissionDomainId,
      _childSkillIndex,
      expenditures[_id].domainId
    )
  {
    // Only allow editing expenditure status, owner, finalizedTimestamp, and globalClaimDelay
    //  Do not allow editing of fundingPotId or domainId
    //  Note that status + owner occupy one slot
    if (_storageSlot == EXPENDITURES_SLOT) {
      require(_keys.length == 1, "colony-expenditure-bad-keys");
      uint256 offset = uint256(_keys[0]);
      require(
        offset == 0 || offset == 3 || offset == 4,
        "colony-expenditure-bad-offset"
      );

      // Explicitly whitelist all slots, in case we add new slots in the future
    } else if (_storageSlot == EXPENDITURESLOTS_SLOT) {
      require(_keys.length >= 2, "colony-expenditure-bad-keys");
      uint256 offset = uint256(_keys[1]);
      require(offset <= 3, "colony-expenditure-bad-offset");

      // Validate payout modifier
      if (offset == 2) {
        require(
          int256(uint256(_value)) <= MAX_PAYOUT_MODIFIER &&
            int256(uint256(_value)) >= MIN_PAYOUT_MODIFIER,
          "colony-expenditure-bad-payout-modifier"
        );
      }
    } else {
      require(false, "colony-expenditure-bad-slot");
    }

    executeStateChange(
      keccak256(abi.encode(_id, _storageSlot)),
      _mask,
      _keys,
      _value
    );

    emit ExpenditureStateChanged(
      msgSender(),
      _id,
      _storageSlot,
      _mask,
      _keys,
      _value
    );
  }

  // Public view functions

  function getExpenditureCount() public view returns (uint256) {
    return expenditureCount;
  }

  function getExpenditure(
    uint256 _id
  ) public view returns (Expenditure memory expenditure) {
    expenditure = expenditures[_id];
  }

  function getExpenditureSlot(
    uint256 _id,
    uint256 _slot
  ) public view returns (ExpenditureSlot memory expenditureSlot) {
    expenditureSlot = expenditureSlots[_id][_slot];
  }

  function getExpenditureSlotPayout(
    uint256 _id,
    uint256 _slot,
    address _token
  ) public view returns (uint256) {
    return expenditureSlotPayouts[_id][_slot][_token];
  }

  // Internal functions

  // Used to avoid stack error in setExpenditureValues
  function setExpenditurePayouts(
    uint256 _id,
    address[] memory _tokens,
    uint256[][] memory _slots,
    uint256[][] memory _values
  ) internal {
    for (uint256 i; i < _tokens.length; i++) {
      (bool success, bytes memory returndata) = address(this).delegatecall(
        abi.encodeWithSignature(
          "setExpenditurePayouts(uint256,uint256[],address,uint256[])",
          _id,
          _slots[i],
          _tokens[i],
          _values[i]
        )
      );
      if (!success) {
        if (returndata.length == 0) revert();
        assembly {
          revert(add(32, returndata), mload(returndata))
        }
      }
    }
  }

  bool constant MAPPING = false;
  bool constant ARRAY = true;
  uint256 constant MAX_ARRAY = 1024; // Prevent writing arbitrary slots

  function executeStateChange(
    bytes32 _slot,
    bool[] memory _mask,
    bytes32[] memory _keys,
    bytes32 _value
  ) internal {
    require(_keys.length == _mask.length, "colony-expenditure-bad-mask");

    bytes32 value = _value;
    bytes32 slot = _slot;

    // See https://solidity.readthedocs.io/en/v0.5.14/miscellaneous.html
    for (uint256 i; i < _keys.length; i++) {
      if (_mask[i] == MAPPING) {
        slot = keccak256(abi.encode(_keys[i], slot));
      }

      if (_mask[i] == ARRAY) {
        require(
          uint256(_keys[i]) <= MAX_ARRAY,
          "colony-expenditure-large-offset"
        );

        slot = bytes32(uint256(_keys[i]) + uint256(slot));
        // If we are indexing in to an array, and this was the last entry
        //  in keys, then we have arrived at the storage slot that we want
        //  to set, and so do not hash the slot (which would take us to the
        //  start of the storage of a hypothetical array at this location).
        if (i != _keys.length - 1) {
          slot = keccak256(abi.encode(slot));
        }
      }
    }

    assembly {
      sstore(slot, value) // ignore-swc-124
    }
  }
}
