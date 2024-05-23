import { varintDecode } from "./varint";

export function payloadToIntegers(payload: Buffer): bigint[] {
  const integers: bigint[] = [];
  let i = 0;

  while (i < payload.length) {
    const result = varintDecode(payload.subarray(i));

    const [integer, length] = result;
    integers.push(integer);
    i += length;
  }

  return integers;
}
