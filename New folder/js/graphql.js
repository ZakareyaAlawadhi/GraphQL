import { ENDPOINTS } from "./config.js";
import { getToken } from "./auth.js";

export async function gql(query, variables){
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(ENDPOINTS.graphql, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors){
    const msg = json?.errors?.[0]?.message || `GraphQL error (${res.status})`;
    throw new Error(msg);
  }
  return json.data;
}
