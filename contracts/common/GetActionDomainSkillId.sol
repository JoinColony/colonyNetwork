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

import { IColony } from "./../colony/IColony.sol";
import { IColonyNetwork } from "./../colonyNetwork/IColonyNetwork.sol";

pragma solidity 0.8.23;
pragma experimental ABIEncoderV2;

contract GetActionDomainSkillId {
  // From https://ethereum.stackexchange.com/questions/131283/how-do-i-decode-call-data-in-solidity

  function getActionDomainSkillId(
    bytes memory _action,
    address _colonyNetworkAddress,
    address _colonyAddress
  ) internal view returns (uint256) {
    require(_action.length >= 0x44, "colony-action-too-short");
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = IColony(_colonyAddress).getDomain(permissionDomainId).skillId;
    return
      IColonyNetwork(_colonyNetworkAddress).getChildSkillId(permissionSkillId, childSkillIndex);
  }
}
