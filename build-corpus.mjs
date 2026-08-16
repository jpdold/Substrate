#!/usr/bin/env node
/* ==========================================================================
   build-corpus.mjs — batch report generation for Substrate
   --------------------------------------------------------------------------
   Runs on your machine or in CI. Never in a browser. The key stays in the
   environment; the published artifact is a reviewed JSON file with no
   credentials and no runtime network dependency.

     export ANTHROPIC_API_KEY=sk-...
     node build-corpus.mjs                    # queue.json → corpus.json
     node build-corpus.mjs --stale            # also refresh reports past the cycle
     node build-corpus.mjs --max=2            # tighter cap for a trial run
     node build-corpus.mjs q.json out.json    # explicit paths

   queue.json is tracked and holds what to research next. Paste in what the
   site's request queue exports:
     { "requested": [ { "q": "Bialetti Moka Express 6-cup" } ] }

   Products already present in corpus.json are skipped unless --refresh is
   passed or they are past the review cycle. Rebuilding a report that has
   not changed only introduces drift.

   --stale adds every corpus product past the review cycle to the work list.
   The queue has no reason to relist a product built months ago, so without
   it a scheduled rebuild would refresh nothing.
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCHEMA = 1;
const TTL_DAYS = 180;
export const MODEL = "claude-sonnet-5";
const KEY = process.env.ANTHROPIC_API_KEY;

/* max_tokens bounds thinking AND response text together, and this model thinks
   by default — 8000 was sized for a thinking-off model and would now truncate
   mid-JSON. 16000 is the ceiling that still keeps a non-streaming request under
   the HTTP timeout; above that this would have to stream. */
export const MAX_TOKENS = 16000;

/* A server-side tool loop that hits its iteration limit comes back as
   stop_reason "pause_turn" with no final answer. Resending continues it. */
const MAX_CONTINUATIONS = 5;

/* Positional args skip flags, so `node build-corpus.mjs --stale` still writes to
   the default corpus.json rather than treating the flag as a path. */
const positional = process.argv.slice(2).filter(a => !a.startsWith("--"));
const [reqPath = "queue.json", outPath = "corpus.json"] = positional;
const REFRESH = process.argv.includes("--refresh");
const STALE = process.argv.includes("--stale");

/* A scheduled run spends real money per product. The cap bounds both the bill
   and the size of the PR a reviewer has to read; overflow is deferred and
   logged, never dropped quietly. */
export const MAX_PER_RUN = 5;

const MAX = (() => {
  const a = process.argv.find(x => x.startsWith("--max="));
  const n = a ? Number(a.slice(6)) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : MAX_PER_RUN;
})();

/* Nothing above the main() guard at the bottom may exit or do I/O: test.mjs
   imports verify() and deriveAxes() from here to prove they still agree with
   the copies in index.html, and an import that calls process.exit takes the
   test suite down with it. */

/* -------------------------------------------------------------- schema ask */
const SCHEMA_NOTE = `Return ONE json object, no prose, no markdown fences:
{"klassLabel":"<functional class: what it DOES, not the brand>",
 "target":{"brand":"","model":"","year":"",
   "axes":{"material":0,"sourcing":0,"construction":0,"assembly":0,"skill":0,"superstructure":0},
   "comps":[{"id":"","n":"","role":"Critical|Structural|Functional|Cosmetic"}],
   "materials":[{"c":"<comp id>","n":"","share":0,"spec":"","t":"e|l|u","src":0,"why":""}],
   "sourcing":[{"c":"","m":"","o":"","s":"","t":"","src":0,"why":"","note":""}],
   "construction":{"mode":"Factory|Hand-made|Both|Unknown","t":"","auto":"","tol":"","src":0,"why":"",
     "steps":[{"c":"","p":""}]},
   "assembly":{"sites":[{"l":"","o":""}],"label":"","count":"Single site|Multiple sites|Unknown","t":"","src":0,"why":""},
   "skill":{"tier":"","t":"","basis":"","src":0,"why":"","ops":[["<comp id>","operation","skill applied"]]},
   "parts":[{"c":"","n":"","m":"","crit":"","t":"","fail":"","src":0,"why":""}],
   "issues":[]},
 "peers":[{"brand":"","model":"","axes":{...same six keys...},"why":"one line on how it differs"}],
 "sources":[{"t":"page title","u":"https://..."}]}

RULES — these decide whether the report is usable:
- t is the certainty of that specific field. "e" EXACT, "l" LIKELY, "u" UNKNOWN.
- "e" REQUIRES src = index into sources[] of a page that states it. No source, do not use "e".
- "l" REQUIRES why = the inference chain in one line.
- "u" means you could not establish it. Set the value to null. Do NOT guess.
  UNKNOWN is a correct answer and is preferred over a plausible fabrication.
- Every c must match a comps[].id. Max 5 comps, 6 materials, 4 sourcing, 5 steps, 4 parts.
- Components are physical parts of the object (blade, handle, jar, seal), not qualities.
- axes are 0-100 and must be defensible from what you found.
- Exactly 2 peers: same function, different brand.
- Every string under 160 chars. Terse.`;

