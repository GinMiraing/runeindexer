const RuneName = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

export function decodeRuneName(nameNumber: bigint) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";

  let n = nameNumber + 1n;

  while (n > 0n) {
    const index = (n - 1n) % 26n;

    if (index < 0n || index > 25n) {
      throw new Error("index out of range");
    }

    result = letters[Number(index)] + result;

    n = (n - 1n) / 26n;
  }

  return result;
}
