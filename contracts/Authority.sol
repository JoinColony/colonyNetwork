pragma solidity ^0.4.15;

import "../lib/dappsys/roles.sol";


contract Authority is DSRoles {
  uint8 owner_role = 0;
  uint8 admin_role = 1;

  function Authority(address colony) public {
    bytes4 contributeEthToTaskSig = bytes4(keccak256("contributeEthToTask(uint256)"));
    setRoleCapability(owner_role, colony, contributeEthToTaskSig, true);
    setRoleCapability(admin_role, colony, contributeEthToTaskSig, true);

    bytes4 contributeTokensToTaskSig = bytes4(keccak256("contributeTokensToTask(uint256,uint256)"));
    setRoleCapability(owner_role, colony, contributeTokensToTaskSig, true);
    setRoleCapability(admin_role, colony, contributeTokensToTaskSig, true);

    bytes4 setReservedTokensForTaskSig = bytes4(keccak256("setReservedTokensForTask(uint256,uint256)"));
    setRoleCapability(owner_role, colony, setReservedTokensForTaskSig, true);
    setRoleCapability(admin_role, colony, setReservedTokensForTaskSig, true);

    bytes4 removeReservedTokensForTaskSig = bytes4(keccak256("removeReservedTokensForTask(uint256)"));
    setRoleCapability(owner_role, colony, removeReservedTokensForTaskSig, true);
    setRoleCapability(admin_role, colony, removeReservedTokensForTaskSig, true);

    bytes4 makeTaskSig = bytes4(keccak256("makeTask(string,string)"));
    setRoleCapability(owner_role, colony, makeTaskSig, true);
    setRoleCapability(admin_role, colony, makeTaskSig, true);

    bytes4 acceptTaskSig = bytes4(keccak256("acceptTask(uint256)"));
    setRoleCapability(owner_role, colony, acceptTaskSig, true);
    setRoleCapability(admin_role, colony, acceptTaskSig, true);

    bytes4 updateTaskIpfsDecodedHashSig = bytes4(keccak256("updateTaskIpfsDecodedHash(uint256,bytes32)"));
    setRoleCapability(owner_role, colony, updateTaskIpfsDecodedHashSig, true);
    setRoleCapability(admin_role, colony, updateTaskIpfsDecodedHashSig, true);

    bytes4 completeAndPayTaskSig = bytes4(keccak256("completeAndPayTask(uint256,address)"));
    setRoleCapability(owner_role, colony, completeAndPayTaskSig, true);
    setRoleCapability(admin_role, colony, completeAndPayTaskSig, true);
  }
}