/* -------------------------------------------------------------- transport */
/* One free call before any research. Without it a bad key fails once per
   queued product — nine identical 401s at --max=9, none of which say "your
   key is the problem". /v1/models costs nothing and no tokens. */
export async function preflight(key = KEY) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }
    });
  } catch (e) {
    return { ok: false, why: `could not reach the API: ${e.message}` };
  }
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  if (res.status === 401) return { ok: false, why:
    `the API key was rejected (401).\n` +
    `  · A key looks like sk-ant-api03-… — an sk-ant-oat01-… token is an OAuth\n` +
    `    credential and will not authenticate here.\n` +
    `  · Check the key still exists and is enabled under Settings → API keys,\n` +
    `    and that you are looking at the organization that issued it.` };
  if (res.status === 400 && /credit|balance/i.test(body)) return { ok: false, why:
    `the key is valid but the organization has no credit. Add funds under Settings → Billing.` };
  return { ok: false, why: `the API answered ${res.status}: ${body.slice(0, 200)}` };
}

export async function callModel(query) {
  const messages = [{
    role: "user",
    content:
      `Research the consumer product: "${query}".\n\n` +
      `Search for teardowns, spec sheets, manufacturer material disclosures, patents, ` +
      `and country-of-origin filings. Then produce a composition report describing ` +
      `WHAT EACH PART IS MADE OF and HOW IT WAS FORMED.\n\n` + SCHEMA_NOTE
  }];

  const chunks = [];
  let searches = 0, searchErrors = 0, data;

  for (let turn = 0; ; turn++) {
    if (turn > MAX_CONTINUATIONS)
      throw new Error(`still paused after ${MAX_CONTINUATIONS} continuations`);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },   // stated rather than inherited: 4.6 defaulted this off
        output_config: { effort: "high" },
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages
      })
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    data = await res.json();

    /* A failed search still arrives as a 200 with a web_search_tool_result
       block — success carries a list, failure carries an error object. Counting
       both as searches would report research that never happened. */
    for (const blk of data.content) {
      if (blk.type === "web_search_tool_result")
        Array.isArray(blk.content) ? searches++ : searchErrors++;
      if (blk.type === "text") chunks.push(blk.text);
    }

    if (data.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: data.content });
  }

  /* Fail loudly on the two stops that otherwise surface as an unhelpful
     "no JSON object in response". */
  if (data.stop_reason === "refusal")
    throw new Error(`declined by safety classifiers (${data.stop_details?.category ?? "no category"})`);
  if (data.stop_reason === "max_tokens")
    throw new Error(`hit the ${MAX_TOKENS}-token ceiling before finishing the report — the JSON is truncated`);

  const raw = chunks.join("\n").replace(/```json|```/g, "").trim();
  const open = raw.indexOf("{"), close = raw.lastIndexOf("}");
  if (open < 0 || close < 0) throw new Error("no JSON object in response");
  const obj = JSON.parse(raw.slice(open, close + 1));
  obj._searches = searches;
  obj._searchErrors = searchErrors;
  return obj;
}

/* ----------------------------------------------------------- link liveness */
/* verify() can only regex a URL: it runs in the browser too, and a page cannot
   fetch cross-origin to see whether a citation resolves. So an EXACT claim
   citing a 404 passes it — which it did on the first real build. Node can
   fetch, so liveness is checked here, once, at build time.

   Only 404 and 410 count as broken. A 403 is a site blocking automated
   fetches, not a dead page — Bladeforums returns one for a thread a reader can
   open perfectly well, and downgrading on that would be its own false claim.
   Anything else is recorded as unverified and left alone.

   A broken source has its `u` blanked (kept as `deadUrl`) so the ordinary
   verifier cascade does the downgrade and logs it, rather than duplicating
   that logic here and drifting from index.html. */
const GONE = new Set([404, 410]);

