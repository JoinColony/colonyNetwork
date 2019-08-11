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
pragma experimental "ABIEncoderV2";

import "./ColonyStorage.sol";


contract ColonyExpenditure is ColonyStorage {
  uint256 constant MAX_PAYOUT_SCALAR = 2 * WAD;

  // Public functions

  function makeExpenditure(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId)
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, _domainId)
    returns (uint256)
  {
    expenditureCount += 1;
    fundingPotCount += 1;

    fundingPots[fundingPotCount] = FundingPot({
      associatedType: FundingPotAssociatedType.Expenditure,
      associatedTypeId: expenditureCount,
      payoutsWeCannotMake: 0
    });

    expenditures[expenditureCount] = Expenditure({
      status: ExpenditureStatus.Active,
      owner: msg.sender,
      fundingPotId: fundingPotCount,
      domainId: _domainId,
      finalizedTimestamp: 0
    });

    emit FundingPotAdded(fundingPotCount);
    emit ExpenditureAdded(expenditureCount);

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

    emit ExpenditureTransferred(_id, _newOwner);
  }

  function cancelExpenditure(uint256 _id)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
  {
    expenditures[_id].status = ExpenditureStatus.Cancelled;

    emit ExpenditureCancelled(_id);
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
    expenditures[_id].finalizedTimestamp = now;

    emit ExpenditureFinalized(_id);
  }

  function setExpenditureRecipient(uint256 _id, uint256 _slot, address payable _recipient)
    public
    stoppable
    expenditureExists(_id)
    expenditureActive(_id)
    expenditureOnlyOwner(_id)
  {
    expenditureSlots[_id][_slot].recipient = _recipient;

    emit ExpenditureRecipientSet(_id, _slot, _recipient);
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

    emit ExpenditureSkillSet(_id, _slot, _skillId);
  }

  function setExpenditurePayoutScalar(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _slot,
    uint256 _payoutScalar
  )
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, expenditures[_id].domainId)
  {
    require(_payoutScalar <= MAX_PAYOUT_SCALAR, "colony-expenditure-payout-scalar-too-large");

    expenditureSlots[_id][_slot].payoutScalar = packPayoutScalar(_payoutScalar);
  }

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

  // Public view functions

  function getExpenditureCount() public view returns (uint256) {
    return expenditureCount;
  }

  function getExpenditure(uint256 _id) public view returns (Expenditure memory expenditure) {
    expenditure = expenditures[_id];
  }

  function getExpenditureRecipient(uint256 _id, uint256 _slot) public view returns (address) {
    return expenditureSlots[_id][_slot].recipient;
  }

  function getExpenditureClaimDelay(uint256 _id, uint256 _slot) public view returns (uint256) {
    return expenditureSlots[_id][_slot].claimDelay;
  }

  function getExpenditurePayoutScalar(uint256 _id, uint256 _slot) public view returns (uint256) {
    return unpackPayoutScalar(expenditureSlots[_id][_slot].payoutScalar);
  }

  function getExpenditureSkills(uint256 _id, uint256 _slot) public view returns (uint256[] memory) {
    return expenditureSlots[_id][_slot].skills;
  }

  function getExpenditurePayout(uint256 _id, uint256 _slot, address _token) public view returns (uint256) {
    return expenditureSlots[_id][_slot].payouts[_token];
  }

  function getExpenditureSlot(uint256 _id, uint256 _slot)
    public
    view
    returns (address, uint256, uint256, uint256[] memory)
  {
    ExpenditureSlot storage e = expenditureSlots[_id][_slot];
    return (e.recipient, e.claimDelay, unpackPayoutScalar(e.payoutScalar), e.skills);
  }
}
