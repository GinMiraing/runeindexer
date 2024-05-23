export type BlockResponse = {
  hash: string;
  confirmations: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  time: number;
  mediantime: number;
  previousblockhash: string;
  nextblockhash: string;
  tx: TransactionResponse[];
};

export type TransactionResponse = {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: {
    coinbase?: string;
    txid: string;
    vout: number;
    scriptSig: {
      asm: string;
      hex: string;
    };
    txinwitness: string[];
    sequence: number;
  }[];
  vout: {
    value: number;
    n: number;
    scriptPubKey: {
      asm: string;
      desc: string;
      hex: string;
      address: string;
      type: string;
    };
  }[];
  fee: number;
  hex: string;
};