export async function checkSources(o, fetchImpl = fetch) {
  const log = [];
  for (const [i, s] of (o.sources || []).entries()) {
    if (!s || !/^https?:\/\//.test(s.u || "")) continue;
    let status;
    try {
      const r = await fetchImpl(s.u, { redirect: "follow", signal: AbortSignal.timeout(20000) });
      status = r.status;
    } catch { status = "unreachable"; }

    if (GONE.has(status)) {
      s.deadUrl = s.u; s.u = ""; s.httpStatus = status;
      log.push(`Source [${i}] “${s.t}” returned ${status} — anything citing it can no longer be EXACT`);
    } else if (status !== 200) {
      s.httpStatus = status;
      log.push(`Source [${i}] “${s.t}” answered ${status} — left in place; a block or a timeout is not a dead page`);
    }
  }
  return log;
}

/* --------------------------------------------------------------- verifier */
/* Byte-for-byte the same logic and the same log wording as the copy in
   index.html — invariant 1. The site re-runs this on load, so a divergence
   silently corrects a corpus that passed its own build. The two had already
   drifted in their log text once; test.mjs now imports both and asserts they
   produce identical output rather than trusting this comment. */
const TAGN = { e: "EXACT", l: "LIKELY", u: "UNKNOWN" };

export function verify(o) {
  const log = [], srcOK = i => Number.isInteger(i) && o.sources && o.sources[i] && /^https?:\/\//.test(o.sources[i].u || "");
  const step = (obj, label) => {
    if (!obj) return;
    const from = obj.t;
    if (obj.t === "e" && !srcOK(obj.src)) obj.t = "l";
    if (obj.t === "l" && !(obj.why || "").trim()) obj.t = "u";
    if (obj.t !== from) log.push(label + " was tagged " + TAGN[from] + " without " +
      (from === "e" ? "a working source" : "an inference basis") + " — now " + TAGN[obj.t]);
    if (obj.t === "u") { ["spec", "o", "s", "p", "m", "tier", "auto", "tol"].forEach(k => { if (k in obj) obj[k] = null; }); }
    if (!["e", "l", "u"].includes(obj.t)) { obj.t = "u"; log.push(label + " had no certainty tag — treated as UNKNOWN"); }
  };
  const t = o.target;
  t.materials.forEach(m => step(m, "Material “" + m.n + "”"));
  t.sourcing.forEach(x => step(x, "Sourcing of “" + x.m + "”"));
  step(t.construction, "Construction method");
  step(t.assembly, "Assembly location");
  step(t.skill, "Skill tier");
  t.parts.forEach(x => step(x, "Component “" + x.n + "”"));

  // orphan guard: a row bound to a component that was never declared is unreadable
  const ids = new Set((t.comps || []).map(c => c.id));
  const prune = (arr, f, lbl) => {
    const before = arr.length;
    const kept = arr.filter(x => ids.has(f(x)));
    if (kept.length < before) log.push((before - kept.length) + " " + lbl + " row(s) referenced an undeclared component — dropped");
    return kept;
  };
  t.materials = prune(t.materials, x => x.c, "material");
  t.sourcing = prune(t.sourcing, x => x.c, "sourcing");
  t.construction.steps = prune(t.construction.steps || [], x => x.c, "process");
  t.skill.ops = prune(t.skill.ops || [], x => x[0], "skill");
  t.parts = prune(t.parts, x => x.c, "component");

  // mass share sanity
  const sum = t.materials.reduce((a, m) => a + (+m.share || 0), 0);
  if (sum > 105) log.push("Material shares summed to " + Math.round(sum) + "% — treat mass figures as approximate");

  // a report with no confirmed field anywhere is worth saying out loud
  const cc = [...t.materials, ...t.sourcing, t.construction, t.assembly, t.skill, ...t.parts];
  if (!cc.some(x => x.t === "e")) log.push("No field in this report is source-confirmed — everything is inferred or missing");
  return log;
}

/* ---------------------------------------------------------- derived axes */
/* Also duplicated from index.html. The site derives on load regardless, so a
   corpus written without this still renders correctly — but corpus.json would
   carry the pass's judged sourcing number while the site displayed a different
   one, and the PR that is meant to be the review gate would be reviewing a
   figure nobody sees. Deriving here keeps the artifact and the page in step. */
export const EVW = { e: 1, l: 0.5, u: 0 };

export function srcDensity(p) {
  const rows = p.sourcing || [];
  if (!rows.length) return null;
  return Math.round(rows.reduce((a, x) => a + (EVW[x.t] || 0), 0) / rows.length * 100);
}

export function deriveAxes(p) {
  const d = srcDensity(p);
  if (d === null) { p.srcAdj = { derived: false }; return; }
  const model = p.srcAdj && p.srcAdj.derived ? p.srcAdj.model : p.axes.sourcing;
  p.srcAdj = { derived: true, model, value: d, diff: d - model, rows: (p.sourcing || []).length };
  p.axes.sourcing = d;
}

/* ---------------------------------------------------------------- helpers */
const norm = x => (x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = x => norm(x).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const today = new Date().toISOString().slice(0, 10);
const ageOf = d => Math.round((Date.now() - new Date(d).getTime()) / 864e5);

/* `pin` makes a rebuild land on top of an existing product instead of beside
   it. Without it the id and class are derived from whatever brand and model
   strings the model happened to return this run, so re-researching a product
   — including a --stale refresh of one the script built itself — produces a
   near-duplicate under a new id, in a new class, split from its own peers. */
export function toProducts(o, pin = {}) {
  const kid = pin.klass || ("k-" + slug(o.klassLabel));
  const t = o.target;
  const id = pin.id || slug(t.brand + "-" + t.model);
  const target = {
    id, brand: t.brand, model: t.model, klass: kid, year: t.year || "unspecified",
    axes: t.axes, comps: t.comps, materials: t.materials, sourcing: t.sourcing,
    construction: t.construction, assembly: t.assembly, skill: t.skill,
    parts: t.parts, issues: t.issues || [],
    gen: today, rev: false, sources: o.sources || [], vlog: o._vlog || []
  };
  /* A pinned class already has real peers. Attaching generated stubs to it
     would put unresearched placeholders next to researched products and drag
     the class-silence reduction toward "nobody discloses this". */
  const peers = pin.klass ? [] : (o.peers || []).slice(0, 2).map((p, i) => ({
    id: `${id}-peer${i}`, brand: p.brand, model: p.model, klass: kid, year: "unspecified",
    axes: p.axes, comps: [], materials: [], sourcing: [],
    construction: { mode: "Unknown", t: "u", auto: null, tol: null, steps: [] },
    assembly: { sites: [{ l: "Not researched", o: "Included for delta comparison only" }], label: "Not researched", count: "Unknown", t: "u" },
    skill: { tier: null, t: "u", basis: p.why || "Delta reference; no report built.", ops: [] },
    parts: [], issues: [], stub: true, gen: today, rev: false, sources: [], vlog: []
  }));
  const products = [target, ...peers];
  products.forEach(deriveAxes);   // stubs have no sourcing rows and keep the judged axis
  return { kid, klassLabel: o.klassLabel, products };
}

/* ---------------------------------------------------------------- work list */
/* Two sources of work, because the scheduled run needs both. Queued products
   come from the tracked queue file. Stale ones are read out of the corpus
   itself — the request file has no reason to list a product that was built
   months ago, so without this a scheduled "rebuild" would refresh nothing. */
export function workList(queue, corpus, { stale = false, max = MAX_PER_RUN } = {}) {
  /* Dedupe on both keys, not whichever one is handy. A product can arrive
     queued without a pin and again from --stale with one; keying on the id
     alone lets those two through as separate work and pays for the same
     research twice. */
  const seenId = new Set(), seenQ = new Set(), out = [];
  const add = (q, why, pin = {}) => {
    const qk = slug(q), ik = pin.id || null;
    if (!qk && !ik) return;
    if ((ik && seenId.has(ik)) || (qk && seenQ.has(qk))) return;
    if (ik) seenId.add(ik);
    if (qk) seenQ.add(qk);
    out.push({ q, why, id: pin.id, klass: pin.klass });
  };
  (queue || []).forEach(r => {
    if (typeof r === "string") return add(r, "queued");
    if (r && r.q) add(r.q, "queued", { id: r.id, klass: r.klass });
  });
  if (stale) {
    /* Carry the existing id and class so the refresh replaces the product
       rather than landing beside it under a regenerated slug. */
    (corpus.products || [])
      .filter(p => !p.stub && p.gen && ageOf(p.gen) > TTL_DAYS)
      .forEach(p => add(`${p.brand} ${p.model}`, "past the review cycle", { id: p.id, klass: p.klass }));
  }
  return { take: out.slice(0, max), deferred: out.slice(max) };
}

/* ------------------------------------------------------------------- main */
async function main() {
if (!KEY) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(1); }

const corpus = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, "utf8"))
  : { schema: SCHEMA, built: today, classes: {}, products: [] };

