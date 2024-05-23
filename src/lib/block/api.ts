import axios from "axios";

import { BlockResponse } from "./type";

export const getLastBlockHash = async () => {
  const resp = await axios.get<string>(
    "https://mempool.space/api/blocks/tip/hash",
  );

  return resp.data;
};

export const getBlock = async (hash: string) => {
  const resp = await axios.post<{
    result: BlockResponse;
  }>("https://nd-838-597-198.p2pify.com/8c88c7e2b94fbf8e23ee706b23c2b418", {
    method: "getblock",
    params: [hash, 2],
  });

  return resp.data.result;
};

export const getRawTransaction = async (hash: string) => {
  const resp = await axios.get<{
    result: string;
  }>(`https://nd-838-597-198.p2pify.com/8c88c7e2b94fbf8e23ee706b23c2b418`, {
    method: "getrawtransaction",
    params: [hash],
  });

  return resp.data.result;
};

export const getOutSpent = async (hash: string, vout: number) => {
  const urls = [
    `https://mempool.space/api/tx/${hash}/outspend/${vout}`,
    `https://blockstream.info/api/tx/${hash}/outspend/${vout}`,
  ];

  for (const url of urls) {
    try {
      const resp = await axios.get<{
        spent: boolean;
        txid: string;
        vin: number;
        status: {
          confirmed: boolean;
          block_height: number;
          block_hash: string;
          block_time: number;
        };
      }>(url);

      return resp.data;
    } catch (e) {
      console.log(e);
    }
  }

  throw new Error("All urls failed");
};
