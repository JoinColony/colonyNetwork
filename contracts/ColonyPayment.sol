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

pragma solidity >=0.4.23;
pragma experimental "ABIEncoderV2";

import "./ColonyStorage.sol";


contract ColonyPayment is ColonyStorage {
  function addPayment(address _recipient, address _token, uint256 _amount, uint256 _domainId, uint256 _skillId) public
  domainExists(_domainId)
  validPayoutAmount(_amount)
  stoppable
  auth
  returns (uint256)
  {
    require(_recipient != address(0x0), "colony-payment-invalid-recipient");
    paymentCount += 1;

    fundingPotCount += 1;
    fundingPots[fundingPotCount] = FundingPot({
      associatedType: FundingPotAssociatedType.Payment,
      associatedTypeId: paymentCount,
      payoutsWeCannotMake: 1
    });

    fundingPots[fundingPotCount].payouts[_token] = _amount;

    Payment memory payment;
    payment.recipient = _recipient;
    payment.fundingPotId = fundingPotCount;
    payment.domainId = _domainId;
    payment.skills = new uint256[](1);

    payments[paymentCount] = payment;

    if (_skillId > 0) {
      setPaymentSkill(paymentCount, _skillId);
    }

    emit FundingPotAdded(fundingPotCount);
    emit PaymentAdded(paymentCount);

    return paymentCount;
  }

  modifier paymentNotFinalized(uint256 _id) {
    require(!payments[_id].finalized, "colony-payment-finalized");
    _;
  }

  function setPaymentRecipient(uint256 _id, address _recipient) public 
  paymentNotFinalized(_id)
  stoppable
  auth
  {
    require(_recipient != address(0x0), "colony-payment-invalid-recipient");
    payments[_id].recipient = _recipient;
  }

  function setPaymentDomain(uint256 _id, uint256 _domainId) public
  paymentNotFinalized(_id)
  domainExists(_domainId)
  stoppable
  auth
  {
    payments[_id].domainId = _domainId;
  }

  function setPaymentSkill(uint256 _id, uint256 _skillId) public
  paymentNotFinalized(_id)
  skillExists(_skillId)
  globalSkill(_skillId)
  stoppable
  auth
  {
    payments[_id].skills[0] = _skillId;
  }

  function getPayment(uint256 _id) public view returns(address, bool, uint256, uint256, uint256[] memory) {
    Payment storage payment = payments[_id];
    return (payment.recipient, payment.finalized, payment.fundingPotId, payment.domainId, payment.skills);
  }

  function getPaymentCount() public view returns (uint256) {
    return paymentCount;
  }
}