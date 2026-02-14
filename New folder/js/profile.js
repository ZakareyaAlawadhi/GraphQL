// profile.js
import { clearToken, getToken } from "./auth.js";
import { gql } from "./graphql.js";
import { formatXP } from "./utils.js";
import { renderXPLineChart, renderBarChart, renderDonut } from "./charts.js";

if (!getToken()) {
  window.location.replace("./index.html");
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  clearToken();
  window.location.replace("./index.html");
});

// ----- DOM -----
const whoEl = document.getElementById("who");
const userIdEl = document.getElementById("userId");
const userLoginEl = document.getElementById("userLogin");
const totalXPAllEl = document.getElementById("totalXPAll");
const totalXP6mEl = document.getElementById("totalXP6m");
const auditRatioEl = document.getElementById("auditRatio");
const auditDetailEl = document.getElementById("auditDetail");
const projectsPFEl = document.getElementById("projectsPF");

const xpLineWrap = document.getElementById("xpLine");
const xpBarsWrap = document.getElementById("xpBars");
const pfWrap = document.getElementById("pfDonut");

// ----- GraphQL -----

// Normal query
const Q_USER = `
  query {
    user { id login }
  }
`;

// Normal query (multiple top-level fields)
const Q_TOTALS = `
  query {
    xp_all: transaction(where: { type: { _eq: "xp" } }) { amount }
    audit_up: transaction(where: { type: { _eq: "up" } }) { amount }
    audit_down: transaction(where: { type: { _eq: "down" } }) { amount }
  }
`;

// Arguments + variables query (last 6 months)
const Q_XP_6M = `
  query XP6M($from: timestamptz!) {
    transaction(
      where: { type: { _eq: "xp" }, createdAt: { _gte: $from } }
      order_by: { createdAt: asc }
      limit: 10000
    ) {
      amount
      createdAt
      path
    }
  }
`;

// ALL TIME XP transactions (used for "XP By Project" bars)
const Q_XP_ALL = `
  query XPAll {
    transaction(
      where: { type: { _eq: "xp" } }
      order_by: { createdAt: asc }
      limit: 100000
    ) {
      amount
      createdAt
      path
    }
  }
`;

// Nested query (progress -> object) (projects only)
const Q_RESULTS = `
  query ProgressProjects {
    progress(
      where: { object: { type: { _eq: "project" } } }
      order_by: { updatedAt: desc }
      limit: 2000
    ) {
      id
      grade
      path
      object { id name type }
    }
  }
`;

// ----- Helpers -----
function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString();
}

function groupSum(items, keyFn, valFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    const v = valFn(it);
    m.set(k, (m.get(k) ?? 0) + v);
  }
  return Array.from(m.entries()).map(([k, v]) => ({ key: k, value: v }));
}

function cumulativeByDay(transactions) {
  const map = new Map();
  for (const t of transactions) {
    const d = new Date(t.createdAt);
    const key = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    ).getTime();
    map.set(key, (map.get(key) ?? 0) + (t.amount ?? 0));
  }

  const days = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  let cum = 0;
  return days.map(([day, sum]) => {
    cum += sum;
    return { x: day, y: cum };
  });
}

// ----- Main -----
async function load() {
  const from = sixMonthsAgoISO();

  const [userData, totalsData, xp6mData, resultsData, xpAllTxData] =
    await Promise.all([
      gql(Q_USER),
      gql(Q_TOTALS),
      gql(Q_XP_6M, { from }),
      gql(Q_RESULTS),
      gql(Q_XP_ALL),
    ]);

  // user
  const user = (userData.user ?? [])[0];
  whoEl.textContent = user?.login ?? "—";
  userIdEl.textContent = user?.id ?? "—";
  userLoginEl.textContent = user?.login ?? "—";

  // totals
  const xpAll = (totalsData.xp_all ?? []).reduce(
    (s, t) => s + (t.amount ?? 0),
    0
  );
  totalXPAllEl.textContent = formatXP(xpAll);

  const up = (totalsData.audit_up ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
  const down = (totalsData.audit_down ?? []).reduce(
    (s, t) => s + (t.amount ?? 0),
    0
  );
  auditRatioEl.textContent = down === 0 ? "—" : (up / down).toFixed(2);
  auditDetailEl.textContent = `Up: ${formatXP(up)} • Down: ${formatXP(down)}`;

  // last 6m (for line chart + "Total XP (Last 6 months)" box)
  const tx6m = xp6mData.transaction ?? [];
  const xp6m = tx6m.reduce((s, t) => s + (t.amount ?? 0), 0);
  totalXP6mEl.textContent = formatXP(xp6m);

  const linePoints = cumulativeByDay(tx6m);
  renderXPLineChart(xpLineWrap, linePoints);

  // projects list (from progress query)
  const results = resultsData.progress ?? [];

  // pass/fail projects only
  const pass = results.filter((r) => (r.grade ?? 0) >= 1).length;
  const fail = results.filter((r) => (r.grade ?? 0) === 0).length;
  projectsPFEl.textContent = `${pass} / ${fail}`;
  renderDonut(pfWrap, pass, fail);

  // ---- XP by project (ALL TIME) ----
  const txAll = xpAllTxData.transaction ?? [];

  // Build a set of known project paths (projects only)
  const projectPathSet = new Set(results.map((r) => r.path).filter(Boolean));

  // Keep only XP transactions that match a project path
  const txProjectsAll = txAll.filter((t) => projectPathSet.has(t.path));

  // Group by full path, but display a nicer label (slug) for chart labels/tooltip
  const byPath = groupSum(
    txProjectsAll,
    (t) => t.path ?? "unknown",
    (t) => t.amount ?? 0
  );

  const byProject = byPath
    .map(({ key, value }) => {
      const slug = key.split("/").pop() || "unknown";
      return {
        name: slug.replace(/-/g, " "),
        value,
        // keep original path if you later want tooltip = full path:
        path: key,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  renderBarChart(xpBarsWrap, byProject);
}

load().catch((err) => {
  alert(err?.message || "Failed to load");
  clearToken();
  window.location.replace("./index.html");
});
