import { clearToken, getToken } from "./auth.js";
import { gql } from "./graphql.js";
import { formatXP } from "./utils.js";
import { renderXPLineChart, renderBarChart, renderDonut } from "./charts.js";

// This page expects a JWT in localStorage (set by login.js).
if (!getToken()) window.location.replace("./index.html");

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  clearToken();
  window.location.replace("./index.html");
});

const whoEl = document.getElementById("who");
const userIdEl = document.getElementById("userId");
const userLoginEl = document.getElementById("userLogin");
const totalXPAllEl = document.getElementById("totalXPAll");
const totalXP6mEl = document.getElementById("totalXP6m");
const xpBreakdownAllEl = document.getElementById("xpBreakdownAll");
const xpBreakdown6mEl = document.getElementById("xpBreakdown6m");
const auditRatioEl = document.getElementById("auditRatio");
const auditDetailEl = document.getElementById("auditDetail");
const projectsPFEl = document.getElementById("projectsPF");

const xpLineWrap = document.getElementById("xpLine");
const xpBarsWrap = document.getElementById("xpBars");
const pfWrap = document.getElementById("pfDonut");

// Queries 

const Q_USER = `query { user { id login } }`;

const Q_AUDIT_AGG = `
  query {
    up: transaction_aggregate(where: { type: { _eq: "up" } }) {
      aggregate { sum { amount } }
    }
    down: transaction_aggregate(where: { type: { _eq: "down" } }) {
      aggregate { sum { amount } }
    }
  }
`;

const Q_PROGRESS_PROJECTS = `
  query {
    progress(
      where: { object: { type: { _eq: "project" } } }
      order_by: { updatedAt: desc }
      limit: 4000
    ) {
      grade
      path
      updatedAt
      object { id name type }
    }
  }
`;

const Q_XP_BY_PATHS_PAGE = `
  query XPByPathsPage($paths: [String!]!, $from: timestamptz!, $limit: Int!, $offset: Int!) {
    transaction(
      where: { type: { _eq: "xp" }, createdAt: { _gte: $from }, path: { _in: $paths } }
      order_by: { createdAt: asc }
      limit: $limit
      offset: $offset
    ) {
      amount
      createdAt
      path
    }
  }
`;

const Q_XP_WINDOW_USER_PAGE = `
  query XPWindowUserPage($uid: Int!, $from: timestamptz!, $to: timestamptz!, $limit: Int!, $offset: Int!) {
    transaction(
      where: {
        userId: { _eq: $uid },
        type: { _eq: "xp" },
        createdAt: { _gte: $from, _lte: $to }
      }
      order_by: { createdAt: asc }
      limit: $limit
      offset: $offset
    ) {
      amount
      createdAt
      path
      object { name type }
    }
  }
`;

// Only checkpoint
const Q_PISCINE_CANDIDATES = `
  query PiscineCandidates($min: numeric!, $max: numeric!, $limit: Int!) {
    transaction(
      where: {
        type: { _eq: "xp" },
        path: { _ilike: "%piscine%" },
        amount: { _gte: $min, _lte: $max }
      }
      order_by: { createdAt: desc }
      limit: $limit
    ) {
      amount
      createdAt
      path
      object { name type }
    }
  }
`;


// Helpers 

function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString();
}

function sumAmounts(rows) {
  return rows.reduce((acc, r) => acc + (r.amount ?? 0), 0);
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
  return days.map(([day, sum]) => ({ x: day, y: (cum += sum) }));
}

