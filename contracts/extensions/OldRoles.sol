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

pragma solidity 0.5.6;
pragma experimental ABIEncoderV2;

import "./../ColonyDataTypes.sol";
import "./../IColony.sol";


contract OldRoles {
  ColonyDataTypes.ColonyRole constant ROOT = ColonyDataTypes.ColonyRole.Root;
  ColonyDataTypes.ColonyRole constant ARCHITECTURE = ColonyDataTypes.ColonyRole.Architecture;

  IColony colony;

  constructor(address _colony) public {
    colony = IColony(_colony);
  }

  function setFounderRole(address _user) public {
    require(colony.hasUserRole(msg.sender, 1, ROOT), "old-roles-caller-not-authorized");

    colony.setRootRole(_user, true);
    colony.setArchitectureRole(1, 0, _user, 1, true);
    colony.setFundingRole(1, 0, _user, 1, true);
    colony.setAdministrationRole(1, 0, _user, 1, true);

    // Remove roles from msg.sender (root last!)
    colony.setAdministrationRole(1, 0, msg.sender, 1, false);
    colony.setFundingRole(1, 0, msg.sender, 1, false);
    colony.setArchitectureRole(1, 0, msg.sender, 1, false);
    colony.setRootRole(msg.sender, false);
  }

  function setAdminRole(address _user, bool _setTo) public {
    require(
      colony.hasUserRole(msg.sender, 1, ROOT) || colony.hasUserRole(msg.sender, 1, ARCHITECTURE),
      "old-roles-caller-not-authorized"
    );

    colony.setArchitectureRole(1, 0, _user, 1, _setTo);
    colony.setFundingRole(1, 0, _user, 1, _setTo);
    colony.setAdministrationRole(1, 0, _user, 1, _setTo);
  }
}
