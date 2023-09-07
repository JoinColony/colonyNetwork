pragma solidity 0.8.21;

import "./../colony/ColonyStorage.sol";


contract TasksPayments is ColonyStorage {

  function makeTask(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    bytes32 _specificationHash,
    uint256 _domainId,
    uint256 _skillId,
    uint256 _dueDate
  )
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, _domainId)
  {
    DEPRECATED_taskCount += 1;

    fundingPotCount += 1;
    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType.DEPRECATED_Task;
    fundingPots[fundingPotCount].associatedTypeId = DEPRECATED_taskCount;

    emit FundingPotAdded(fundingPotCount);

    DEPRECATED_tasks[DEPRECATED_taskCount].specificationHash = _specificationHash;
    DEPRECATED_tasks[DEPRECATED_taskCount].fundingPotId = fundingPotCount;
    DEPRECATED_tasks[DEPRECATED_taskCount].domainId = _domainId;
    DEPRECATED_tasks[DEPRECATED_taskCount].skills = new uint256[](1);
    DEPRECATED_tasks[DEPRECATED_taskCount].roles[uint8(TaskRole.Manager)].user = msgSender();
    DEPRECATED_tasks[DEPRECATED_taskCount].roles[uint8(TaskRole.Evaluator)].user = msgSender();

    emit TaskAdded(msgSender(), DEPRECATED_taskCount);

    if (_skillId > 0) {
      DEPRECATED_tasks[DEPRECATED_taskCount].skills[0] = _skillId;

      emit TaskSkillSet(DEPRECATED_taskCount, _skillId);
    }

    uint256 dueDate = _dueDate;
    if (dueDate == 0) {
      // If / When restoring due date to optional status in the future, be sure to go uncomment the relevant line in `afterDueDate` that checks the
      // due date has been set.
      dueDate = block.timestamp + 90 days;
    }

    require (dueDate > 0, "colony-task-due-date-cannot-be-zero");
    DEPRECATED_tasks[DEPRECATED_taskCount].dueDate = dueDate;

    emit TaskDueDateSet(DEPRECATED_taskCount, dueDate);
  }

  function addPayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address payable _recipient,
    address _token,
    uint256 _amount,
    uint256 _domainId,
    uint256 _skillId
  )
    public
    stoppable
    authDomain(_permissionDomainId, _childSkillIndex, _domainId)
    returns (uint256)
  {
    require(_recipient != address(0x0), "colony-payment-invalid-recipient");
    DEPRECATED_paymentCount += 1;

    fundingPotCount += 1;
    fundingPots[fundingPotCount].associatedType = FundingPotAssociatedType.DEPRECATED_Payment;
    fundingPots[fundingPotCount].associatedTypeId = DEPRECATED_paymentCount;
    fundingPots[fundingPotCount].payoutsWeCannotMake = _amount > 0 ? 1 : 0;
    fundingPots[fundingPotCount].payouts[_token] = _amount;

    emit FundingPotAdded(fundingPotCount);

    Payment memory payment;
    payment.recipient = _recipient;
    payment.fundingPotId = fundingPotCount;
    payment.domainId = _domainId;
    payment.skills = new uint256[](1);

    DEPRECATED_payments[DEPRECATED_paymentCount] = payment;

    emit PaymentAdded(msgSender(), DEPRECATED_paymentCount);
    emit PaymentRecipientSet(msgSender(), DEPRECATED_paymentCount, _recipient);
    emit PaymentPayoutSet(msgSender(), DEPRECATED_paymentCount, _token, _amount);

    if (_skillId > 0) {
      DEPRECATED_payments[DEPRECATED_paymentCount].skills[0] = _skillId;

      emit PaymentSkillSet(msgSender(), DEPRECATED_paymentCount, _skillId);
    }

    return DEPRECATED_paymentCount;
  }
}
