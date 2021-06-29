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
import "./../common/ERC20Extended.sol";
import "./../common/BasicMetaTransaction.sol";
import "./../common/ERC20Extended.sol";

pragma solidity 0.7.3;

abstract contract DSAuthority {
    function canCall(
        address src, address dst, bytes4 sig
    ) virtual public view returns (bool);
}

contract DSAuthEvents {
    event LogSetAuthority (address indexed authority);
    event LogSetOwner     (address indexed owner);
}

abstract contract DSAuthMeta is DSAuthEvents, BasicMetaTransaction {
    DSAuthority  public  authority;
    address      public  owner;

    constructor() {
        owner = msgSender();
        emit LogSetOwner(msgSender());
    }

    function setOwner(address owner_)
        public
        auth
    {
        owner = owner_;
        emit LogSetOwner(owner);
    }

    function setAuthority(DSAuthority authority_)
        public
        auth
    {
        authority = authority_;
        emit LogSetAuthority(address(authority));
    }

    modifier auth {
        require(isAuthorized(msgSender(), msg.sig), "ds-auth-unauthorized");
        _;
    }

    function isAuthorized(address src, bytes4 sig) internal view returns (bool) {
        if (src == address(this)) {
            return true;
        } else if (src == owner) {
            return true;
        } else if (authority == DSAuthority(0)) {
            return false;
        } else {
            return authority.canCall(src, address(this), sig);
        }
    }
}

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

pragma solidity 0.7.3;

import "./../../lib/dappsys/erc20.sol";
import "./../../lib/dappsys/math.sol";

abstract contract DSTokenBaseMeta is ERC20, DSMath, BasicMetaTransaction {
    uint256                                            _supply;
    mapping (address => uint256)                       _balances;
    mapping (address => mapping (address => uint256))  _approvals;

    constructor(uint supply) {
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

    function transfer(address dst, uint wad) public override returns (bool) {
        return transferFrom(msgSender(), dst, wad);
    }

    function transferFrom(address src, address dst, uint wad)
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

    function approve(address guy, uint wad) public override returns (bool) {
        _approvals[msgSender()][guy] = wad;

        emit Approval(msgSender(), guy, wad);

        return true;
    }
}




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

contract MetaTxToken is DSTokenBaseMeta(0), DSAuthMeta {
  uint8 public decimals;
  string public symbol;
  string public name;

  bool public locked;
  bytes32 public DOMAIN_SEPARATOR;

  mapping(address => uint256) metatransactionNonces;

  function getMetatransactionNonce(address _user) override public view returns (uint256 nonce){
    return metatransactionNonces[_user];
  }

  function incrementMetatransactionNonce(address _user) override internal {
    metatransactionNonces[_user] = add(metatransactionNonces[_user], 1);
  }

  event Mint(address indexed guy, uint wad);
  event Burn(address indexed guy, uint wad);

  modifier unlocked {
    if (locked) {
      require(isAuthorized(msgSender(), msg.sig), "colony-token-unauthorised");
    }
    _;
  }

  constructor(string memory _name, string memory _symbol, uint8 _decimals) {
    name = _name;
    symbol = _symbol;
    decimals = _decimals;
    locked = true;

    uint chainId;
    assembly {
        chainId := chainid()
    }

    DOMAIN_SEPARATOR = keccak256(
        abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes(name)),
            keccak256(bytes("1")),
            chainId,
            address(this)
        )
    );
  }

  function transferFrom(address src, address dst, uint wad) public
  unlocked override
  returns (bool)
  {
    return super.transferFrom(src, dst, wad);
  }

  function mint(uint wad) public auth {
    mint(msgSender(), wad);
  }

  function burn(uint wad) public {
    burn(msgSender(), wad);
  }

  function mint(address guy, uint wad) public auth {
    _balances[guy] = add(_balances[guy], wad);
    _supply = add(_supply, wad);
    emit Mint(guy, wad);
    emit Transfer(address(0x0), guy, wad);
  }

  function burn(address guy, uint wad) public {
    if (guy != msgSender()) {
      require(_approvals[guy][msgSender()] >= wad, "ds-token-insufficient-approval");
      _approvals[guy][msgSender()] = sub(_approvals[guy][msgSender()], wad);
    }

    require(_balances[guy] >= wad, "ds-token-insufficient-balance");
    _balances[guy] = sub(_balances[guy], wad);
    _supply = sub(_supply, wad);
    emit Burn(guy, wad);
  }

  function unlock() public
  auth
  {
    locked = false;
  }

  // Pinched from https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/UniswapV2ERC20.sol
  // Which is also licenced under GPL V3

  // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
  bytes32 public constant PERMIT_TYPEHASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

  function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external unlocked {
      require(deadline >= block.timestamp, "colony-token-expired-deadline");

      bytes32 digest = keccak256(
          abi.encodePacked(
              "\x19\x01",
              DOMAIN_SEPARATOR,
              keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, metatransactionNonces[owner]++, deadline))
          )
      );
      address recoveredAddress = ecrecover(digest, v, r, s);
      require(recoveredAddress != address(0) && recoveredAddress == owner, "colony-token-invalid-signature");
      _approvals[owner][spender] = value;
      emit Approval(owner, spender, value);
  }
}