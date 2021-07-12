// Judiciously tweaked from ../../lib/dappsys/base.sol

pragma solidity 0.7.3;

import "./../../lib/dappsys/erc20.sol";
import "./../../lib/dappsys/math.sol";

contract ToggleableToken is DSMath, ERC20Events {
    uint256                                            _supply;
    mapping (address => uint256)                       _balances;
    mapping (address => mapping (address => uint256))  _approvals;
    bool locked = false;
    event Mint(address indexed guy, uint wad);


    constructor(uint supply) public {
        _balances[msg.sender] = supply;
        _supply = supply;
    }

    function totalSupply() public view returns (uint) {
        return _supply;
    }
    function balanceOf(address src) public view returns (uint) {
        return _balances[src];
    }

    function toggleLock() public {
        locked = !locked;
    }

    function transfer(address dst, uint wad) public returns (bool) {
        if (locked){
            return false;
        }
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint wad)
        public
        returns (bool)
    {
    	if (locked){
            return false;
        }

        if (src != msg.sender) {
            require(_approvals[src][msg.sender] >= wad, "ds-token-insufficient-approval");
            _approvals[src][msg.sender] = sub(_approvals[src][msg.sender], wad);
        }

        require(_balances[src] >= wad, "ds-token-insufficient-balance");
        _balances[src] = sub(_balances[src], wad);
        _balances[dst] = add(_balances[dst], wad);

        emit Transfer(src, dst, wad);

        return true;
    }

    function approve(address guy, uint wad) public returns (bool) {
        _approvals[msg.sender][guy] = wad;

        emit Approval(msg.sender, guy, wad);

        return true;
    }

    function mint(address guy, uint wad) public {
       	_balances[guy] = add(_balances[guy], wad);
        _supply = add(_supply, wad);
        emit Mint(guy, wad);
        emit Transfer(address(0x0), guy, wad);
    }

    function setAuthority(address authority) public {

    }
}
