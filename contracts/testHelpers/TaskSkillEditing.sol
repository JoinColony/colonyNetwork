/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./../colony/ColonyStorage.sol";


contract TaskSkillEditing is ColonyStorage {
  // No modifier guards, we're living on the edge. This is really only for testing until
  // tasks get multiple skills some time in the future.

  // Things to remember when the proper implementation is being done
  // * Can people add the same tag twice?
  // * When deleting a tag, should shrink the array and copy the last element in to the empty slot
  //   This makes the iteration done in updateReputation as cheap as possible.
  function addTaskSkill(uint256 _taskId, uint256 _skillId)
  public
  {
    tasks[_taskId].skills.push(_skillId);
  }

  function removeTaskSkill(uint256 _taskId, uint256 _skillIndex)
  public
  {
    require(tasks[_taskId].skills.length > _skillIndex, "colony-task-skill-edit-of-bounds");
    tasks[_taskId].skills[_skillIndex] = 0;
  }
}
