pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


import "../lib/dappsys/auth.sol";
import "../lib/dappsys/math.sol";
import "./ERC20Extended.sol";


contract Token is DSAuth, DSMath, ERC20Extended {
  address resolver;
  bytes32 public symbol;
  uint256 public decimals;
  bytes32 public name;

  uint256 _supply;
  mapping (address => uint256) _balances;
  mapping (address => mapping (address => uint256)) _approvals;

  function totalSupply() public view returns (uint256) {
    return _supply;
  }

  function balanceOf(address src) public view returns (uint256) {
    return _balances[src];
  }

  function allowance(address src, address guy) public view returns (uint256) {
    return _approvals[src][guy];
  }

  function transfer(address dst, uint wad) public returns (bool) {
    assert(_balances[msg.sender] >= wad);

    _balances[msg.sender] = sub(_balances[msg.sender], wad);
    _balances[dst] = add(_balances[dst], wad);

    Transfer(msg.sender, dst, wad);

    return true;
  }

  function transferFrom(address src, address dst, uint wad) public returns (bool) {
    assert(_balances[src] >= wad);
    assert(_approvals[src][msg.sender] >= wad);

    _approvals[src][msg.sender] = sub(_approvals[src][msg.sender], wad);
    _balances[src] = sub(_balances[src], wad);
    _balances[dst] = add(_balances[dst], wad);

    Transfer(src, dst, wad);

    return true;
  }

  function approve(address guy, uint256 wad) public returns (bool) {
    _approvals[msg.sender][guy] = wad;

    Approval(msg.sender, guy, wad);

    return true;
  }

  function mint(uint128 wad) public
  auth
  {
    _balances[msg.sender] = add(_balances[msg.sender], wad);
    _supply = add(_supply, wad);
  }
}
