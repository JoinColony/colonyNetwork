pragma solidity 0.7.3;


interface IBasicMetaTransaction  {

    event MetaTransactionExecuted(address userAddress, address payable relayerAddress, bytes functionSignature);

    function executeMetaTransaction(address userAddress, bytes memory functionSignature,
        bytes32 sigR, bytes32 sigS, uint8 sigV) external payable returns(bytes memory);

    function getMetatransactionNonce(address user) external view returns(uint256 nonce);

}