export function varintEncodeToVec(n: bigint, v: Array<number>): void {
  while (n >> BigInt(7) > BigInt(0)) {
    v.push(Number((n & BigInt(0xff)) | BigInt(0b1000_0000)));
    n >>= BigInt(7);
  }
  v.push(Number(n & BigInt(0xff)));
}

export function varintDecode(buffer: Buffer): [bigint, number] {
  let n = BigInt(0);

  for (let i = 0; i < buffer.length; i++) {
    const byte = BigInt(buffer[i]);
    if (i > 18) {
      throw new Error("Overlong");
    }

    const value = byte & BigInt(0b0111_1111);

    if (i === 18 && (value & BigInt(0b0111_1100)) !== BigInt(0)) {
      throw new Error("Overflow");
    }

    n |= value << (BigInt(7) * BigInt(i));

    if ((byte & BigInt(0b1000_0000)) === BigInt(0)) {
      return [n, i + 1];
    }
  }

  throw new Error("Unterminated");
}

export function varintEncode(n: bigint): Array<number> {
  const v: Array<number> = [];
  varintEncodeToVec(n, v);
  return v;
}
