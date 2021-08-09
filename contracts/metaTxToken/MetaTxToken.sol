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

import "./DSTokenBaseMeta.sol";
import "./DSAuthMeta.sol";

contract MetaTxToken is DSTokenBaseMeta(0), DSAuthMeta {
  uint8 public decimals;
  string public symbol;
  string public name;

  bool public locked;
  bytes32 public DOMAIN_SEPARATOR;

  mapping(address => uint256) metatransactionNonces;

  event Mint(address indexed guy, uint256 wad);
  event Burn(address indexed guy, uint256 wad);

  function getMetatransactionNonce(address _user) override public view returns (uint256 nonce){
    return metatransactionNonces[_user];
  }

  function incrementMetatransactionNonce(address _user) override internal {
    metatransactionNonces[_user]++;
  }

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

    uint256 chainId;
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

  function transferFrom(address src, address dst, uint256 wad) public
  unlocked override
  returns (bool)
  {
    return super.transferFrom(src, dst, wad);
  }

  function mint(uint256 wad) public auth {
    mint(msgSender(), wad);
  }

  function burn(uint256 wad) public {
    burn(msgSender(), wad);
  }

  function mint(address guy, uint256 wad) public auth {
    _balances[guy] = add(_balances[guy], wad);
    _supply = add(_supply, wad);

    emit Mint(guy, wad);
    emit Transfer(address(0x0), guy, wad);
  }

  function burn(address guy, uint256 wad) public {
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
  string constant EIP_712_PREFIX = "\x19\x01";

  function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external unlocked {
      require(deadline >= block.timestamp, "colony-token-expired-deadline");

      bytes32 digest = keccak256(
          abi.encodePacked(
              EIP_712_PREFIX,
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