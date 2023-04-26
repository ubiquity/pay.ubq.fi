import { ethers } from "ethers";
import abi from "../abis/cirip.json";
import { fetchEns } from "./fetch-ens";
import { queryReverseEns } from "./query-reverse-ens";

export const UBIQUITY_RPC_ENDPOINT = "https://rpc-pay.ubq.fi/v1/mainnet";
export const ReverseEns = new ethers.utils.Interface(abi);

// addEventListener("fetch", event => {
//   event.respondWith(handleRequest(event.request).catch(err => new Response(err.stack, { status: 500 })));
// });

export async function handleRequest(pathname: string) {
  // const { pathname } = new URL(request.url);

  try {
    let start = pathname.indexOf("/0x");
    if (start == -1) throw "No ethereum address provided.";
    if (pathname.length <= 42 + start) {
      throw "Invalid ethereum address provided.";
    }
    const address = pathname.substring(start + 1, start + 43).toLowerCase();
    //   console.log('address: ' + address)

    let reverseRecord = null as null | string;
    let response = "";
    try {
      reverseRecord = await queryReverseEns(address);
      const responseParsed = JSON.parse(reverseRecord).result;
      let _reverseRecord = ethers.utils.defaultAbiCoder.decode([ethers.utils.ParamType.from("string[]")], responseParsed);
      reverseRecord = _reverseRecord[0][0];
    } catch (e) {
      console.error(e);
      throw "Error contacting ethereum node. \nCause: '" + e + "'. \nResponse: " + response;
    }

    let allDomains = await fetchEns(address);

    if (reverseRecord == "") {
      reverseRecord = null;
    }

    // if reverse record is set, validate addr owns this domain.
    if (reverseRecord != null && !allDomains.includes(reverseRecord)) {
      console.warn("Failed to validate! Reverse record set to " + reverseRecord + ", but user does not own this name.");
      reverseRecord = null;
    }

    let resp = {
      reverseRecord: reverseRecord,
      domains: allDomains,
    };

    return new Response(JSON.stringify(resp), {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response("Error: " + e, {
      status: 400,
      headers: {
        "Content-Type": "text/raw;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
