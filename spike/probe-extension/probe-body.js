// Shared by the service worker (importScripts) and the SensCritique content script.
// Read-only query copied from the page's own traffic (spec §5): public product data, no account change.
const PROBE_URL = "https://apollo.senscritique.com/";
const PROBE_BODY = JSON.stringify({
  operationName: "ProductIsLocked",
  variables: { id: 99153120 },
  query: "query ProductIsLocked($id: Int!) {\n  product(id: $id) {\n    id\n    isLocked\n    universe\n    __typename\n  }\n}",
});

// Returns { status, kind } where kind is "JSON" (a GraphQL answer) or "not JSON" (e.g. a Cloudflare challenge page).
async function callSensCritique() {
  const response = await fetch(PROBE_URL, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: PROBE_BODY,
  });
  const text = await response.text();
  try {
    JSON.parse(text);
    return { status: response.status, kind: "JSON" };
  } catch {
    return { status: response.status, kind: "not JSON" };
  }
}
