export function runeToSpacedRune(rune: string, spacers: bigint): string {
  const numberStr = spacers.toString(2).split("").reverse().join("");
  let result = "";

  for (let i = 0; i < rune.length; i++) {
    result += rune[i];
    if (numberStr[i] && numberStr[i] === "1") {
      result += "•";
    }
  }

  return result;
}
