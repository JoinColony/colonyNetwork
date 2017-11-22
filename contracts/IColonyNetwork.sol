pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


contract IColonyNetwork {
  function getColony(bytes32 key) public returns (address);
  function addSkill(uint _parentSkillId) public;
  function appendReputationUpdateLog(address _user, uint _amount, uint _skillId);
  function skillCount() public returns (uint);
}
