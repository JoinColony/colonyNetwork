pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


contract IColonyNetwork {
  event ColonyAdded(uint256 indexed id);
  event SkillAdded(uint256 skillId, uint256 parentSkillId);

  function getColony(bytes32 key) public view returns (address);
  function getColonyCount() public view returns (uint256);
  function addSkill(uint256 _parentSkillId) public;
  function getSkill(uint256 _skillId) public view returns (uint256, uint256);
  function appendReputationUpdateLog(address _user, int256 _amount, uint256 _skillId) public;
  function getSkillCount() public view returns (uint);
  function createColony(bytes32 _name) public;
  function addColonyVersion(uint256 _version, address _resolver) public;
  function getColonyAt(uint256 _idx) public view returns (address);
  function getCurrentColonyVersion() public view returns (uint256);
  function upgradeColony(bytes32 _name, uint256 _newVersion) public;
  function getParentSkillId(uint256 _skillId, uint256 _parentSkillIndex) public view returns (uint256);
  function getChildSkillId(uint256 _skillId, uint256 _childSkillIndex) public view returns (uint256);
  function getReputationUpdateLogLength() public view returns (uint);
  function getColonyVersionResolver(uint256 _version) public view returns (address);
  function getReputationUpdateLogEntry(uint256 _id) public view returns (address, int, uint, address, uint, uint);
}