let queue = [];
if (existsSync(reqPath)) {
  queue = JSON.parse(readFileSync(reqPath, "utf8")).requested || [];
} else if (!STALE) {
  console.error(
    `${reqPath} does not exist.\n` +
    `Create it as {"requested":[{"q":"Bialetti Moka Express 6-cup"}]}, or pass\n` +
    `--stale to refresh reports already past the ${TTL_DAYS}-day cycle instead.`);
  process.exit(1);
}

const { take, deferred } = workList(queue, corpus, { stale: STALE, max: MAX });

/* Only worth checking if there is something to spend on. */
if (take.length) {
  const pre = await preflight();
  if (!pre.ok) { console.error(`Cannot start: ${pre.why}`); process.exit(1); }
  console.log(`auth   ok — building ${take.length} report(s)`);
}
if (deferred.length)
  console.log(`note   ${deferred.length} over the ${MAX}-per-run cap, deferred to the next run:\n` +
    deferred.map(d => `         · ${d.q}  (${d.why})`).join("\n"));
if (!take.length) console.log("note   nothing to build");

let built = 0, skipped = 0, failed = 0, adjusted = 0, reaxed = 0;

for (const r of take) {
  const guess = slug(r.q);
  const hit = corpus.products.find(p => p.id.startsWith(guess.slice(0, 20)));
  if (hit && !REFRESH && ageOf(hit.gen) < TTL_DAYS) {
    console.log(`skip   ${r.q}  (built ${hit.gen}, ${ageOf(hit.gen)}d old)`);
    skipped++; continue;
  }
  try {
    process.stdout.write(`build  ${r.q} … `);
    const o = await callModel(r.q);
    /* Liveness first: a dead source has its URL blanked, so the verifier that
       follows downgrades everything citing it through its normal cascade. */
    const linkLog = await checkSources(o);
    o._vlog = [...linkLog, ...verify(o)];
    adjusted += o._vlog.length;
    const { kid, klassLabel, products } = toProducts(o, { id: r.id, klass: r.klass });
    /* Only name a class we are creating. Overwriting a pinned class's label
       with this run's phrasing would rename an existing class on every rebuild. */
    if (!r.klass) corpus.classes[kid] = klassLabel;
    for (const p of products) {
      const i = corpus.products.findIndex(x => x.id === p.id);
      if (i >= 0) corpus.products[i] = p; else corpus.products.push(p);
    }
    console.log(`ok  (${o._searches} search result set(s)` +
      `${o._searchErrors ? `, ${o._searchErrors} search(es) FAILED` : ""}` +
      `, ${o._vlog.length} claim(s) adjusted)`);
    o._vlog.forEach(l => console.log(`         ↓ ${l}`));

    /* The pass judges a sourcing score; the rows decide it. Where those
       disagree the reviewer should see it in the build log, not only on the
       published page. */
    const a = products[0].srcAdj;
    if (a && a.derived && a.diff !== 0) {
      reaxed++;
      console.log(`         ± sourcing axis ${a.model} → ${a.value}  (pass scored it ` +
        `${Math.abs(a.diff)} ${a.diff < 0 ? "above" : "below"} what its ${a.rows} row(s) support)`);
    }
    built++;
  } catch (e) {
    console.log(`FAILED — ${e.message}`);
    failed++;
  }
}

