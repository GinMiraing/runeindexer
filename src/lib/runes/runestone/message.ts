import { decodeEdictFromPayload } from "../edict";
import { nextRuneId } from "../rune_id";
import { Edict, RuneId } from "../type";
import { Tag } from "./tag";

export function messageFromIntegers(
  outputCount: number,
  payload: Array<bigint>,
) {
  const edicts: Edict[] = [];
  const fields: Map<bigint, Array<bigint>> = new Map();

  for (let i = 0; i < payload.length; i += 2) {
    const tag = payload[i];

    if (tag === BigInt(Tag.Body)) {
      let id: RuneId = {
        block: 0,
        tx: 0,
      };

      for (let j = i + 1; j < payload.length; j += 4) {
        const chunk = payload.slice(j, j + 4);
        if (chunk.length !== 4) {
          throw new Error("Trailing integers");
        }

        const next = nextRuneId(id, {
          block: Number(chunk[0]),
          tx: Number(chunk[1]),
        });

        id = next;

        const edict = decodeEdictFromPayload(
          outputCount,
          next,
          chunk[2].toString(),
          Number(chunk[3]),
        );

        if (!edict) {
          throw new Error("Invail message");
        }

        edicts.push(edict);
      }

      return { edicts, fields };
    }

    const value = payload[i + 1];

    if (value === undefined) {
      throw new Error("Invail message");
    }

    if (!fields.has(tag)) {
      fields.set(tag, []);
    }

    fields.get(tag)!.push(value);
  }

  return { edicts, fields };
}
