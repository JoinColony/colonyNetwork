pragma solidity ^0.4.15;

import "../lib/dappsys/roles.sol";


contract Authority is DSRoles {
  uint8 owner_role = 0;
  uint8 admin_role = 1;

  function Authority() {
    setUserRole(this, owner_role, true);
    setUserRole(this, admin_role, true);

    bytes4 contributeEthToTaskSig = bytes4(sha3("contributeEthToTask(uint256)"));
    setRoleCapability(owner_role, msg.sender, contributeEthToTaskSig, true);
    setRoleCapability(admin_role, msg.sender, contributeEthToTaskSig, true);

    bytes4 contributeTokensWeiToTaskSig = bytes4(sha3("contributeTokensWeiToTask(uint256,uint256)"));
    setRoleCapability(owner_role, msg.sender, contributeTokensWeiToTaskSig, true);
    setRoleCapability(admin_role, msg.sender, contributeTokensWeiToTaskSig, true);

    bytes4 setReservedTokensWeiForTaskSig = bytes4(sha3("setReservedTokensWeiForTask(uint256,uint256)"));
    setRoleCapability(owner_role, msg.sender, setReservedTokensWeiForTaskSig, true);
    setRoleCapability(admin_role, msg.sender, setReservedTokensWeiForTaskSig, true);

    bytes4 removeReservedTokensWeiForTaskSig = bytes4(sha3("removeReservedTokensWeiForTask(uint256)"));
    setRoleCapability(owner_role, msg.sender, removeReservedTokensWeiForTaskSig, true);
    setRoleCapability(admin_role, msg.sender, removeReservedTokensWeiForTaskSig, true);

    bytes4 makeTaskSig = bytes4(sha3("makeTask(string,string)"));
    setRoleCapability(owner_role, msg.sender, makeTaskSig, true);
    setRoleCapability(admin_role, msg.sender, makeTaskSig, true);

    bytes4 acceptTaskSig = bytes4(sha3("acceptTask(uint256)"));
    setRoleCapability(owner_role, msg.sender, acceptTaskSig, true);
    setRoleCapability(admin_role, msg.sender, acceptTaskSig, true);

    bytes4 updateTaskTitleSig = bytes4(sha3("updateTaskTitle(uint256,string)"));
    setRoleCapability(owner_role, msg.sender, updateTaskTitleSig, true);
    setRoleCapability(admin_role, msg.sender, updateTaskTitleSig, true);

    bytes4 updateTaskSummarySig = bytes4(sha3("updateTaskSummary(uint256,string)"));
    setRoleCapability(owner_role, msg.sender, updateTaskSummarySig, true);
    setRoleCapability(admin_role, msg.sender, updateTaskSummarySig, true);

    bytes4 completeAndPayTaskSig = bytes4(sha3("completeAndPayTask(uint256,address)"));
    setRoleCapability(owner_role, msg.sender, completeAndPayTaskSig, true);
    setRoleCapability(admin_role, msg.sender, completeAndPayTaskSig, true);

    bytes4 upgradeSig = bytes4(sha3("upgrade(address)"));
    setRoleCapability(owner_role, msg.sender, upgradeSig, true);
    setRoleCapability(admin_role, msg.sender, upgradeSig, true);
  }
}
