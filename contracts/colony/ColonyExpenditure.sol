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
pragma experimental "ABIEncoderV2";

import "./ColonyStorage.sol";


contract ColonyExpenditure is ColonyStorage {
  int256 constant MAX_PAYOUT_MODIFIER = int256(WAD);
  int256 constant MIN_PAYOUT_MODIFIER = -int256(WAD);

  // Public functions

  function makeExpenditure(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId)
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, _domainId)
    returns (uint256)
  {
    expenditureCount += 1;
    fundingPotCount += 1;

    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType.Expenditure;
    fundingPots[fundingPotCount].associatedTypeId = expenditureCount;

    expenditures[expenditureCount] = Expenditure({
      status: ExpenditureStatus.Active,
      owner: msg.sender,
      fundingPotId: fundingPotCount,
      domainId: _domainId,
      finalizedTimestamp: 0,
      globalClaimDelay: 0
    });

    emit FundingPotAdded(fundingPotCount);
    emit ExpenditureAdded(msg.sender, expenditureCount);

    return expenditureCount;
  }

  function transferExpenditure(uint256 _id, address _newOwner)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
  {
    expenditures[_id].owner = _newOwner;

    emit ExpenditureTransferred(msg.sender, _id, _newOwner);
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
    authDomain(_permissionDomainId, _childSkillIndex, expenditures[_id].domainId)
    expenditureExists(_id)
    expenditureActive(_id)
  {
    expenditures[_id].owner = _newOwner;

    emit ExpenditureTransferred(msg.sender, _id, _newOwner);
  }

  function cancelExpenditure(uint256 _id)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
  {
    expenditures[_id].status = ExpenditureStatus.Cancelled;

    emit ExpenditureCancelled(msg.sender, _id);
  }

  function finalizeExpenditure(uint256 _id)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
  {
    FundingPot storage fundingPot = fundingPots[expenditures[_id].fundingPotId];
    require(fundingPot.payoutsWeCannotMake == 0, "colony-expenditure-not-funded");

    expenditures[_id].status = ExpenditureStatus.Finalized;
    expenditures[_id].finalizedTimestamp = block.timestamp;

    emit ExpenditureFinalized(msg.sender, _id);
  }

  function setExpenditureRecipient(uint256 _id, uint256 _slot, address payable _recipient)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
  {
    expenditureSlots[_id][_slot].recipient = _recipient;

    emit ExpenditureRecipientSet(msg.sender, _id, _slot, _recipient);
  }

  function setExpenditureSkill(uint256 _id, uint256 _slot, uint256 _skillId)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
    skillExists(_skillId)
    validGlobalSkill(_skillId)
  {
    // We only allow setting of the first skill here.
    // If we allow more in the future, make sure to have a hard limit that
    // comfortably limits respondToChallenge's gas.
    expenditureSlots[_id][_slot].skills = new uint256[](1);
    expenditureSlots[_id][_slot].skills[0] = _skillId;

    emit ExpenditureSkillSet(msg.sender, _id, _slot, _skillId);
  }

  // Deprecated
  function setExpenditurePayoutModifier(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _slot,
    int256 _payoutModifier
  )
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, expenditures[_id].domainId)
  {
    require(_payoutModifier <= MAX_PAYOUT_MODIFIER, "colony-expenditure-payout-modifier-too-large");
    require(_payoutModifier >= MIN_PAYOUT_MODIFIER, "colony-expenditure-payout-modifier-too-small");

    expenditureSlots[_id][_slot].payoutModifier = _payoutModifier;
  }

  // Deprecated
  function setExpenditureClaimDelay(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _slot,
    uint256 _claimDelay
  )
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, expenditures[_id].domainId)
  {
    expenditureSlots[_id][_slot].claimDelay = _claimDelay;
  }

  uint256 constant EXPENDITURES_SLOT = 25;
  uint256 constant EXPENDITURESLOTS_SLOT = 26;
  uint256 constant EXPENDITURESLOTPAYOUTS_SLOT = 27;

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
    expenditureExists(_id)
    authDomain(_permissionDomainId, _childSkillIndex, expenditures[_id].domainId)
  {
    // Only allow editing expenditure status, owner, and finalizedTimestamp
    //  Note that status + owner occupy one slot
    if (_storageSlot == EXPENDITURES_SLOT) {
      require(_keys.length == 1, "colony-expenditure-bad-keys");
      uint256 offset = uint256(_keys[0]);
      require(offset == 0 || offset == 3 || offset == 4, "colony-expenditure-bad-offset");

    // Explicitly whitelist all slots, in case we add new slots in the future
    } else if (_storageSlot == EXPENDITURESLOTS_SLOT) {
      require(_keys.length >= 2, "colony-expenditure-bad-keys");
      uint256 offset = uint256(_keys[1]);
      require(offset <= 3, "colony-expenditure-bad-offset");

    // Should always be two mappings
    } else if (_storageSlot == EXPENDITURESLOTPAYOUTS_SLOT) {
      require(_keys.length == 2, "colony-expenditure-bad-keys");

    } else {
      require(false, "colony-expenditure-bad-slot");
    }

    executeStateChange(keccak256(abi.encode(_id, _storageSlot)), _mask, _keys, _value);
  }

  // Public view functions

  function getExpenditureCount() public view returns (uint256) {
    return expenditureCount;
  }

  function getExpenditure(uint256 _id) public view returns (Expenditure memory expenditure) {
    expenditure = expenditures[_id];
  }

  function getExpenditureSlot(uint256 _id, uint256 _slot) public view returns (ExpenditureSlot memory expenditureSlot) {
    expenditureSlot = expenditureSlots[_id][_slot];
  }

  function getExpenditureSlotPayout(uint256 _id, uint256 _slot, address _token) public view returns (uint256) {
    return expenditureSlotPayouts[_id][_slot][_token];
  }

  // Internal functions

  bool constant MAPPING = false;
  bool constant ARRAY = true;
  uint256 constant MAX_ARRAY = 1024; // Prevent writing arbitrary slots

  function executeStateChange(
    bytes32 _slot,
    bool[] memory _mask,
    bytes32[] memory _keys,
    bytes32 _value
  )
    internal
  {
    require(_keys.length == _mask.length, "colony-expenditure-bad-mask");

    bytes32 value = _value;
    bytes32 slot = _slot;

    // See https://solidity.readthedocs.io/en/v0.5.14/miscellaneous.html
    for (uint256 i; i < _keys.length; i++) {

      if (_mask[i] == MAPPING) {
        slot = keccak256(abi.encode(_keys[i], slot));
      }

      if (_mask[i] == ARRAY) {
        require(uint256(_keys[i]) <= MAX_ARRAY, "colony-expenditure-large-offset");

        slot = bytes32(add(uint256(_keys[i]), uint256(slot)));
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
