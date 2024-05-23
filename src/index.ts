import { Transaction, script } from "bitcoinjs-lib";
import { config } from "dotenv";

import { getBlock, getLastBlockHash } from "./lib/block/api";
import { TransactionResponse } from "./lib/block/type";
import { decodeRuneName } from "./lib/runes/rune";
import { payloadToIntegers } from "./lib/runes/runestone";
import { Flag, takeFlag } from "./lib/runes/runestone/flag";
import { messageFromIntegers } from "./lib/runes/runestone/message";
import { Tag, takeTag } from "./lib/runes/runestone/tag";
import { runeToSpacedRune } from "./lib/runes/spaced_rune";
import { Edict, Etching, RuneId } from "./lib/runes/type";
import DatabaseInstance from "./lib/server/prisma.server";
import RedisInstance from "./lib/server/redis.server";
import { sleep } from "./lib/utils";

config();

const indexer = async () => {
  while (true) {
    const transactions: TransactionResponse[] = [];

    const latestBlock = await getLastBlockHash();

    const cacheBlock = await RedisInstance.get("last_indexed_block");
    const synced = await RedisInstance.get("synced");

    if (cacheBlock && cacheBlock === latestBlock && synced) {
      await sleep(5000);
      continue;
    }

    let nextBlock =
      cacheBlock ||
      "0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5";

    try {
      await RedisInstance.del("synced");

      const block = await getBlock(nextBlock);

      transactions.push(...block.tx);

      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];

        console.log(block.height + " / " + i + " / " + tx.hash);

        // Skip coinbase transaction
        if (tx.vin.some((input) => input.coinbase)) {
          continue;
        }

        const inputRuneList: {
          id: number;
          rune_id: string;
          rune_name: string;
          location_txid: string;
          location_vout: number;
        }[] = [];

        let skip = true;

        let opReturnVout = -1;
        let firstNonOpReturnVout = -1;
        let taprootInputIndex = -1;

        const outputCount = tx.vout.length;

        // Check if the input contains rune
        for (let j = 0; j < tx.vin.length; j++) {
          const input = tx.vin[j];

          if (
            input.txinwitness &&
            input.txinwitness.length > 1 &&
            taprootInputIndex === -1
          ) {
            taprootInputIndex = j;
          }

          const inputRunes = await DatabaseInstance.rune.findMany({
            select: {
              id: true,
              rune_id: true,
              rune_name: true,
              location_txid: true,
              location_vout: true,
            },
            where: {
              location_txid: input.txid,
              location_vout: input.vout,
              burned: 0,
            },
          });

          if (inputRunes.length > 0) {
            skip = false;
            inputRuneList.push(...inputRunes);
            continue;
          }
        }

        // check op_return vout and first non op_return vout
        for (let j = 0; j < tx.vout.length; j++) {
          const output = tx.vout[j];

          if (output.value > 0 && firstNonOpReturnVout === -1) {
            firstNonOpReturnVout = j;
          }

          if (output.scriptPubKey.asm.startsWith("OP_RETURN 13")) {
            skip = false;
            opReturnVout = j;
          }
        }

        if (skip) {
          continue;
        }

        const runeId = `${block.height}:${i}`;

        if (opReturnVout === -1) {
          // transfer
          const firstNonOpReturnOutput = tx.vout[firstNonOpReturnVout];

          if (!firstNonOpReturnOutput) continue;

          for (const rune of inputRuneList) {
            await DatabaseInstance.$transaction([
              DatabaseInstance.rune.update({
                data: {
                  location_txid: tx.txid,
                  location_vout: firstNonOpReturnVout,
                  holder: firstNonOpReturnOutput.scriptPubKey.address,
                },
                where: {
                  id: rune.id,
                },
              }),
              DatabaseInstance.rune_action.create({
                data: {
                  action_type: "transfer",
                  rune_id: rune.rune_id,
                  rune_name: rune.rune_name,
                  location_txid: tx.txid,
                  location_vout: firstNonOpReturnVout,
                  owner: firstNonOpReturnOutput.scriptPubKey.address,
                  spent: 0,
                },
              }),
              DatabaseInstance.rune_action.updateMany({
                where: {
                  location_txid: rune.location_txid,
                  location_vout: rune.location_vout,
                },
                data: {
                  spent: 1,
                },
              }),
            ]);
          }
        } else {
          const transaction = Transaction.fromHex(tx.hex);
          const opReturnOutput = transaction.outs[opReturnVout];

          if (!opReturnOutput || opReturnOutput.value !== 0) {
            if (inputRuneList.length > 0) {
              await DatabaseInstance.rune.updateMany({
                where: {
                  id: {
                    in: inputRuneList.map((rune) => rune.id),
                  },
                },
                data: {
                  burned: 1,
                },
              });
            }

            continue;
          }

          // etching behind 6 blocks
          if (taprootInputIndex !== -1) {
          }

          const opReturnScript = script.decompile(opReturnOutput.script);

          // OP_RETURN 13 DATA
          if (!opReturnScript || opReturnScript.length !== 3) {
            if (inputRuneList.length > 0) {
              await DatabaseInstance.rune.updateMany({
                where: {
                  id: {
                    in: inputRuneList.map((rune) => rune.id),
                  },
                },
                data: {
                  burned: 1,
                },
              });
            }
            continue;
          }

          const encodedPayload = opReturnScript[2] as Buffer;

          let isInvalid = false;
          let integers: bigint[] | undefined = undefined;
          let message:
            | {
                edicts: Edict[];
                fields: Map<bigint, bigint[]>;
              }
            | undefined = undefined;

          try {
            integers = payloadToIntegers(encodedPayload);
          } catch (e) {
            if (inputRuneList.length > 0) {
              await DatabaseInstance.rune.updateMany({
                where: {
                  id: {
                    in: inputRuneList.map((rune) => rune.id),
                  },
                },
                data: {
                  burned: 1,
                },
              });
            }
            continue;
          }

          try {
            message = messageFromIntegers(outputCount, integers);
          } catch (e) {
            if (inputRuneList.length > 0) {
              await DatabaseInstance.rune.updateMany({
                where: {
                  id: {
                    in: inputRuneList.map((rune) => rune.id),
                  },
                },
                data: {
                  burned: 1,
                },
              });
            }
            continue;
          }

          const flags = takeTag(Tag.Flags, message.fields, 1);

          let etching: Etching | undefined = undefined;
          let mint: RuneId | undefined = undefined;
          let pointer: number = -1;

          let flag = flags ? flags[0] : undefined;
          let isEtching = false;

          if (flag) {
            const etchingFlag = takeFlag(Flag.Etching, flag);
            isEtching = etchingFlag.set;
            flag = etchingFlag.flags;
          }

          if (flag !== undefined && flag >= 0n && isEtching) {
            const divisibility = takeTag(
              Tag.Divisibility,
              message.fields,
              1,
            ) || [0n];
            const premine = takeTag(Tag.Premine, message.fields, 1) || [0n];
            const rune = takeTag(Tag.Rune, message.fields, 1);
            const spacers = takeTag(Tag.Spacers, message.fields, 1);
            const symbol = takeTag(Tag.Symbol, message.fields, 1);

            const termsFlag = takeFlag(Flag.Terms, flag);
            flag = termsFlag.flags;

            const cap = takeTag(Tag.Cap, message.fields, 1);
            const heightStart = takeTag(Tag.HeightStart, message.fields, 1) || [
              0n,
            ];
            const heightEnd = takeTag(Tag.HeightEnd, message.fields, 1) || [0n];
            const offsetStart = takeTag(Tag.OffsetStart, message.fields, 1) || [
              0n,
            ];
            const offsetEnd = takeTag(Tag.OffsetEnd, message.fields, 1) || [0n];
            const amount = takeTag(Tag.Amount, message.fields, 1);

            const turboFlag = takeFlag(Flag.Turbo, flag);
            flag = turboFlag.flags;

            const runeName = rune ? decodeRuneName(rune[0]) : undefined;
            const spacedRune =
              runeName && spacers
                ? runeToSpacedRune(runeName, spacers[0])
                : runeName;

            let supply = premine[0];
            if (cap && amount) {
              supply = cap[0] * amount[0] + supply;
            }

            if (supply === 1n) {
              etching = {
                divisibility: divisibility
                  ? parseInt(divisibility[0].toString())
                  : 0,
                premine: premine ? premine[0].toString() : undefined,
                rune: spacedRune,
                spacers: spacers ? spacers[0].toString() : undefined,
                symbol: symbol
                  ? String.fromCharCode(Number(symbol[0]))
                  : undefined,
                terms: {
                  cap: cap ? cap[0].toString() : undefined,
                  amount: amount ? amount[0].toString() : undefined,
                  height: [
                    parseInt(heightStart[0].toString()),
                    parseInt(heightEnd[0].toString()),
                  ],
                  offset: [
                    parseInt(offsetStart[0].toString()),
                    parseInt(offsetEnd[0].toString()),
                  ],
                },
                turbo: turboFlag.set,
                supply: supply.toString(),
              };
            }
          }

          const mintTag = takeTag(Tag.Mint, message.fields, 2);

          if (mintTag) {
            mint = {
              block: parseInt(mintTag[0].toString()),
              tx: parseInt(mintTag[1].toString()),
            };
          }

          const pointerTag = takeTag(Tag.Pointer, message.fields, 1);

          if (pointerTag) {
            pointer = parseInt(pointerTag[0].toString());
          }

          if (flag !== undefined && flag !== 0n) {
            isInvalid = true;
          }

          if (message.fields.size !== 0) {
            isInvalid = true;
          }

          if (etching && !isInvalid) {
            const runeData = await DatabaseInstance.rune.findUnique({
              where: {
                rune_name: etching.rune || "",
              },
            });

            if (!runeData) {
              await DatabaseInstance.rune.create({
                data: {
                  rune_id: runeId,
                  rune_name: etching.rune || "",
                  symbol: etching.symbol || "",
                  etching: tx.txid,
                  holder: "",
                  location_txid:
                    "0000000000000000000000000000000000000000000000000000000000000000",
                  location_vout: 0,
                  burned: 0,
                },
              });

              if (etching.premine === "1") {
                await DatabaseInstance.$transaction([
                  DatabaseInstance.rune.update({
                    where: {
                      rune_name: etching.rune || "",
                    },
                    data: {
                      holder:
                        pointer !== -1
                          ? tx.vout[pointer].scriptPubKey.address
                          : tx.vout[firstNonOpReturnVout].scriptPubKey.address,
                      location_txid: tx.txid,
                      location_vout:
                        pointer !== -1 ? pointer : firstNonOpReturnVout,
                    },
                  }),
                  DatabaseInstance.rune_action.create({
                    data: {
                      action_type: "mint",
                      rune_id: runeId,
                      rune_name: etching.rune || "",
                      owner:
                        pointer !== -1
                          ? tx.vout[pointer].scriptPubKey.address
                          : tx.vout[firstNonOpReturnVout].scriptPubKey.address,
                      location_txid: tx.txid,
                      location_vout:
                        pointer !== -1 ? pointer : firstNonOpReturnVout,
                      spent: 0,
                    },
                  }),
                ]);
              }
            }
          }

          if (message.edicts.length > 0 && !isInvalid) {
            for (const edict of message.edicts) {
              const rune = `${edict.id.block}:${edict.id.tx}`;

              const itemData = inputRuneList.find(
                (balance) => balance.rune_id === rune,
              );

              if (itemData) {
                const output = tx.vout[edict.output];

                if (output.scriptPubKey.asm.startsWith("OP_RETURN")) {
                  continue;
                }

                await DatabaseInstance.$transaction([
                  DatabaseInstance.rune.update({
                    data: {
                      location_txid: tx.txid,
                      location_vout: edict.output,
                      holder: output.scriptPubKey.address,
                    },
                    where: {
                      id: itemData.id,
                    },
                  }),
                  DatabaseInstance.rune_action.create({
                    data: {
                      action_type: "transfer",
                      rune_id: itemData.rune_id,
                      rune_name: itemData.rune_name,
                      location_txid: tx.txid,
                      location_vout: edict.output,
                      owner: output.scriptPubKey.address,
                      spent: 0,
                    },
                  }),
                  DatabaseInstance.rune_action.updateMany({
                    where: {
                      location_txid: itemData.location_txid,
                      location_vout: itemData.location_vout,
                    },
                    data: {
                      spent: 1,
                    },
                  }),
                ]);
              }
            }
          }

          if (mint) {
            const rune = `${mint.block}:${mint.tx}`;

            const runeData = await DatabaseInstance.rune.findUnique({
              select: {
                id: true,
                rune_name: true,
              },
              where: {
                rune_id: rune,
              },
            });

            if (isInvalid) {
              if (runeData) {
                await DatabaseInstance.rune.update({
                  where: {
                    id: runeData.id,
                  },
                  data: {
                    burned: 1,
                  },
                });
              }
              continue;
            }

            const exist = await DatabaseInstance.rune_action.findFirst({
              select: {
                id: true,
              },
              where: {
                action_type: "mint",
                rune_id: rune,
              },
            });

            if (!exist && runeData) {
              await DatabaseInstance.$transaction([
                DatabaseInstance.rune.update({
                  where: {
                    id: runeData.id,
                  },
                  data: {
                    holder:
                      pointer !== -1
                        ? tx.vout[pointer].scriptPubKey.address
                        : tx.vout[firstNonOpReturnVout].scriptPubKey.address,
                    location_txid: tx.txid,
                    location_vout:
                      pointer !== -1 ? pointer : firstNonOpReturnVout,
                  },
                }),
                DatabaseInstance.rune_action.create({
                  data: {
                    action_type: "mint",
                    rune_id: rune,
                    rune_name: runeData.rune_name,
                    location_txid: tx.txid,
                    location_vout:
                      pointer !== -1 ? pointer : firstNonOpReturnVout,
                    owner:
                      pointer !== -1
                        ? tx.vout[pointer].scriptPubKey.address
                        : tx.vout[firstNonOpReturnVout].scriptPubKey.address,
                    spent: 0,
                  },
                }),
              ]);
            }
          }
        }
      }

      if (block.nextblockhash) {
        await RedisInstance.set("last_indexed_block", block.nextblockhash);
        await RedisInstance.set("synced", "true");
        nextBlock = block.nextblockhash;
      }
    } catch (e) {
      console.log(nextBlock);
      console.log(e);
      await sleep(1000);
      continue;
    }
  }
};

