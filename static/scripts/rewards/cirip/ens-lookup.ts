import { queryReverseEns } from "./query-reverse-ens";

// addEventListener("fetch", event => {
//   event.respondWith(handleRequest(event.request).catch(err => new Response(err.stack, { status: 500 })));
// });

export async function ensLookup(addr: string, networkId: number) {
  const _address = "/".concat(addr); // quick adapter

  // try {
  const start = _address.indexOf("/0x");
  if (start == -1) throw "No ethereum address provided.";
  if (_address.length <= 42 + start) {
    throw "Invalid ethereum address provided.";
  }
  const address = _address.substring(start + 1, start + 43).toLowerCase();

  let reverseRecord = null as null | string;
  // let response = "";
  try {
    reverseRecord = await queryReverseEns(address, networkId);
  } catch (e) {
    console.error(e);
    //   throw "Error contacting ethereum node. \nCause: '" + e + "'. \nResponse: " + response;
  }

  // const allDomains = await fetchEns(address);

  if (reverseRecord == "") {
    reverseRecord = null;
  }

  // if reverse record is set, validate addr owns this domain.
  // if (reverseRecord != null && !allDomains.includes(reverseRecord)) {
  //   console.warn("Failed to validate! Reverse record set to " + reverseRecord + ", but user does not own this name.");
  //  reverseRecord = null;
  // }

  return {
    reverseRecord: reverseRecord,
    domains: [],
  };
  //  new Response(JSON.stringify(response), {
  //   headers: {
  //     "Content-Type": "application/json;charset=UTF-8",
  //     "Access-Control-Allow-Origin": "*",
  //   },
  // });
  // } catch (e) {
  //   return new Response("Error: " + e, {
  //     status: 400,
  //     headers: {
  //       "Content-Type": "text/raw;charset=UTF-8",
  //       "Access-Control-Allow-Origin": "*",
  //     },
  //   });
  // }
}
