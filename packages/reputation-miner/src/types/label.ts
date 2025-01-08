
import BN from 'bn.js';

export default class Label {
    data: BN;

    length: number;

    constructor(data: BN, length: number) {
      this.data = data;
      this.length = length;
    }
  }
