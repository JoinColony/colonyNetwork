/// @dev Models a uint -> uint mapping where it is possible to iterate over all keys.
library IterableMapping
{
  struct itmap
  {
    mapping(bytes32 => IndexValue) data;
    KeyFlag[] keys;
    uint size;
  }
  struct IndexValue { uint keyIndex; address value; }
  struct KeyFlag { uint key; bool deleted; }

  function insert(itmap storage self, bytes32 key_, address value)
  {
    uint keyIndex = self.data[key_].keyIndex;
    if (keyIndex > 0)
      throw; // There is another colony with the same key. Keys need to be uniqie.

      keyIndex = self.keys.length++;
      self.data[key_].keyIndex = keyIndex + 1;
      self.data[key_].value = value;
      self.keys[keyIndex].key = keyIndex + 1;
      self.size++;
  }

  function remove(itmap storage self, bytes32 key) returns (bool success)
  {
    uint keyIndex = self.data[key].keyIndex;
    if (keyIndex == 0)
      return false;
    delete self.data[key];
    self.keys[keyIndex - 1].deleted = true;
    self.size --;
  }

  function contains(itmap storage self, bytes32 key) returns (bool)
  {
    return self.data[key].keyIndex > 0;
  }

  function iterate_start(itmap storage self) returns (uint keyIndex)
  {
    return iterate_next(self, uint(-1));
  }

  function iterate_valid(itmap storage self, uint keyIndex) returns (bool)
  {
    return keyIndex < self.keys.length;
  }

  function iterate_next(itmap storage self, uint keyIndex) returns (uint r_keyIndex)
  {
    keyIndex++;
    while (keyIndex < self.keys.length && self.keys[keyIndex].deleted)
      keyIndex++;
    return keyIndex;
  }

  function iterate_get(itmap storage self, bytes32 key_) returns (address value)
  {
    return self.data[key_].value;
  }
}
