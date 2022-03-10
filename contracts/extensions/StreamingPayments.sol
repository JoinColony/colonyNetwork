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

  event StreamingPaymentCreated(uint256 streamingPaymentId);
  event StreamingPaymentClaimed(uint256 indexed streamingPaymentId, address indexed token);

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
    address[] tokens;
    uint256[] amounts;
    uint256[] lastClaimed;
  }

  uint256 numStreamingPayments;
  mapping (uint256 => StreamingPayment) streamingPayments;

  // Modifiers

  modifier validatePermission(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId) {
    require(
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, FUNDING, _childSkillIndex, _domainId) &&
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, ADMINISTRATION, _childSkillIndex, _domainId),
      "streaming-payments-not-authorized"
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
  /// @param _permissionDomainId The domain in which the caller holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
  /// @param _domainId The domain out of which the streaming payment will be paid
  /// @param _startTime The time at which the payment begins paying out
  /// @param _endTime The time at which the payment ends paying out
  /// @param _interval The period of time over which _amounts are paid out
  /// @param _recipient The recipient of the streaming payment
  /// @param _tokens The tokens to be paid out
  /// @param _amounts The amounts to be paid out (per _interval of time)
  function create(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    uint256 _startTime,
    uint256 _endTime,
    uint256 _interval,
    address payable _recipient,
    address[] memory _tokens,
    uint256[] memory _amounts
  )
    public
    validatePermission(_permissionDomainId, _childSkillIndex, _domainId)
  {
    require(_tokens.length == _amounts.length, "streaming-payments-bad-input");

    uint256 startTime = (_startTime == 0) ? block.timestamp : _startTime;
    uint256 endTime = (_endTime == 0) ? UINT256_MAX : _endTime;
    uint256[] memory lastClaimed = new uint256[](_tokens.length);

    streamingPayments[++numStreamingPayments] = StreamingPayment(
      _recipient,
      _domainId,
      startTime,
      endTime,
      _interval,
      _tokens,
      _amounts,
      lastClaimed
    );

    emit StreamingPaymentCreated(numStreamingPayments);
  }

  /// @notice Claim a streaming payment
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
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

    require(streamingPayment.startTime <= block.timestamp, "streaming-payments-too-soon-to-claim");

    uint256 domainFundingPotId = colony.getDomain(streamingPayment.domainId).fundingPotId;
    uint256[] memory amountsToClaim = new uint256[](streamingPayment.tokens.length);

    for (uint256 i; i < streamingPayment.tokens.length; i++) {
      streamingPayment.lastClaimed[i] = max(streamingPayment.lastClaimed[i], streamingPayment.startTime);

      uint256 amountClaimable = getAmountClaimable(_id, i);
      uint256 claimableProportion = getClaimableProportion(_id, i, domainFundingPotId, amountClaimable);
      amountsToClaim[i] = wmul(claimableProportion, amountClaimable);

      streamingPayment.lastClaimed[i] = add(
        streamingPayment.lastClaimed[i],
        wmul(
          claimableProportion,
          sub(
            block.timestamp,
            streamingPayment.lastClaimed[i]
          )
        )
      );
    }

    uint256 expenditureId = setupExpenditure(
      _permissionDomainId,
      _childSkillIndex,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _id,
      domainFundingPotId,
      amountsToClaim
    );

    for (uint256 i; i < streamingPayment.tokens.length; i++) {
      colony.claimExpenditurePayout(expenditureId, SLOT, streamingPayment.tokens[i]);

      emit StreamingPaymentClaimed(_id, streamingPayment.tokens[i]);
    }
  }

  /// @notice Update the startTime, only if the current startTime is in the future
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  /// @param _startTime The new startTime to set
  function setStartTime(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _startTime
  )
    public
    validatePermission(_permissionDomainId, _childSkillIndex, streamingPayments[_id].domainId)
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    require(block.timestamp <= streamingPayment.startTime, "streaming-payments-already-started");
    streamingPayment.startTime = _startTime;
  }

  /// @notice Update the endTime, only if the new endTime is in the future
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  /// @param _endTime The new endTime to set
  function setEndTime(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id,
    uint256 _endTime
  )
    public
    validatePermission(_permissionDomainId, _childSkillIndex, streamingPayments[_id].domainId)
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    require(block.timestamp <= _endTime, "streaming-payments-invalid-end-time");
    streamingPayment.endTime = _endTime;
  }

  /// @notice Cancel the streaming payment, specifically by setting endTime to block.timestamp
  /// @param _permissionDomainId The domain in which the extension holds the funding & admin permissions
  /// @param _childSkillIndex The index linking the permissionDomainId to the domainId
  /// @param _id The id of the streaming payment
  function cancel(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _id
  )
    public
    validatePermission(_permissionDomainId, _childSkillIndex, streamingPayments[_id].domainId)
  {
    setEndTime(_permissionDomainId, _childSkillIndex, _id, block.timestamp);
  }

  // View

  function get(uint256 _id) public view returns (StreamingPayment memory streamingPayment) {
    streamingPayment = streamingPayments[_id];
  }

  function getNumStreamingPayments() public view returns (uint256) {
    return numStreamingPayments;
  }

  function getAmountClaimable(uint256 _id, uint256 _tokenIdx) public view returns (uint256) {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    uint256 durationToClaim = sub(min(block.timestamp, streamingPayment.endTime), streamingPayment.lastClaimed[_tokenIdx]);
    return (durationToClaim > 0) ?
      wmul(streamingPayment.amounts[_tokenIdx], wdiv(durationToClaim, streamingPayment.interval)) :
      0;
  }

  // Internal

  function getClaimableProportion(
    uint256 _id,
    uint256 _tokenIdx,
    uint256 _fundingPotId,
    uint256 _amountClaimable
  )
    internal
    view
    returns (uint256)
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    uint256 domainBalance = colony.getFundingPotBalance(_fundingPotId, streamingPayment.tokens[_tokenIdx]);
    return min(WAD, wdiv(domainBalance, max(1, _amountClaimable)));
  }

  function setupExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    uint256 _domainFundingPotId,
    uint256[] memory _amountsToClaim
  )
    internal
    returns (uint256)
  {
    StreamingPayment storage streamingPayment = streamingPayments[_id];
    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, streamingPayment.domainId);
    uint256 expenditureFundingPotId = colony.getExpenditure(expenditureId).fundingPotId;

    for (uint256 i; i < streamingPayment.tokens.length; i++) {
      colony.moveFundsBetweenPots(
        _permissionDomainId,
        _childSkillIndex,
        streamingPayment.domainId,
        _fromChildSkillIndex,
        _toChildSkillIndex,
        _domainFundingPotId,
        expenditureFundingPotId,
        _amountsToClaim[i],
        streamingPayment.tokens[i]
      );
      colony.setExpenditurePayout(expenditureId, SLOT, streamingPayment.tokens[i], _amountsToClaim[i]);
    }

    colony.setExpenditureRecipient(expenditureId, SLOT, streamingPayment.recipient);
    colony.finalizeExpenditure(expenditureId);
    return expenditureId;
  }
}
