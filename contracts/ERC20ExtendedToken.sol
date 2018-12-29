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

  function mint(uint wad) public {
    mint(msg.sender, wad);
  }

  function burn(uint wad) public {
    burn(msg.sender, wad);
  }

  function mint(address guy, uint wad) public auth {
    _balances[guy] = add(_balances[guy], wad);
    _supply = add(_supply, wad);
    emit Mint(guy, wad);
    emit Transfer(address(0x0), guy, wad);
  }

  function burn(address guy, uint wad) public {
    if (guy != msg.sender && _approvals[guy][msg.sender] != uint(-1)) {
      require(_approvals[guy][msg.sender] >= wad, "ds-token-insufficient-approval");
      _approvals[guy][msg.sender] = sub(_approvals[guy][msg.sender], wad);
    }

    require(_balances[guy] >= wad, "ds-token-insufficient-balance");
    _balances[guy] = sub(_balances[guy], wad);
    _supply = sub(_supply, wad);
    emit Burn(guy, wad);
  }
}