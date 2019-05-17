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

pragma solidity 0.5.6;
pragma experimental ABIEncoderV2;

import "./../ColonyAuthority.sol";
import "./../ColonyDataTypes.sol";
import "./../IColony.sol";
import "./../IColonyNetwork.sol";


contract OneTxPayment {
  bytes4 constant ADD_PAYMENT_SIG = bytes4(keccak256("addPayment(uint256,uint256,address,address,uint256,uint256,uint256)"));
  bytes4 constant MOVE_FUNDS_SIG = bytes4(keccak256("moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"));

  IColony colony;
  IColonyNetwork colonyNetwork;

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
  }

  // Note: assumes that each entity holds administration and funding roles in the same domain,
  // although contract and caller can have the permissions in different domains.
  function makePayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    address payable _worker,
    address _token,
    uint256 _amount,
    uint256 _domainId,
    uint256 _skillId) public
  {
    // Check caller is able to call {add,finalize}Payment and moveFundsBetweenPots on the colony
    validateCallerPermissions(_callerPermissionDomainId, _callerChildSkillIndex, _domainId);

    // Add a new payment
    uint256 paymentId = colony.addPayment(_permissionDomainId, _childSkillIndex, _worker, _token, _amount, _domainId, _skillId);
    ColonyDataTypes.Payment memory payment = colony.getPayment(paymentId);
    ColonyDataTypes.Domain memory domain = colony.getDomain(_domainId);

    // Fund the payment
    colony.moveFundsBetweenPots(
      _permissionDomainId,
      _childSkillIndex,
      _childSkillIndex,
      domain.fundingPotId,
      payment.fundingPotId,
      _amount,
      _token
    );
    colony.finalizePayment(_permissionDomainId, _childSkillIndex, paymentId);

    // Claim payout on behalf of the recipient
    colony.claimPayment(paymentId, _token);
  }

  function validateCallerPermissions(
    uint256 _callerPermissionDomainId,
    uint256 _callerChildSkillIndex,
    uint256 _domainId) internal view
  {
    require(
      ColonyAuthority(colony.authority()).canCall(msg.sender, _callerPermissionDomainId, address(colony), ADD_PAYMENT_SIG),
      "colony-one-tx-payment-administration-not-authorized"
    );
    require(
      ColonyAuthority(colony.authority()).canCall(msg.sender, _callerPermissionDomainId, address(colony), MOVE_FUNDS_SIG),
      "colony-one-tx-payment-funding-not-authorized"
    );

    if (_callerPermissionDomainId != _domainId) {
      uint256 permissionSkillId = colony.getDomain(_callerPermissionDomainId).skillId;
      uint256 domainSkillId = colony.getDomain(_domainId).skillId;
      require(domainSkillId > 0, "ds-auth-child-domain-does-not-exist");

      uint256 childSkillId = colonyNetwork.getChildSkillId(permissionSkillId, _callerChildSkillIndex);
      require(childSkillId == domainSkillId, "colony-one-tx-payment-bad-child-skill");
    }
  }
}
