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

pragma solidity >=0.4.23;


import "../lib/dappsys/auth.sol";
import "../lib/dappsys/base.sol";
import "./ERC20Extended.sol";


contract ERC20ExtendedToken is DSTokenBase(0), DSAuth, ERC20Extended {
  uint8 public decimals;
  string public symbol;
  string public name;

  constructor(string memory _name, string memory _symbol, uint8 _decimals) public {
    name = _name;
    symbol = _symbol;
    decimals = _decimals;
  }

  function mint(uint wad) public
  auth
  {
    _balances[msg.sender] = add(_balances[msg.sender], wad);
    _supply = add(_supply, wad);

    emit Mint(msg.sender, wad);
    emit Transfer(address(0x0), msg.sender, wad);
  }

  function burn(uint wad) public {
    _balances[msg.sender] = sub(_balances[msg.sender], wad);
    _supply = sub(_supply, wad);

    emit Burn(msg.sender, wad);
  }
}

