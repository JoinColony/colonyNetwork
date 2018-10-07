pragma solidity 0.5.8;

import "./ColonyTask.sol";

contract ColonyTaskTest is ColonyTask {
  bytes32 constant SPECIFICATION_HASH = 0x017dfd85d4f6cb4dcd715a88101f7b1f06cd1e009b2327a0809d01eb9c91f231;

  function colony_task_cannot_cancel_if_not_finalized() public view returns (bool) {
    makeTask(SPECIFICATION_HASH, 1, 1, 123);
    uint taskId = getTaskCount();
    finalizeTask(taskId);

    (,,TaskStatus status,,,,,) = getTask(taskId);
  }
}
