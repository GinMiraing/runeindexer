import { varintEncodeToVec } from "../varint";

export enum Tag {
  Body = 0,
  Flags = 2,
  Rune = 4,
  Premine = 6,
  Cap = 8,
  Amount = 10,
  HeightStart = 12,
  HeightEnd = 14,
  OffsetStart = 16,
  OffsetEnd = 18,
  Mint = 20,
  Pointer = 22,
  Cenotaph = 126,

  Divisibility = 1,
  Spacers = 3,
  Symbol = 5,
  Nop = 127,
}

export class TagMethods {
  static take<T>(
    tag: Tag,
    fields: Map<bigint, Array<bigint>>,
    N: number,
    withFn: (values: Array<bigint>) => T | undefined,
  ): T | undefined {
    const field = fields.get(BigInt(tag));
    if (!field) return undefined;

    const values: Array<bigint> = [];

    for (let i = 0; i < N; i++) {
      const value = field[i];
      if (value === undefined) return undefined;
      values.push(value);
    }

    const result = withFn(values);
    if (result === undefined) return undefined;

    field.splice(0, N);
    if (field.length === 0) {
      fields.delete(BigInt(tag));
    }

    return result;
  }

  static encode(tag: Tag, values: Array<bigint>, payload: Array<number>): void {
    values.forEach((value) => {
      varintEncodeToVec(BigInt(tag), payload);
      varintEncodeToVec(value, payload);
    });
  }

  static encodeOption<T extends bigint | number>(
    tag: Tag,
    value: T | undefined,
    payload: Array<number>,
  ): void {
    if (value !== undefined) {
      this.encode(tag, [BigInt(value)], payload);
    }
  }
}

export function takeTag(
  tag: Tag,
  fields: Map<bigint, Array<bigint>>,
  N: number,
): Array<bigint> | undefined {
  const field = fields.get(BigInt(tag));

  if (!field) return undefined;

  const values: Array<bigint> = [];

  for (let i = 0; i < N; i++) {
    const value = field[i];
    if (value === undefined) return undefined;
    values.push(value);
  }

  field.splice(0, N);
  if (field.length === 0) {
    fields.delete(BigInt(tag));
  }

  return values;
}

function fromTag(tag: Tag): bigint {
  return BigInt(tag);
}

function tagEquals(tag: Tag, other: bigint): boolean {
  return BigInt(tag) === other;
}
