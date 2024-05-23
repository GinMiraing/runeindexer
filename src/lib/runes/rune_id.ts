import { RuneId } from "./type";

export function deltaRuneId(next: RuneId, current: RuneId): RuneId | null {
  const block = next.block - current.block;

  if (block < 0) {
    return null;
  }

  let tx = 0;

  if (block === 0) {
    tx = next.tx - current.tx;

    if (tx < 0) {
      return null;
    }
  } else {
    tx = next.tx;
  }

  return {
    block,
    tx,
  };
}

export function nextRuneId(current: RuneId, delta: RuneId): RuneId {
  const newBlock = current.block + delta.block;
  let newTx = current.tx;

  if (delta.block === 0) {
    newTx = current.tx + delta.tx;
  } else {
    newTx = delta.tx;
  }

  return {
    block: newBlock,
    tx: newTx,
  };
}
