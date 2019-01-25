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

  // 595623 / 309209
  function makePayment(address _worker, uint256 _domainId, address _token, uint256 _amount) public stoppable {
    IColony colony = IColony(address(this));
    IColonyNetwork colonyNetwork = IColonyNetwork(colonyNetworkAddress);

    colony.createPayment(_domainId);
    Task task = tasks[taskCount];
    task.skills[0] = 1; // Dummy skill

    require(_amount <= MAX_PAYOUT, "colony-funding-payout-too-large");
    colony.moveFundsBetweenPots(1, task.potId, _amount, _token);
    task.payouts[uint8(TaskRole.Worker)][_token] = _amount;
    task.roles[uint8(TaskRole.Worker)].user = _worker;
    task.status = TaskStatus.Finalized;

    if (_token == token) {
      colonyNetwork.appendReputationUpdateLog(_worker, int256(_amount), domains[task.domainId].skillId);
    }
  }

}
