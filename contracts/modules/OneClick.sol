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

pragma solidity >=0.4.23 <0.5.0;
pragma experimental ABIEncoderV2;

import "../IColony.sol";


contract OneClick {
  IColony colony;

  constructor(address _colony) public {
    colony = IColony(_colony);
  }

  event PaymentMade(uint256 paymentId);

  function makePayment(address _recipient, uint256 _domainId, address _token, uint256 _amount) public {
    colony.makePayment(_domainId);
    uint256 paymentId = colony.getTaskCount();

    colony.setTaskWorkerPayout(paymentId, _token, _amount);
    colony.setTaskWorkerRole(paymentId, _recipient);

    var (, , paymentFundingPotId, ) = colony.getPayment(paymentId);
    uint256 domainFundingPotId = colony.getDomain(_domainId).fundingPotId;
    colony.moveFundsBetweenPots(domainFundingPotId, uint256(paymentFundingPotId), _amount, _token);

    colony.finalizePayment(paymentId);
    colony.claimPayout(paymentId, 2, _token);

    emit PaymentMade(paymentId);
  }

}
