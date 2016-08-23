import "Ownable.sol";


contract EternalStorage is Ownable{

    function EternalStorage(){

    }

    ////////////
    //UInt
    ////////////

    mapping(bytes32 => uint) uIntStorage;

    function getUIntValue(bytes32 record) constant returns (uint){
        return uIntStorage[record];
    }

    function setUIntValue(bytes32 record, uint value)
    onlyOwner
    {
        uIntStorage[record] = value;
    }

    function deleteUIntValue(bytes32 record)
    onlyOwner
    {
      delete uIntStorage[record];
    }

    ////////////
    //Strings
    ////////////

    mapping(bytes32 => string) stringStorage;

    function getStringValue(bytes32 record) constant returns (string){
        return stringStorage[record];
    }

    function setStringValue(bytes32 record, string value)
    onlyOwner
    {
        stringStorage[record] = value;
    }

    function deleteStringValue(bytes32 record)
    onlyOwner
    {
      delete stringStorage[record];
    }

    ////////////
    //Address
    ////////////

    mapping(bytes32 => address) addressStorage;

    function getAddressValue(bytes32 record) constant returns (address){
        return addressStorage[record];
    }

    function setAddressValue(bytes32 record, address value)
    onlyOwner
    {
        addressStorage[record] = value;
    }

    function deleteAddressValue(bytes32 record)
    onlyOwner
    {
      delete addressStorage[record];
    }

    ////////////
    //Bytes
    ////////////

    mapping(bytes32 => bytes) bytesStorage;

    function getBytesValue(bytes32 record) constant returns (bytes){
        return bytesStorage[record];
    }

    function setBytesValue(bytes32 record, bytes value)
    onlyOwner
    {
        bytesStorage[record] = value;
    }

    function deleteBytesValue(bytes32 record)
    onlyOwner
    {
      delete bytesStorage[record];
    }

    ////////////
    //Boolean
    ////////////

    mapping(bytes32 => bool) booleanStorage;

    function getBooleanValue(bytes32 record) constant returns (bool){
        return booleanStorage[record];
    }

    function setBooleanValue(bytes32 record, bool value)
    onlyOwner
    {
        booleanStorage[record] = value;
    }

    function deleteBooleanValue(bytes32 record)
    onlyOwner
    {
      delete booleanStorage[record];
    }

    ////////////
    //Int
    ////////////
    mapping(bytes32 => int) intStorage;

    function getIntValue(bytes32 record) constant returns (int){
        return intStorage[record];
    }

    function setIntValue(bytes32 record, int value)
    onlyOwner
    {
        intStorage[record] = value;
    }

    function deleteIntValue(bytes32 record)
    onlyOwner
    {
      delete intStorage[record];
    }

}
