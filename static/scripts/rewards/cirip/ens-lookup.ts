import { queryReverseEns } from "./query-reverse-ens";

export async function ensLookup(addr: string) {
  const _address = "/".concat(addr); // quick adapter

  const start = _address.indexOf("/0x");
  if (start == -1) throw "No ethereum address provided.";
  if (_address.length <= 42 + start) {
    throw "Invalid ethereum address provided.";
  }
  const address = _address.substring(start + 1, start + 43).toLowerCase();

  let reverseRecord = null as null | string;
  try {
    reverseRecord = await queryReverseEns(address);
  } catch (e) {
    console.error(e);
  }

  return reverseRecord;
}
