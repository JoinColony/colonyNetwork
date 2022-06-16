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
pragma experimental ABIEncoderV2;

import "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract StreamingPayments is ColonyExtensionMeta {

  // Events

  event StreamingPaymentCreated(address agent, uint256 streamingPaymentId);
  event StreamingPaymentClaimed(address agent, uint256 indexed streamingPaymentId, address token, uint256 amount);
  event PaymentTokenUpdated(address agent, uint256 indexed streamingPaymentId, address token, uint256 amount);

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
  }

  struct PaymentToken {
    uint256 amount;
    // DEV: Note that this might not necessarily be the amount claimed from the start if amount has
    // been changed in the lifecycle of the payment.
    uint256 pseudoAmountClaimedFromStart;
  }

  uint256 numStreamingPayments;
  mapping (uint256 => StreamingPayment) streamingPayments;
  mapping (uint256 => mapping (address => PaymentToken)) paymentTokens;

  // Modifiers

  modifier validateFundingPermission(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId) {
    require(
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, FUNDING, _childSkillIndex, _domainId),
      "streaming-payments-funding-not-authorized"
    );
    _;
  }

  modifier validateAdministrationPermission(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId) {
    require(
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, ADMINISTRATION, _childSkillIndex, _domainId),
      "streaming-payments-admin-not-authorized"
    );
    _;
  }

  // Public

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("StreamingPayments");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
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
  /// @param _tokens The tokens to be paid out
  /// @param _amounts The amounts to be paid out (per _interval of time)
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
    address[] memory _tokens,
    uint256[] memory _amounts
  )
    public
    notDeprecated
    validateFundingPermission(_fundingPermissionDomainId, _fundingChildSkillIndex, _domainId)
    validateAdministrationPermission(_adminPermissionDomainId, _adminChildSkillIndex, _domainId)
  {
    uint256 startTime = (_startTime == 0) ? block.timestamp : _startTime;

    require(_tokens.length == _amounts.length, "streaming-payments-bad-input");
    require(startTime <= _endTime, "streaming-payments-bad-end-time");
    require(_interval > 0, "streaming-payments-bad-interval");

    numStreamingPayments++;
    streamingPayments[numStreamingPayments] = StreamingPayment(_recipient, _domainId, startTime, _endTime, _interval);

    emit StreamingPaymentCreated(msgSender(), numStreamingPayments);

    for (uint256 i; i < _tokens.length; i++) {
      paymentTokens[numStreamingPayments][_tokens[i]] = PaymentToken(_amounts[i], 0);

      emit PaymentTokenUpdated(msgSender(), numStreamingPayments, _tokens[i], _amounts[i]);
    }

  }

  /// @notice Claim a streaming payment
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId the payment is in
  /// @param _fromChildSkillIndex The linking the domainId to the fromPot domain
  /// @param _toChildSkillIndex The linking the domainId to the toPot domain
  /// @param _id The id of the streaming payment
  /// @param _tokens The tokens to be paid out
  function claim(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    address[] memory _tokens
  ) public {
    StreamingPayment storage streamingPayment = streamingPayments[_id];

    require(streamingPayment.startTime < block.timestamp, "streaming-payments-too-soon-to-claim");

    uint256 domainFundingPotId = colony.getDomain(streamingPayment.domainId).fundingPotId;
    uint256[] memory amountsToClaim = new uint256[](_tokens.length);
    bool anythingToClaim;

    for (uint256 i; i < _tokens.length; i++) {
      PaymentToken storage paymentToken = paymentTokens[_id][_tokens[i]];

      uint256 amountEntitledFromStart = getAmountEntitledFromStart(_id, _tokens[i]);
      uint256 amountSinceLastClaim = sub(amountEntitledFromStart, paymentToken.pseudoAmountClaimedFromStart);
      amountsToClaim[i] = getAmountClaimable(_id, _tokens[i], amountSinceLastClaim);
      paymentToken.pseudoAmountClaimedFromStart = add(paymentToken.pseudoAmountClaimedFromStart, amountsToClaim[i]);
      anythingToClaim = anythingToClaim || amountsToClaim[i] > 0;
    }

    // Skip expenditure setup if there's nothing to claim
    if (!anythingToClaim) { return; }

    uint256 expenditureId = setupExpenditure(
      _permissionDomainId,
      _childSkillIndex,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _id,
      domainFundingPotId,
      _tokens,
      amountsToClaim
    );

    for (uint256 i; i < _tokens.length; i++) {
      if (amountsToClaim[i] > 0) {
        colony.claimExpenditurePayout(expenditureId, SLOT, _tokens[i]);

        emit StreamingPaymentClaimed(msgSender(), _id, _tokens[i], amountsToClaim[i]);
      }
    }
  }


  /// @notice Add a new token/amount pair
  /// @param _fundingPermissionDomainId The domain in which the caller holds the funding permission
  /// @param _fundingChildSkillIndex The index linking the fundingPermissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  /// @param _token The address of the token
  /// @param _amount The amount to pay out
  function addToken(
    uint256 _fundingPermissionDomainId,
    uint256 _fundingChildSkillIndex,
    uint256 _id,
    address _token,
    uint256 _amount
  )
    public
    validateFundingPermission(_fundingPermissionDomainId, _fundingChildSkillIndex, streamingPayments[_id].domainId)
  {
    require(paymentTokens[_id][_token].amount == 0, "streaming-payments-token-exists");

    paymentTokens[_id][_token] = PaymentToken(_amount, 0);

    emit PaymentTokenUpdated(msgSender(), _id, _token, _amount);
  }

  /// @notice Update the token amount to be paid out. Claims existing payout prior to the change
  /// @param _fundingPermissionDomainId The domain in which the caller holds the funding permission
  /// @param _fundingChildSkillIndex The index linking the fundingPermissionDomainId to the domainId
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
  /// @param _fromChildSkillIndex The linking the domainId to the fromPot domain
  /// @param _toChildSkillIndex The linking the domainId to the toPot domain
  /// @param _id The id of the streaming payment
  /// @param _token The address of the token
  /// @param _amount The new amount to pay out
  // slither-disable-next-line reentrancy-no-eth
  function setTokenAmount(
    uint256 _fundingPermissionDomainId,
    uint256 _fundingChildSkillIndex,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    address _token,
    uint256 _amount
  )
    public
    validateFundingPermission(_fundingPermissionDomainId, _fundingChildSkillIndex, streamingPayments[_id].domainId)
  {
    claim(_permissionDomainId, _childSkillIndex, _fromChildSkillIndex, _toChildSkillIndex, _id, toArray(_token));

    PaymentToken storage paymentToken = paymentTokens[_id][_token];
    require(paymentToken.pseudoAmountClaimedFromStart >= getAmountEntitledFromStart(_id, _token), "streaming-payments-insufficient-funds");
    paymentToken.amount = _amount;

    // Update 'claimed' as if we've had this rate since the beginning
    paymentToken.pseudoAmountClaimedFromStart = getAmountEntitledFromStart(_id, _token);

    emit PaymentTokenUpdated(msgSender(), _id, _token, _amount);
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
    validateAdministrationPermission(_adminPermissionDomainId, _adminChildSkillIndex, streamingPayments[_id].domainId)

  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    require(block.timestamp <= streamingPayment.startTime, "streaming-payments-already-started");
    require(_startTime <= streamingPayment.endTime, "streaming-payments-invalid-start-time");

    streamingPayment.startTime = _startTime;
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
    validateAdministrationPermission(_adminPermissionDomainId, _adminChildSkillIndex, streamingPayments[_id].domainId)

  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    require(block.timestamp <= streamingPayment.endTime, "streaming-payments-already-ended");
    require(block.timestamp <= _endTime, "streaming-payments-invalid-end-time");
    require(streamingPayment.startTime <= _endTime, "streaming-payments-invalid-end-time");

    streamingPayment.endTime = _endTime;
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
    validateAdministrationPermission(_adminPermissionDomainId, _adminChildSkillIndex, streamingPayments[_id].domainId)
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    if (streamingPayment.startTime > block.timestamp) {
      streamingPayment.startTime = block.timestamp;
    }
    setEndTime(_adminPermissionDomainId, _adminChildSkillIndex, _id, block.timestamp);
  }

  /// @notice Cancel the streaming payment, specifically by setting endTime to block.timestamp, and waive claim
  /// to specified tokens already earned. Only callable by the recipient.
  /// @param _tokens The tokens to waive any claims to.
  function cancelAndWaive(
    uint256 _id,
    address[] memory _tokens
  )
    public
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    // slither-disable-next-line incorrect-equality
    require(streamingPayment.recipient == msgSender(), "streaming-payments-not-recipient");

    if (streamingPayment.startTime > block.timestamp) {
      streamingPayment.startTime = block.timestamp;
    }

    streamingPayment.endTime = min(streamingPayment.endTime, block.timestamp);

    for (uint256 i; i < _tokens.length; i++) {
      PaymentToken storage paymentToken = paymentTokens[_id][_tokens[i]];
      paymentToken.pseudoAmountClaimedFromStart = getAmountEntitledFromStart(_id, _tokens[i]);
    }
  }

  // View

  function getStreamingPayment(uint256 _id) public view returns (StreamingPayment memory streamingPayment) {
    streamingPayment = streamingPayments[_id];
  }

  function getPaymentToken(uint256 _id, address _token) public view returns (PaymentToken memory paymentToken) {
    paymentToken = paymentTokens[_id][_token];
  }

  function getNumStreamingPayments() public view returns (uint256) {
    return numStreamingPayments;
  }

  function getAmountEntitledFromStart(uint256 _id, address _token) public view returns (uint256) {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    PaymentToken storage paymentToken = paymentTokens[_id][_token];
    if (streamingPayment.startTime >= block.timestamp){
      return 0;
    }

    uint256 durationToClaim = sub(min(block.timestamp, streamingPayment.endTime), streamingPayment.startTime);
    if (durationToClaim == 0) {
      return 0;
    }
    return wmul(paymentToken.amount, wdiv(durationToClaim, streamingPayment.interval));
  }

  // Internal

  function getAmountClaimable(
    uint256 _fundingPotId,
    address _token,
    uint256 _amountEntitledToClaimNow
  )
    internal
    view
    returns (uint256)
  {
    uint256 domainBalance = colony.getFundingPotBalance(_fundingPotId, _token);
    return min(domainBalance, _amountEntitledToClaimNow);
  }

  function setupExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    uint256 _domainFundingPotId,
    address[] memory _tokens,
    uint256[] memory _amountsToClaim
  )
    internal
    returns (uint256)
  {
    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, streamingPayments[_id].domainId);
    uint256 expenditureFundingPotId = colony.getExpenditure(expenditureId).fundingPotId;

    for (uint256 i; i < _tokens.length; i++) {
      if (_amountsToClaim[i] > 0) {
        colony.moveFundsBetweenPots(
          _permissionDomainId,
          _childSkillIndex,
          streamingPayments[_id].domainId,
          _fromChildSkillIndex,
          _toChildSkillIndex,
          _domainFundingPotId,
          expenditureFundingPotId,
          _amountsToClaim[i],
          _tokens[i]
        );
        colony.setExpenditurePayout(expenditureId, SLOT, _tokens[i], _amountsToClaim[i]);
      }
    }

    colony.setExpenditureRecipient(expenditureId, SLOT, streamingPayments[_id].recipient);
    colony.finalizeExpenditure(expenditureId);
    return expenditureId;
  }

  function toArray(address _token) internal pure returns (address[] memory tokens) {
    tokens = new address[](1);
    tokens[0] = _token;
  }
}
