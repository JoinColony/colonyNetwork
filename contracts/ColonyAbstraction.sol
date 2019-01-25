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

import "./IColony.sol";
import "./IColonyNetwork.sol";
import "./ColonyStorage.sol";


contract ColonyAbstraction is ColonyStorage {

  // 480148
  // Bureaucrat permission only
  function makePayment(address _worker, uint256 _domainId, address _token, uint256 _amount) public stoppable {
    IColony colony = IColony(address(this));

    colony.initializePayment(_domainId, 1);
    colony.setTaskWorkerRole(taskCount, _worker);
    colony.setTaskWorkerPayout(taskCount, _token, _amount);
    tasks[taskCount].status = TaskStatus.Finalized;

    // Shouldn't be here...
    if (_token == token) {
      IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);
      colonyNetwork.appendReputationUpdateLog(_worker, int256(_amount), domains[tasks[taskCount].domainId].skillId);
    }
  }

}
