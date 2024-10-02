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

pragma solidity 0.8.27;
pragma experimental ABIEncoderV2;

import { ColonyExtensionMeta } from "./ColonyExtensionMeta.sol";
import { ColonyDataTypes } from "./../colony/IColony.sol";

// ignore-file-swc-108

contract StreamingPayments is ColonyExtensionMeta {
  // Events

  event StreamingPaymentCreated(address agent, uint256 streamingPaymentId);
  event StreamingPaymentClaimed(
    address agent,
    uint256 indexed streamingPaymentId,
    address token,
    uint256 amount
  );
  event PaymentTokenUpdated(
    address agent,
    uint256 indexed streamingPaymentId,
    uint256 amount,
    uint256 interval
  );
  event StartTimeSet(address agent, uint256 indexed streamingPaymentId, uint256 startTime);
  event EndTimeSet(address agent, uint256 indexed streamingPaymentId, uint256 endTime);
  event ClaimWaived(address agent, uint256 indexed streamingPaymentId);

  // Constants

  uint256 constant SLOT = 0;
  ColonyDataTypes.ColonyRole constant ADMINISTRATION = ColonyDataTypes.ColonyRole.Administration;
  ColonyDataTypes.ColonyRole constant FUNDING = ColonyDataTypes.ColonyRole.Funding;

  // Storage

  struct StreamingPayment {
    address payable recipient;
    uint256 domainId;
    uint256 startTime;
    uint256 endTime;
    uint256 interval;
    address token;
    uint256 amount;
    uint256 pseudoAmountClaimedFromStart;
  }

  uint256 numStreamingPayments;
  mapping(uint256 => StreamingPayment) streamingPayments;
  uint256 nUnresolvedStreamingPayments;

  // Modifiers

  modifier validateFundingPermission(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  ) {
    require(
      colony.hasInheritedUserRole(
        msgSender(),
        _permissionDomainId,
        FUNDING,
        _childSkillIndex,
        _domainId
      ),
      "streaming-payments-funding-not-authorized"
    );
    _;
  }

  modifier validateAdministrationPermission(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId
  ) {
    require(
      colony.hasInheritedUserRole(
        msgSender(),
        _permissionDomainId,
        ADMINISTRATION,
        _childSkillIndex,
        _domainId
      ),
      "streaming-payments-admin-not-authorized"
    );
    _;
  }

  // Interface overrides

  /// @notice Returns the identifier of the extension
  /// @return _identifier The extension's identifier
  function identifier() public pure override returns (bytes32 _identifier) {
    return keccak256("StreamingPayments");
  }

  /// @notice Returns the version of the extension
  /// @return _version The extension's version number
  function version() public pure override returns (uint256 _version) {
    return 6;
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {
    revert("streaming-payments-not-upgradeable-from-v4");
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    require(nUnresolvedStreamingPayments == 0, "streaming-payments-unresolved-payments");
    super.uninstall();
  }

  /// @notice Creates a new streaming payment
  /// @param _fundingPermissionDomainId The domain in which the caller holds the funding permission
  /// @param _fundingChildSkillIndex The index linking the fundingPermissionDomainId to the domainId
  /// @param _adminPermissionDomainId The domain in which the caller holds the admin permission
  /// @param _adminChildSkillIndex The index linking the adminPermissionDomainId to the domainId
  /// @param _domainId The domain out of which the streaming payment will be paid
  /// @param _startTime The time at which the payment begins paying out
  /// @param _endTime The time at which the payment ends paying out
  /// @param _interval The period of time over which _amounts are paid out
  /// @param _recipient The recipient of the streaming payment
  /// @param _token The token to be paid out
  /// @param _amount The amount to be paid out (per _interval of time)
  function create(
    uint256 _fundingPermissionDomainId,
    uint256 _fundingChildSkillIndex,
    uint256 _adminPermissionDomainId,
    uint256 _adminChildSkillIndex,
    uint256 _domainId,
    uint256 _startTime,
    uint256 _endTime,
    uint256 _interval,
    address payable _recipient,
    address _token,
    uint256 _amount
  )
    public
    notDeprecated
    validateFundingPermission(_fundingPermissionDomainId, _fundingChildSkillIndex, _domainId)
    validateAdministrationPermission(_adminPermissionDomainId, _adminChildSkillIndex, _domainId)
  {
    uint256 startTime = (_startTime == 0) ? block.timestamp : _startTime;

    require(startTime <= _endTime, "streaming-payments-bad-end-time");
    require(_interval > 0, "streaming-payments-bad-interval");

    numStreamingPayments++;
    streamingPayments[numStreamingPayments] = StreamingPayment(
      _recipient,
      _domainId,
      startTime,
      _endTime,
      _interval,
      _token,
      _amount,
      0
    );

    if (getAmountClaimableLifetime(numStreamingPayments) > 0) {
      nUnresolvedStreamingPayments += 1;
    }

    emit StreamingPaymentCreated(msgSender(), numStreamingPayments);
  }

  /// @notice Claim a streaming payment
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId the payment is in
  /// @param _fromChildSkillIndex The linking the domainId to the fromPot domain
  /// @param _toChildSkillIndex The linking the domainId to the toPot domain
  /// @param _id The id of the streaming payment
  function claim(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id
  ) public {
    StreamingPayment storage streamingPayment = streamingPayments[_id];

    require(streamingPayment.startTime < block.timestamp, "streaming-payments-too-soon-to-claim");

    uint256 domainFundingPotId = colony.getDomain(streamingPayment.domainId).fundingPotId;

    uint256 amountEntitledFromStart = getAmountEntitledFromStart(_id);
    uint256 amountSinceLastClaim = amountEntitledFromStart -
      streamingPayment.pseudoAmountClaimedFromStart;
    uint256 amountToClaim = getAmountClaimable(
      domainFundingPotId,
      streamingPayment.token,
      amountSinceLastClaim
    );
    streamingPayment.pseudoAmountClaimedFromStart += amountToClaim;

    // Skip expenditure setup if there's nothing to claim
    if (amountToClaim == 0) {
      return;
    }

    // If we're not claiming anything, we'll have already returned, so no need to check that
    // amountToClaim is >0 here.
    if (streamingPayment.pseudoAmountClaimedFromStart >= getAmountClaimableLifetime(_id)) {
      nUnresolvedStreamingPayments -= 1;
    }

    uint256 expenditureId = setupExpenditure(
      _permissionDomainId,
      _childSkillIndex,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _id,
      domainFundingPotId,
      streamingPayment.token,
      amountToClaim
    );

    colony.claimExpenditurePayout(expenditureId, SLOT, streamingPayment.token);

    emit StreamingPaymentClaimed(msgSender(), _id, streamingPayment.token, amountToClaim);
  }

  /// @notice Update the token amount to be paid out. Claims existing payout prior to the change
  /// @param _fundingPermissionDomainId The domain in which the caller holds the funding permission
  /// @param _fundingChildSkillIndex The index linking the fundingPermissionDomainId to the domainId
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
  /// @param _fromChildSkillIndex The linking the domainId to the fromPot domain
  /// @param _toChildSkillIndex The linking the domainId to the toPot domain
  /// @param _id The id of the streaming payment
  /// @param _amount The new amount to pay out
  /// @param _interval The new interval over which _amount is paid out
  // slither-disable-next-line reentrancy-no-eth
  function setTokenAmount(
    uint256 _fundingPermissionDomainId,
    uint256 _fundingChildSkillIndex,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    uint256 _amount,
    uint256 _interval
  )
    public
    validateFundingPermission(
      _fundingPermissionDomainId,
      _fundingChildSkillIndex,
      streamingPayments[_id].domainId
    )
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    if (streamingPayment.startTime < block.timestamp) {
      claim(_permissionDomainId, _childSkillIndex, _fromChildSkillIndex, _toChildSkillIndex, _id);
      // This require checks that the above claim paid out the full amount the recipient is entitled to
      // before any changes are made.
      require(
        streamingPayment.pseudoAmountClaimedFromStart >= getAmountEntitledFromStart(_id),
        "streaming-payments-insufficient-funds"
      );
    }

    bool wasResolved = streamingPayment.pseudoAmountClaimedFromStart >=
      getAmountClaimableLifetime(_id);

    streamingPayment.amount = _amount;
    streamingPayment.interval = _interval;

    // Update 'claimed' as if we've had this rate since the beginning
    streamingPayment.pseudoAmountClaimedFromStart = getAmountEntitledFromStart(_id);

    updateUnresolvedPaymentCount(_id, wasResolved);

    emit PaymentTokenUpdated(msgSender(), _id, _amount, _interval);
  }

  /// @notice Update the startTime, only if the current startTime is in the future
  /// @param _adminPermissionDomainId The domain in which the caller holds the admin permission
  /// @param _adminChildSkillIndex The index linking the adminPermissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  /// @param _startTime The new startTime to set
  function setStartTime(
    uint256 _adminPermissionDomainId,
    uint256 _adminChildSkillIndex,
    uint256 _id,
    uint256 _startTime
  )
    public
    validateAdministrationPermission(
      _adminPermissionDomainId,
      _adminChildSkillIndex,
      streamingPayments[_id].domainId
    )
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];

    uint256 oldLifetimeClaimable = getAmountClaimableLifetime(_id);

    require(block.timestamp <= streamingPayment.startTime, "streaming-payments-already-started");
    require(_startTime <= streamingPayment.endTime, "streaming-payments-invalid-start-time");

    streamingPayment.startTime = _startTime;

    uint256 newLifetimeClaimable = getAmountClaimableLifetime(_id);

    // If current start time is in the future - as is required to be the case by the checks above -
    //  then pseudoAmountClaimedFromStart is 0. That means we don't need to
    // compare lifetimeclaimable amounts to pseudoAmountClaimedFromStart to see if it's an unresolved payment - it's always
    // going to be unresolved if the lifetimeclaimable is > 0.
    if (oldLifetimeClaimable == 0 && newLifetimeClaimable > 0) {
      nUnresolvedStreamingPayments += 1;
    } else if (oldLifetimeClaimable > 0 && newLifetimeClaimable == 0) {
      nUnresolvedStreamingPayments -= 1;
    }

    emit StartTimeSet(msgSender(), _id, _startTime);
  }

  /// @notice Update the endTime, only if the new endTime is in the future
  /// @param _adminPermissionDomainId The domain in which the caller holds the admin permission
  /// @param _adminChildSkillIndex The index linking the adminPermissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  /// @param _endTime The new endTime to set
  function setEndTime(
    uint256 _adminPermissionDomainId,
    uint256 _adminChildSkillIndex,
    uint256 _id,
    uint256 _endTime
  )
    public
    validateAdministrationPermission(
      _adminPermissionDomainId,
      _adminChildSkillIndex,
      streamingPayments[_id].domainId
    )
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    require(block.timestamp <= streamingPayment.endTime, "streaming-payments-already-ended");
    require(block.timestamp <= _endTime, "streaming-payments-invalid-end-time");
    require(streamingPayment.startTime <= _endTime, "streaming-payments-invalid-end-time");

    uint256 oldLifetimeClaimable = getAmountClaimableLifetime(_id);

    streamingPayment.endTime = _endTime;

    // Unlike when we're setting start time, we need to compare to pseudoAmountClaimedFromStart
    // in order to determine if the payment is resolved or not.
    bool wasResolved = streamingPayment.pseudoAmountClaimedFromStart >= oldLifetimeClaimable;

    updateUnresolvedPaymentCount(_id, wasResolved);

    emit EndTimeSet(msgSender(), _id, _endTime);
  }

  /// @notice Cancel the streaming payment, specifically by setting endTime to block.timestamp
  /// @param _adminPermissionDomainId The domain in which the caller holds the admin permission
  /// @param _adminChildSkillIndex The index linking the adminPermissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  function cancel(
    uint256 _adminPermissionDomainId,
    uint256 _adminChildSkillIndex,
    uint256 _id
  )
    public
    validateAdministrationPermission(
      _adminPermissionDomainId,
      _adminChildSkillIndex,
      streamingPayments[_id].domainId
    )
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    if (streamingPayment.startTime > block.timestamp) {
      setStartTime(_adminPermissionDomainId, _adminChildSkillIndex, _id, block.timestamp);
    }

    setEndTime(_adminPermissionDomainId, _adminChildSkillIndex, _id, block.timestamp);
  }

  /// @notice Cancel the streaming payment, specifically by setting endTime to block.timestamp, and waive claim
  /// to tokens already earned. Only callable by the recipient.
  /// @param _id The id of the streaming payment
  function cancelAndWaive(uint256 _id) public {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    // slither-disable-next-line incorrect-equality
    require(streamingPayment.recipient == msgSender(), "streaming-payments-not-recipient");

    uint256 oldLifetimeClaimable = getAmountClaimableLifetime(_id);

    if (streamingPayment.startTime > block.timestamp) {
      streamingPayment.startTime = block.timestamp;
    }

    streamingPayment.endTime = min(streamingPayment.endTime, block.timestamp);

    // If the old lifetime claimable was more than we've claimed, we've resolved this payment
    if (oldLifetimeClaimable > streamingPayment.pseudoAmountClaimedFromStart) {
      nUnresolvedStreamingPayments -= 1;
    }
    // If the newlifetimeclaimable >=0, it doesn't matter, because we're waiving our claim

    streamingPayment.pseudoAmountClaimedFromStart = getAmountEntitledFromStart(_id);
    emit ClaimWaived(msgSender(), _id);
  }

  // View

  /// @notice Get the streaming payment struct by Id
  /// @param _id The id of the streaming payment
  /// @return streamingPayment The streaming payment struct
  function getStreamingPayment(
    uint256 _id
  ) public view returns (StreamingPayment memory streamingPayment) {
    streamingPayment = streamingPayments[_id];
  }

  /// @notice Get the total number of streaming payments
  /// @return numPayments The total number of streaming payments
  function getNumStreamingPayments() public view returns (uint256 numPayments) {
    return numStreamingPayments;
  }

  /// @notice Get the number of unresolved streaming payments
  /// @return nUnresolvedPayments The number of unresolved streaming payments
  function getNUnresolvedStreamingPayments() public view returns (uint256 nUnresolvedPayments) {
    return nUnresolvedStreamingPayments;
  }

  /// @notice Get the amount entitled to claim from the start of the stream
  /// @param _id The id of the streaming payment
  /// @return amount The amount entitled
  function getAmountEntitledFromStart(uint256 _id) public view returns (uint256 amount) {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    if (streamingPayment.startTime >= block.timestamp) {
      return 0;
    }

    uint256 until = min(block.timestamp, streamingPayment.endTime);

    return getAmountClaimableInTime(_id, streamingPayment.startTime, until);
  }

  /// @notice Get the amount claimable in the lifetime of the stream
  /// @param _id The id of the streaming payment
  /// @return amount The amount claimable
  function getAmountClaimableLifetime(uint256 _id) public view returns (uint256 amount) {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    return getAmountClaimableInTime(_id, streamingPayment.startTime, streamingPayment.endTime);
  }

  // Internal

  function getAmountClaimable(
    uint256 _fundingPotId,
    address _token,
    uint256 _amountEntitledToClaimNow
  ) internal view returns (uint256) {
    uint256 domainBalance = colony.getFundingPotBalance(_fundingPotId, _token);
    return min(domainBalance, _amountEntitledToClaimNow);
  }

  function getAmountClaimableInTime(
    uint256 _id,
    uint256 _from,
    uint256 _until
  ) private view returns (uint256) {
    StreamingPayment storage streamingPayment = streamingPayments[_id];

    if (_from >= _until) {
      return 0;
    }

    uint256 durationToClaim = _until - _from;

    // Guard against overflow in wdiv
    if (durationToClaim > type(uint256).max / WAD) {
      durationToClaim = type(uint256).max / WAD;
    }

    uint256 intervalsToClaimAsWad = wdiv(durationToClaim, streamingPayment.interval);

    // Guard against overflow in wmul
    if (streamingPayment.amount > type(uint256).max / intervalsToClaimAsWad) {
      return type(uint256).max;
    }

    return wmul(streamingPayment.amount, intervalsToClaimAsWad);
  }

  function updateUnresolvedPaymentCount(uint256 _id, bool wasResolved) internal {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    bool isResolved = streamingPayment.pseudoAmountClaimedFromStart >=
      getAmountClaimableLifetime(_id);

    if (wasResolved && !isResolved) {
      nUnresolvedStreamingPayments += 1;
    } else if (!wasResolved && isResolved) {
      nUnresolvedStreamingPayments -= 1;
    }
  }

  function setupExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    uint256 _domainFundingPotId,
    address _token,
    uint256 _amountToClaim
  ) internal returns (uint256) {
    uint256 expenditureId = colony.makeExpenditure(
      _permissionDomainId,
      _childSkillIndex,
      streamingPayments[_id].domainId
    );
    uint256 expenditureFundingPotId = colony.getExpenditure(expenditureId).fundingPotId;

    colony.moveFundsBetweenPots(
      _permissionDomainId,
      _childSkillIndex,
      streamingPayments[_id].domainId,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _domainFundingPotId,
      expenditureFundingPotId,
      _amountToClaim,
      _token
    );

    colony.setExpenditurePayout(expenditureId, SLOT, _token, _amountToClaim);
    colony.setExpenditureRecipient(expenditureId, SLOT, streamingPayments[_id].recipient);
    colony.finalizeExpenditure(expenditureId);
    return expenditureId;
  }
}
