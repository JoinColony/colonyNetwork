pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";


library SafeMath {
  function safeToAddInt(int a, int b) public pure returns (bool) {
    return (b >= 0 && a + b >= a) || (b < 0 && a + b < a);
  }

  function safeToSubInt(int a, int b) public pure returns (bool) {
    return (b >= 0 && a - b <= a) || (b < 0 && a - b > a);
  }

  function safeToMulInt(int a, int b) public pure returns (bool) {
    return (b == 0) || (a * b / b == a);
  }

  function addInt(int a, int b) public pure returns (int) {
    require(safeToAddInt(a, b));
    return a + b;
  }

  function subInt(int a, int b) public pure returns (int) {
    require(safeToSubInt(a, b));
    return a - b;
  }

  function mulInt(int a, int b) public pure returns (int) {
    require(safeToMulInt(a, b));
    return a * b;
  }
}