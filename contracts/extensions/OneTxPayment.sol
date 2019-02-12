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

import "./../IColony.sol";


contract OneTxPayment {
  function makePayment(
    address _colony,
    address _worker,
    address _token,
    uint256 _amount,
    uint256 _domainId,
    uint256 _skillId) public 
  {
    IColony colony = IColony(_colony);

    // Add a new payment
    uint256 paymentId = colony.addPayment(_worker, _token, _amount, _domainId, _skillId);
    ColonyDataTypes.Payment memory payment = colony.getPayment(paymentId);
    ColonyDataTypes.Domain memory domain = colony.getDomain(_domainId);
    // Fund the payment
    colony.moveFundsBetweenPots(domain.fundingPotId, payment.fundingPotId, _amount, _token);
    // Claim payout on behalf of the recipient
    colony.claimPayment(paymentId);
  }
}