/* Only write when something was actually built. Writing on a no-op run would
   create an empty corpus.json on a first --stale run — and since loadCorpus()
   replaces the embedded corpus wholesale, committing that would take the live
   site down to zero products. It also keeps the scheduled run from opening a
   PR whose only change is the build date. */
if (built) {
  corpus.schema = SCHEMA;
  corpus.built = today;
  writeFileSync(outPath, JSON.stringify(corpus, null, 2));
} else {
  console.log(`note   nothing built — ${outPath} left untouched`);
}

const unreviewed = corpus.products.filter(p => !p.rev && !p.stub).length;
const overdue = corpus.products.filter(p => ageOf(p.gen) > TTL_DAYS).length;

console.log(`
─────────────────────────────────────────────
built ${built}   skipped ${skipped}   failed ${failed}
${adjusted} claim(s) downgraded by the verifier
${reaxed} report(s) had their sourcing axis moved off the pass's judgment
${corpus.products.length} products across ${Object.keys(corpus.classes).length} classes → ${outPath}

${unreviewed} report(s) await human review before publication.
${overdue} report(s) are past the ${TTL_DAYS}-day cycle — rerun with --stale.

Set rev:true on a product once a person has checked it against its
sources. The site shows unreviewed reports as machine-built.
─────────────────────────────────────────────`);
}

/* Only run when invoked directly — test.mjs imports verify() and deriveAxes()
   from this file to check them against the copies in index.html. */
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
