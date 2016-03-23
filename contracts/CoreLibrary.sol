
library CoreLibrary {
  function isEmptyString(string _value) returns (bool) {
    return bytes(_value).length == 0;
  }

  function isEmptyByteArray(bytes _value) returns (bool) {
    return _value.length == 0;
  }
}
