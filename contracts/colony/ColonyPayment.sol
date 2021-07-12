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


contract ColonyPayment is ColonyStorage {
  function addPayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address payable _recipient,
    address _token,
    uint256 _amount,
    uint256 _domainId,
    uint256 _skillId
  )
  public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  validPayoutAmount(_amount)
  returns (uint256)
  {
    require(_recipient != address(0x0), "colony-payment-invalid-recipient");
    paymentCount += 1;

    fundingPotCount += 1;
    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType.Payment;
    fundingPots[fundingPotCount].associatedTypeId = paymentCount;
    fundingPots[fundingPotCount].payoutsWeCannotMake = _amount > 0 ? 1 : 0;

    fundingPots[fundingPotCount].payouts[_token] = _amount;

    Payment memory payment;
    payment.recipient = _recipient;
    payment.fundingPotId = fundingPotCount;
    payment.domainId = _domainId;
    payment.skills = new uint256[](1);

    payments[paymentCount] = payment;

    emit FundingPotAdded(fundingPotCount);
    emit PaymentAdded(msg.sender, paymentCount);

    if (_skillId > 0) {
      setPaymentSkill(_permissionDomainId, _childSkillIndex, paymentCount, _skillId);

      emit PaymentSkillSet(msg.sender, paymentCount, _skillId);
    }

    emit PaymentRecipientSet(msg.sender, paymentCount, _recipient);
    emit PaymentPayoutSet(msg.sender, paymentCount, _token, _amount);

    return paymentCount;
  }

  function finalizePayment(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, payments[_id].domainId)
  paymentFunded(_id)
  paymentNotFinalized(_id)
  {
    Payment storage payment = payments[_id];
    payment.finalized = true;

    FundingPot storage fundingPot = fundingPots[payment.fundingPotId];

    IColonyNetwork colonyNetworkContract = IColonyNetwork(colonyNetworkAddress);
    // All payments in Colony's home token earn domain reputation and if skill was set, earn skill reputation
    colonyNetworkContract.appendReputationUpdateLog(payment.recipient, int(fundingPot.payouts[token]), domains[payment.domainId].skillId);
    if (payment.skills[0] > 0) {
      // Currently we support at most one skill per Payment, similarly to Task model.
      // This may change in future to allow multiple skills to be set on both Tasks and Payments
      colonyNetworkContract.appendReputationUpdateLog(payment.recipient, int(fundingPot.payouts[token]), payment.skills[0]);
    }

    emit PaymentFinalized(msg.sender, _id);
  }

  function setPaymentRecipient(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, address payable _recipient) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, payments[_id].domainId)
  paymentNotFinalized(_id)
  {
    require(_recipient != address(0x0), "colony-payment-invalid-recipient");
    payments[_id].recipient = _recipient;

    emit PaymentRecipientSet(msg.sender, _id, _recipient);
  }

  function setPaymentSkill(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _id, uint256 _skillId) public
  stoppable
  authDomain(_permissionDomainId, _childSkillIndex, payments[_id].domainId)
  paymentNotFinalized(_id)
  skillExists(_skillId)
  validGlobalSkill(_skillId)
  {
    payments[_id].skills[0] = _skillId;

    emit PaymentSkillSet(msg.sender, _id, _skillId);
  }

  function getPayment(uint256 _id) public view returns (Payment memory) {
    return payments[_id];
  }

  function getPaymentCount() public view returns (uint256) {
    return paymentCount;
  }
}
