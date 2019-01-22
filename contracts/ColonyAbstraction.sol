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

pragma solidity >=0.4.23 <0.5.0;
pragma experimental ABIEncoderV2;

import "./ColonyTask.sol";
import "./ColonyFunding.sol";
import "./ColonyStorage.sol";


contract ColonyAbstraction is ColonyStorage {

  function makePayment(address _worker, uint256 _domainId, address _token, uint256 _amount) public stoppable {
    ColonyTask(address(this)).makeTask(0, _domainId, 1, now);
    ColonyFunding(address(this)).moveFundsBetweenPots(1, tasks[taskCount].potId, _amount, _token);
    ColonyFunding(address(this)).setTaskWorkerPayout(taskCount, _token, _amount);
    ColonyTask(address(this)).setTaskWorkerRole(taskCount, _worker);
    tasks[taskCount].completionTimestamp = now;
    tasks[taskCount].roles[uint8(TaskRole.Worker)].rating = TaskRatings.Satisfactory;
    tasks[taskCount].roles[uint8(TaskRole.Manager)].rating = TaskRatings.Satisfactory;
    ColonyTask(address(this)).finalizeTask(taskCount);
  }

}
