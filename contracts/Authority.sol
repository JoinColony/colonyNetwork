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

    bytes4 acceptTaskSig = bytes4(keccak256("finalizeTask(uint256)"));
    setRoleCapability(owner_role, colony, acceptTaskSig, true);
    setRoleCapability(admin_role, colony, acceptTaskSig, true);

    bytes4 setTaskDueDateSig = bytes4(keccak256("setTaskDueDate(uint256,uint256)"));
    setRoleCapability(owner_role, colony, setTaskDueDateSig, true);
    setRoleCapability(admin_role, colony, setTaskDueDateSig, true);

    bytes4 setTaskPayoutSig = bytes4(keccak256("setTaskPayout(uint256,uint256,address,uint256)"));
    setRoleCapability(owner_role, colony, setTaskPayoutSig, true);
    setRoleCapability(admin_role, colony, setTaskPayoutSig, true);

    bytes4 moveFundsBetweenPotsSig = bytes4(keccak256("moveFundsBetweenPots(uint256,uint256,uint256,address)"));
    setRoleCapability(owner_role, colony, moveFundsBetweenPotsSig, true);
    setRoleCapability(admin_role, colony, moveFundsBetweenPotsSig, true);
  }
}
