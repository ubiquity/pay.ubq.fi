import { queryGraph } from "./query-graph";

export async function fetchEns(address) {
  const endpoint = "https://api.thegraph.com/subgraphs/name/ensdomains/ens";
  const query = `{
    domains(where:{owner:"${address.toLowerCase()}"}) {
      name
    }
  }`;
  const res = await queryGraph(endpoint, query);
  return res.data.domains.map(d => d.name);
}
