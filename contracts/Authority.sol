pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/roles.sol";


contract Authority is DSRoles {
  uint8 owner_role = 0;
  uint8 admin_role = 1;

  function Authority(address colony) public {
    bytes4 makeTaskSig = bytes4(keccak256("makeTask(bytes32)"));
    setRoleCapability(owner_role, colony, makeTaskSig, true);
    setRoleCapability(admin_role, colony, makeTaskSig, true);

    bytes4 updateTaskIpfsDecodedHashSig = bytes4(keccak256("setTaskBrief(uint256,bytes32)"));
    setRoleCapability(owner_role, colony, updateTaskIpfsDecodedHashSig, true);
    setRoleCapability(admin_role, colony, updateTaskIpfsDecodedHashSig, true);

    bytes4 acceptTaskSig = bytes4(keccak256("acceptTask(uint256)"));
    setRoleCapability(owner_role, colony, acceptTaskSig, true);
    setRoleCapability(admin_role, colony, acceptTaskSig, true);

    bytes4 setTaskDueDateSig = bytes4(keccak256("setTaskDueDate(uint256,uint256)"));
    setRoleCapability(owner_role, colony, setTaskDueDateSig, true);
    setRoleCapability(admin_role, colony, setTaskDueDateSig, true);

    bytes4 setTaskPayoutSig = bytes4(keccak256("setTaskPayout(uint256,uint256,address,uint256)"));
    setRoleCapability(owner_role, colony, setTaskPayoutSig, true);
    setRoleCapability(admin_role, colony, setTaskPayoutSig, true);

    bytes4 setReservedTokensForTaskSig = bytes4(keccak256("setReservedTokensForTask(uint256,uint256)"));
    setRoleCapability(owner_role, colony, setReservedTokensForTaskSig, true);
    setRoleCapability(admin_role, colony, setReservedTokensForTaskSig, true);

    bytes4 removeReservedTokensForTaskSig = bytes4(keccak256("removeReservedTokensForTask(uint256)"));
    setRoleCapability(owner_role, colony, removeReservedTokensForTaskSig, true);
    setRoleCapability(admin_role, colony, removeReservedTokensForTaskSig, true);

    bytes4 completeAndPayTaskSig = bytes4(keccak256("completeAndPayTask(uint256,address)"));
    setRoleCapability(owner_role, colony, completeAndPayTaskSig, true);
    setRoleCapability(admin_role, colony, completeAndPayTaskSig, true);
  }
}
