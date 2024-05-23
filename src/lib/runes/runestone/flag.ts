export enum Flag {
  Etching = 0,
  Terms = 1,
  Turbo = 2,
  Cenotaph = 127,
}

export function maskFlag(flag: Flag): bigint {
  return BigInt(1) << BigInt(flag);
}

export function takeFlag(flag: Flag, flags: bigint) {
  const mask = maskFlag(flag);
  const set = (flags & mask) !== BigInt(0);
  flags &= ~mask;
  return { set, flags };
}

export function setFlag(flag: Flag, flags: bigint): void {
  flags |= maskFlag(flag);
}
