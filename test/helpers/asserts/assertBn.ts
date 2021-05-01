import { assert } from "chai";
import { BigNumber } from "ethers";

export function assertBn(actual: BigNumber, expected: BigNumber, errorMsg: string = "") {
  assert.equal(
    actual.toString(),
    expected.toString(),
    `${errorMsg} expected ${expected.toString()} to equal ${actual.toString()}`
  );
}
