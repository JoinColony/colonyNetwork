// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.25;

import { EtherRouter } from "./EtherRouter.sol";

contract EtherRouterCreate3 is EtherRouter {
  constructor() {
    // This is the CreateX address,
    owner = 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed;
  }
}
