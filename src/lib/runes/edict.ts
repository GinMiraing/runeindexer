import { Edict, RuneId } from "./type";

export function decodeEdictFromPayload(
  outputCount: number,
  id: RuneId,
  amount: string,
  output: number,
): Edict | null {
  if (output > outputCount - 1) return null;

  return {
    id,
    amount,
    output,
  };
}
