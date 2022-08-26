/// base.sol -- basic ERC20 implementation

// Copyright (C) 2015, 2016, 2017  DappHub, LLC

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// Modified to inherit BasicMetaTransaction and use msgSender() where appropriate

pragma solidity 0.7.3;

import "./../../lib/dappsys/erc20.sol";
import "./../../lib/dappsys/math.sol";
import "./../common/BasicMetaTransaction.sol";

abstract contract DSTokenBaseMeta is ERC20, DSMath, BasicMetaTransaction {
    uint256                                            _supply;
    mapping (address => uint256)                       _balances;
    mapping (address => mapping (address => uint256))  _approvals;

    constructor(uint256 supply) {
        _balances[msgSender()] = supply;
        _supply = supply;
    }

    function totalSupply() public override view returns (uint) {
        return _supply;
    }
    function balanceOf(address src) public override view returns (uint) {
        return _balances[src];
    }
    function allowance(address src, address guy) public override view returns (uint) {
        return _approvals[src][guy];
    }

    function transfer(address dst, uint256 wad) public override returns (bool) {
        return transferFrom(msgSender(), dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad)
        public override virtual
        returns (bool)
    {
        if (src != msgSender()) {
            require(_approvals[src][msgSender()] >= wad, "ds-token-insufficient-approval");
            _approvals[src][msgSender()] = sub(_approvals[src][msgSender()], wad);
        }

        require(_balances[src] >= wad, "ds-token-insufficient-balance");
        _balances[src] = sub(_balances[src], wad);
        _balances[dst] = add(_balances[dst], wad);

        emit Transfer(src, dst, wad);

        return true;
    }

    function approve(address guy, uint256 wad) public override returns (bool) {
        _approvals[msgSender()][guy] = wad;

        emit Approval(msgSender(), guy, wad);

        return true;
    }
}
