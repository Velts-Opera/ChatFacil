const appUrl = (process.env.CHATFACIL_APP_URL || "https://chatfacil-sigma.vercel.app").replace(/\/$/, "");
const functionsUrl = (
  process.env.CHATFACIL_FUNCTIONS_URL ||
  "https://ncosftsthrzznevzkvbi.supabase.co/functions/v1"
).replace(/\/$/, "");

async function probe(name, url, init, expected) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    const elapsedMs = Date.now() - startedAt;
    if (!expected(response.status)) {
      const body = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`HTTP ${response.status}; body=${JSON.stringify(body)}`);
    }
    return { name, ok: true, status: response.status, elapsedMs };
  } catch (error) {
    return {
      name,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const jsonPost = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
};

const results = await Promise.all([
  probe("web-app", appUrl, { method: "GET" }, (status) => status >= 200 && status < 400),
  probe(
    "meta-webhook-rejects-unsigned",
    `${functionsUrl}/whatsapp-webhook`,
    jsonPost,
    (status) => status === 403,
  ),
  probe(
    "worker-rejects-missing-token",
    `${functionsUrl}/business-automation-worker`,
    jsonPost,
    (status) => status === 401,
  ),
  probe(
    "meta-health-requires-user",
    `${functionsUrl}/whatsapp-health-check`,
    jsonPost,
    (status) => status === 401,
  ),
  probe(
    "ai-generator-requires-user",
    `${functionsUrl}/generate-agent-prompt`,
    jsonPost,
    (status) => status === 401,
  ),
]);

for (const result of results) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }));
}

const failures = results.filter((result) => !result.ok);
if (failures.length) {
  throw new Error(`Production health check failed: ${failures.map((item) => item.name).join(", ")}`);
}