function normPath(p) {
  const s = String(p || "");
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

async function fetchAllPaged(query, baseVars, pageSize = 1500, maxPages = 200) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const vars = { ...baseVars, limit: pageSize, offset: page * pageSize };
    const data = await gql(query, vars);
    const rows = data?.transaction ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function pickPiscineJsCheckpoint(candidates, moduleStart, moduleEnd) {
  const startMs = Date.parse(moduleStart);
  const endMs = Date.parse(moduleEnd);

  const isQuest = (p) => /\/quest[-_/]?/i.test(String(p || ""));
  const isPiscine = (p, objName) =>
    /piscine/i.test(String(p || "")) || /piscine/i.test(String(objName || ""));
  const isJs = (p, objName) => {
    const s = `${p || ""} ${objName || ""}`.toLowerCase();
    return (
      s.includes("piscine-js") ||
      s.includes("piscine_js") ||
      s.includes("javascript") ||
      s.includes(" js") ||
      s.endsWith("js")
    );
  };

  
  const windowJs = candidates.filter((t) => {
    const ms = Date.parse(t.createdAt);
    const objName = t?.object?.name;
    return (
      ms >= startMs &&
      ms <= endMs &&
      isPiscine(t.path, objName) &&
      isJs(t.path, objName) &&
      !isQuest(t.path)
    );
  });


  const anyJs = candidates.filter((t) => {
    const objName = t?.object?.name;
    return isPiscine(t.path, objName) && isJs(t.path, objName) && !isQuest(t.path);
  });

  const pool = windowJs.length ? windowJs : anyJs;
  if (!pool.length) return null;

  // Prefer biggest amount, then most recent
  pool.sort((a, b) => {
    const aa = Math.abs(a.amount ?? 0);
    const bb = Math.abs(b.amount ?? 0);
    if (bb !== aa) return bb - aa;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  return pool[0];
}

//  Main load 

async function load() {
  const from6m = sixMonthsAgoISO();
  const fromAll = "1970-01-01T00:00:00.000Z";

  const [userData, auditAgg, progressData] = await Promise.all([
    gql(Q_USER),
    gql(Q_AUDIT_AGG),
    gql(Q_PROGRESS_PROJECTS),
  ]);

  const user = (userData.user ?? [])[0];
  const uid = user?.id;
  const login = user?.login ?? "";

  whoEl.textContent = login || "—";
  userIdEl.textContent = uid ?? "—";
  userLoginEl.textContent = login || "—";

  const up = auditAgg?.up?.aggregate?.sum?.amount ?? 0;
  const down = auditAgg?.down?.aggregate?.sum?.amount ?? 0;
  auditRatioEl.textContent = down === 0 ? "—" : (up / down).toFixed(2);
  auditDetailEl.textContent = `Up: ${formatXP(up)} • Down: ${formatXP(down)}`;

  const progress = progressData.progress ?? [];

  // Pass/Fail (latest grade per project)
  const latestByProject = new Map();
  for (const r of progress) {
    const key = r.object?.id ?? r.path;
    if (!key) continue;
    if (!latestByProject.has(key)) latestByProject.set(key, r);
  }
  const latest = Array.from(latestByProject.values());
  const pass = latest.filter((r) => (r.grade ?? 0) >= 1).length;
  const fail = latest.filter((r) => (r.grade ?? 0) === 0).length;
  projectsPFEl.textContent = `${pass} / ${fail}`;
  renderDonut(pfWrap, pass, fail);

  // Project paths
  const rawPaths = progress.map((r) => r.path).filter(Boolean);
  const projectPaths = Array.from(
    new Set(
      rawPaths.flatMap((p) => {
        const s = String(p);
        if (s.endsWith("/")) return [s, s.slice(0, -1)];
        return [s, `${s}/`];
      })
    )
  );

  const projectSet = new Set(projectPaths.map(normPath));

  if (!projectPaths.length) {
    totalXPAllEl.textContent = formatXP(0);
    totalXP6mEl.textContent = formatXP(0);
    if (xpBreakdownAllEl) xpBreakdownAllEl.textContent = "—";
    if (xpBreakdown6mEl) xpBreakdown6mEl.textContent = "—";
    renderXPLineChart(xpLineWrap, []);
    renderBarChart(xpBarsWrap, []);
    return;
  }

  // 1) Projects XP
  const [txProjectsAll, txProjects6m] = await Promise.all([
    fetchAllPaged(Q_XP_BY_PATHS_PAGE, { paths: projectPaths, from: fromAll }),
    fetchAllPaged(Q_XP_BY_PATHS_PAGE, { paths: projectPaths, from: from6m }),
  ]);

  const projectXPAll = sumAmounts(txProjectsAll);
  const projectXP6m = sumAmounts(txProjects6m);

  // Module window = first→last project XP transaction
  const moduleStart = txProjectsAll[0]?.createdAt ?? fromAll;
  const moduleEnd =
    txProjectsAll[txProjectsAll.length - 1]?.createdAt ?? new Date().toISOString();

  // 2) Piscine JS checkpoint 
  const piscineCandidatesData = await gql(Q_PISCINE_CANDIDATES, {
  min: 20000.0,
  max: 200000.0,
  limit: 250,
});

  const piscineCandidates = piscineCandidatesData?.transaction ?? [];
  const piscineJs = pickPiscineJsCheckpoint(
    piscineCandidates,
    moduleStart,
    moduleEnd
  );

  const piscineXPAll = piscineJs?.amount ?? 0;
  const piscineXP6m =
    piscineJs && Date.parse(piscineJs.createdAt) >= Date.parse(from6m)
      ? piscineJs.amount ?? 0
      : 0;

  // 3) exercise/exam
  const txWindow = await fetchAllPaged(Q_XP_WINDOW_USER_PAGE, {
    uid,
    from: moduleStart,
    to: moduleEnd,
  });

  const smallTx = txWindow.filter((t) => {
    const amt = Math.abs(t.amount ?? 0);
    const p = normPath(t.path);

    const isProject = projectSet.has(p);
    if (isProject) return false;

    const isPiscine =
      /piscine/i.test(String(t.path || "")) ||
      /piscine/i.test(String(t?.object?.name || ""));
    if (isPiscine) return false; 

    return amt > 0 && amt < 2000;
  });

  const smallXPAll = sumAmounts(smallTx);
  const smallXP6m = sumAmounts(
    smallTx.filter((t) => Date.parse(t.createdAt) >= Date.parse(from6m))
  );

  // ✅ Totals
  const totalAll = projectXPAll + piscineXPAll + smallXPAll;
  const total6m = projectXP6m + piscineXP6m + smallXP6m;

  totalXPAllEl.textContent = formatXP(totalAll);
  totalXP6mEl.textContent = formatXP(total6m);

  if (xpBreakdownAllEl) {
    xpBreakdownAllEl.textContent = `Projects: ${formatXP(projectXPAll)} • Piscine JS: ${formatXP(
      piscineXPAll
    )} • Small: ${formatXP(smallXPAll)}`;
  }
  if (xpBreakdown6mEl) {
    xpBreakdown6mEl.textContent = `Projects: ${formatXP(projectXP6m)} • Piscine JS: ${formatXP(
      piscineXP6m
    )} • Small: ${formatXP(smallXP6m)}`;
  }

  // 6m line chart
  const txForLine = [...txProjects6m];
  if (piscineJs && Date.parse(piscineJs.createdAt) >= Date.parse(from6m)) {
    txForLine.push(piscineJs);
  }
  for (const t of smallTx) {
    if (Date.parse(t.createdAt) >= Date.parse(from6m)) txForLine.push(t);
  }
  txForLine.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  renderXPLineChart(xpLineWrap, cumulativeByDay(txForLine));

  // XP by project (all time)
  const byPath = groupSum(
    txProjectsAll,
    (t) => t.path ?? "unknown",
    (t) => t.amount ?? 0
  );
  const byProject = byPath
    .map(({ key, value }) => {
      const slug = String(key).split("/").filter(Boolean).pop() || key;
      return { name: slug.replace(/-/g, " "), value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  renderBarChart(xpBarsWrap, byProject);

  // Debug (open console)
  console.log("XP DEBUG", {
    projectXPAll,
    piscinePicked: piscineJs,
    smallCount: smallTx.length,
    smallXPAll,
    totalAll,
  });
}

load().catch((err) => {
  alert(err?.message || "Failed to load");
  clearToken();
  window.location.replace("./index.html");
});