const test = async () => {
  const payload = Buffer.from(
    "020304f4b88594d28dbfbb8206010003c006055606010a000800",
    "hex",
  );

  const outputCount = 13;

  const integers = payloadToIntegers(payload);
  const message = messageFromIntegers(outputCount, integers);

  const flags = takeTag(Tag.Flags, message.fields, 1);

  let etching: Etching | undefined = undefined;
  let mint: RuneId | undefined = undefined;
  let pointer: number = 0;

  let flag = flags ? flags[0] : undefined;
  let isEtching = false;

  if (flag) {
    const etchingFlag = takeFlag(Flag.Etching, flag);
    isEtching = etchingFlag.set;
    flag = etchingFlag.flags;
  }

  if (flag !== undefined && flag >= 0n && isEtching) {
    const divisibility = takeTag(Tag.Divisibility, message.fields, 1) || [0n];
    const premine = takeTag(Tag.Premine, message.fields, 1) || [0n];
    const rune = takeTag(Tag.Rune, message.fields, 1);
    const spacers = takeTag(Tag.Spacers, message.fields, 1);
    const symbol = takeTag(Tag.Symbol, message.fields, 1);

    const termsFlag = takeFlag(Flag.Terms, flag);
    flag = termsFlag.flags;

    const cap = takeTag(Tag.Cap, message.fields, 1);
    const heightStart = takeTag(Tag.HeightStart, message.fields, 1) || [0n];
    const heightEnd = takeTag(Tag.HeightEnd, message.fields, 1) || [0n];
    const offsetStart = takeTag(Tag.OffsetStart, message.fields, 1) || [0n];
    const offsetEnd = takeTag(Tag.OffsetEnd, message.fields, 1) || [0n];
    const amount = takeTag(Tag.Amount, message.fields, 1);

    const turboFlag = takeFlag(Flag.Turbo, flag);
    flag = turboFlag.flags;

    const runeName = rune ? decodeRuneName(rune[0]) : undefined;
    const spacedRune =
      runeName && spacers ? runeToSpacedRune(runeName, spacers[0]) : undefined;

    let supply = premine[0];
    if (cap && amount) {
      supply = cap[0] * amount[0] + supply;
    }

    etching = {
      divisibility: divisibility ? parseInt(divisibility[0].toString()) : 0,
      premine: premine ? premine[0].toString() : undefined,
      rune: spacedRune,
      spacers: spacers ? spacers[0].toString() : undefined,
      symbol: symbol ? String.fromCharCode(Number(symbol[0])) : undefined,
      terms: {
        cap: cap ? cap[0].toString() : undefined,
        amount: amount ? amount[0].toString() : undefined,
        height: [
          parseInt(heightStart[0].toString()),
          parseInt(heightEnd[0].toString()),
        ],
        offset: [
          parseInt(offsetStart[0].toString()),
          parseInt(offsetEnd[0].toString()),
        ],
      },
      turbo: turboFlag.set,
      supply: supply.toString(),
    };

    console.log(etching);
  }

  const mintTag = takeTag(Tag.Mint, message.fields, 2);

  if (mintTag) {
    mint = {
      block: parseInt(mintTag[0].toString()),
      tx: parseInt(mintTag[1].toString()),
    };
  }

  const pointerTag = takeTag(Tag.Pointer, message.fields, 1);

  if (pointerTag) {
    pointer = parseInt(pointerTag[0].toString());
  }

  console.log(message.edicts);
  console.log(mint);
  console.log(etching);
  console.log(pointer);

  if (flag !== undefined && flag !== 0n) {
    throw new Error("Flag is not 0");
  }

  if (message.fields.size !== 0) {
    throw new Error("Fields are not 0");
  }
};

indexer();
// test();
