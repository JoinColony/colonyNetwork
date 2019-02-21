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
  stoppable
  auth
  returns (uint256)
  {
    paymentCount += 1;
    
    fundingPotCount += 1;
    fundingPots[fundingPotCount] = FundingPot({
      associatedType: FundingPotAssociatedType.Payment,
      associatedTypeId: paymentCount
    });

    Payment memory payment = Payment({
      recipient: _recipient,
      token: _token,
      amount: _amount,
      fundingPotId: fundingPotCount,
      domainId: _domainId,
      skills: new uint256[](_skillId)
    });

    payments[paymentCount] = payment;

    emit FundingPotAdded(fundingPotCount);
    emit PaymentAdded(paymentCount);

    return paymentCount;
  }

  function getPayment(uint256 id) public view returns(Payment memory) {
    Payment storage payment = payments[id];
    return payment;
  }

  function getPaymentCount() public view returns (uint256) {
    return paymentCount;
  }
}