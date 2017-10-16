pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


/// @title Transaction reviewer contract - Allows two parties to agree on transactions before execution.
contract TransactionReviewer {
    event Confirmation(uint indexed transactionId, uint indexed senderRole);
    event Revocation(uint indexed transactionId, address indexed sender);
    event Submission(uint indexed transactionId);
    event Execution(uint indexed transactionId);
    event ExecutionFailure(uint indexed transactionId);

    mapping (uint => Transaction) public transactions;
    // Mapping function signature to 2 task roles whose approval is needed to execute
    mapping (bytes4 => uint8[2]) public reviewers;
    // Maps transactions to roles and whether they've confirmed the transaction
    mapping (uint => mapping (uint => bool)) public confirmations;
    uint public transactionCount;

    function TransactionReviewer() {
      reviewers[0xda4db249] = [0, 2]; // setTaskBrief => manager, worker
      reviewers[0xcae960fe] = [0, 2]; // setTaskDueDate => manager, worker
      // setTaskWorker => manager, proposed worker address
    }

    struct Transaction {
        bytes data;
        uint value;
        bool executed;
    }

    modifier transactionExists(uint transactionId) {
        require(transactions[transactionId].data.length > 0);
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

    function submitTransaction(bytes data, uint value, uint8 role) internal returns (uint transactionId)
    {
      transactionId = addTransaction(data, value);
      confirmTransaction(transactionId, role);
    }

    function addTransaction(bytes data, uint value) internal returns (uint transactionId)
    {
        transactionCount += 1;
        transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            data: data,
            value: value,
            executed: false
        });
        Submission(transactionId);
    }

    function confirmTransaction(uint transactionId, uint8 role) internal
    transactionExists(transactionId)
    notConfirmed(transactionId, role)
    {
        confirmations[transactionId][role] = true;
        Confirmation(transactionId, role);
        executeTransaction(transactionId);
    }

    /// @dev Allows anyone to execute a confirmed transaction.
    /// @param transactionId Transaction ID.
    function executeTransaction(uint transactionId) internal
    notExecuted(transactionId)
    {
      Transaction tx = transactions[transactionId];
      //TODO check tx is approved by everyone
      //bytes4 memory sig = tx.data[4];
      //uint8[2] _reviewers = reviewers[sig];
      //require(confirmations[transactionId][_reviewers[0]] && confirmations[transactionId][_reviewers[0]]);

      tx.executed = true;
      if (this.call.value(tx.value)(tx.data))
        Execution(transactionId);
      else {
        ExecutionFailure(transactionId);
        tx.executed = false;
      }
    }
}
