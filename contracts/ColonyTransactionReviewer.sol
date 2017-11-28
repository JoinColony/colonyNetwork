pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


import "./ColonyStorage.sol";

/// @title Transaction reviewer contract - Allows two parties to agree on transactions before execution.
contract ColonyTransactionReviewer is ColonyStorage {
  event Confirmation(uint indexed transactionId, uint indexed senderRole);
  event Revocation(uint indexed transactionId, address indexed sender);
  event Submission(uint indexed transactionId);
  event Execution(uint indexed transactionId);
  event ExecutionFailure(uint indexed transactionId);


  modifier transactionExists(uint transactionId) {
    require(transactionId <= transactionCount);
    _;
  }

  modifier notConfirmed(uint transactionId, uint role) {
    require(!confirmations[transactionId][role]);
    _;
  }

  modifier notExecuted(uint transactionId) {
    require(!transactions[transactionId].executed);
    _;
  }

  function setFunctionReviewers(bytes4 _sig, uint8 _firstReviewer, uint8 _secondReviewer)
  self
  {
    uint8[2] memory _reviewers = [_firstReviewer, _secondReviewer];
    reviewers[_sig] = _reviewers;
  }

  function submitTransaction(bytes data, uint value, uint8 role)
  self
  returns (uint transactionId) {
    transactionId = addTransaction(data, value);
    confirmTransaction(transactionId, role);
  }

  function addTransaction(bytes data, uint value)
  internal
  returns (uint transactionId) {
    transactionCount += 1;
    transactionId = transactionCount;
    transactions[transactionId] = Transaction({
      data: data,
      value: value,
      executed: false
    });
    Submission(transactionId);
  }

  function confirmTransaction(uint transactionId, uint8 role)
  self
  transactionExists(transactionId)
  notConfirmed(transactionId, role)
  {
    confirmations[transactionId][role] = true;
    Confirmation(transactionId, role);
    executeTransaction(transactionId);
  }

  /// @dev Allows anyone to execute a confirmed transaction.
  /// @param transactionId Transaction ID.
  function executeTransaction(uint transactionId)
  internal
  notExecuted(transactionId)
  {
    Transaction storage _transaction = transactions[transactionId];

    // Get the function signature and task id from the proposed change call data
    bytes4 sig;
    bytes memory _data = _transaction.data;

    assembly {
      sig := mload(add(_data, add(0x20, 0)))
    }

    uint8[2] storage _reviewers = reviewers[sig];
    uint8 _firstReviewer = _reviewers[0];
    uint8 _secondReviewer = _reviewers[1];

    if (confirmations[transactionId][_firstReviewer] && confirmations[transactionId][_secondReviewer]) {
      _transaction.executed = true;
      // If this is generalised to allow colonies to call any function, anywhere (as I believe they will be
      // able to eventually), we need to blacklist some sigs at the submitTransaction stage e.g. the function
      // call to add an entry to the reputation update log.
      if (address(this).call.value(_transaction.value)(_transaction.data)) {
        Execution(transactionId);
      } else {
        ExecutionFailure(transactionId);
        _transaction.executed = false;
      }
    }
  }
}
