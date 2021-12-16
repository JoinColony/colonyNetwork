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
pragma experimental ABIEncoderV2;

import "@chainlink/contracts/src/v0.7/ChainlinkClient.sol";


contract Snaplink is ChainlinkClient {
    using Chainlink for Chainlink.Request;

    uint256 public volume;

    address private oracle;
    bytes32 private jobId;
    uint256 private fee;

    uint256 constant WAD = 10 ** 18;
    bytes4 constant SELECTOR = bytes4(keccak256("fulfill(bytes32,uint256"));

    constructor(address _oracle, bytes32 _jobId, uint256 _fee) public {
        setPublicChainlinkToken();
        oracle = _oracle; // 0xc57B33452b4F7BB189bB5AfaE9cc4aBa1f7a4FD8;
        jobId = _jobId; // "d5270d1c311941d0b08bead21fea7747";
        fee = _fee; // 0.1 * WAD
    }

    function requestVolumeData() public returns (bytes32 requestId) {
        Chainlink.Request memory request = buildChainlinkRequest(jobId, address(this), SELECTOR);

        request.add("get", "https://min-api.cryptocompare.com/data/pricemultifull?fsyms=ETH&tsyms=USD");
        request.add("path", "RAW.ETH.USD.VOLUME24HOUR");
        request.addInt("times", int256(WAD));

        return sendChainlinkRequestTo(oracle, request, fee);
    }

    function fulfill(bytes32 _requestId, uint256 _volume)
      public
      recordChainlinkFulfillment(_requestId)
    {
        volume = _volume;
    }
}
