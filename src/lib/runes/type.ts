export type RuneStone = {
  edicts?: Edict[];
  etching?: Etching;
  mint?: RuneId;
  pointer?: number;
};

export type Edict = {
  id: RuneId;
  amount: string;
  output: number;
};

export type Etching = {
  divisibility?: number;
  premine?: string;
  rune?: string;
  spacers?: string;
  symbol?: string;
  terms?: Terms;
  turbo?: boolean;
  supply?: string;
};

export type Terms = {
  amount?: string;
  cap?: string;
  height?: number[];
  offset?: number[];
};

export type RuneId = {
  block: number;
  tx: number;
};
