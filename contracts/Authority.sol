pragma solidity ^0.4.15;

import "../lib/dappsys/roles.sol";


contract Authority is DSRoles {
  uint8 owner_role = 0;
  uint8 admin_role = 1;

  function Authority(address colony) {
    bytes4 contributeEthToTaskSig = bytes4(sha3("contributeEthToTask(uint256)"));
    setRoleCapability(owner_role, colony, contributeEthToTaskSig, true);
    setRoleCapability(admin_role, colony, contributeEthToTaskSig, true);

    bytes4 contributeTokensToTaskSig = bytes4(sha3("contributeTokensToTask(uint256,uint256)"));
    setRoleCapability(owner_role, colony, contributeTokensToTaskSig, true);
    setRoleCapability(admin_role, colony, contributeTokensToTaskSig, true);

    bytes4 setReservedTokensForTaskSig = bytes4(sha3("setReservedTokensForTask(uint256,uint256)"));
    setRoleCapability(owner_role, colony, setReservedTokensForTaskSig, true);
    setRoleCapability(admin_role, colony, setReservedTokensForTaskSig, true);

    bytes4 removeReservedTokensForTaskSig = bytes4(sha3("removeReservedTokensForTask(uint256)"));
    setRoleCapability(owner_role, colony, removeReservedTokensForTaskSig, true);
    setRoleCapability(admin_role, colony, removeReservedTokensForTaskSig, true);

    bytes4 makeTaskSig = bytes4(sha3("makeTask(string,string)"));
    setRoleCapability(owner_role, colony, makeTaskSig, true);
    setRoleCapability(admin_role, colony, makeTaskSig, true);

    bytes4 acceptTaskSig = bytes4(sha3("acceptTask(uint256)"));
    setRoleCapability(owner_role, colony, acceptTaskSig, true);
    setRoleCapability(admin_role, colony, acceptTaskSig, true);

    bytes4 updateTaskTitleSig = bytes4(sha3("updateTaskTitle(uint256,string)"));
    setRoleCapability(owner_role, colony, updateTaskTitleSig, true);
    setRoleCapability(admin_role, colony, updateTaskTitleSig, true);

    bytes4 updateTaskSummarySig = bytes4(sha3("updateTaskSummary(uint256,string)"));
    setRoleCapability(owner_role, colony, updateTaskSummarySig, true);
    setRoleCapability(admin_role, colony, updateTaskSummarySig, true);

    bytes4 completeAndPayTaskSig = bytes4(sha3("completeAndPayTask(uint256,address)"));
    setRoleCapability(owner_role, colony, completeAndPayTaskSig, true);
    setRoleCapability(admin_role, colony, completeAndPayTaskSig, true);

    // upgrade function is only available to colony owners
    bytes4 upgradeSig = bytes4(sha3("upgrade(address)"));
    setRoleCapability(owner_role, colony, upgradeSig, true);
  }
}
