#!/usr/bin/env node
/* ==========================================================================
   build-corpus.mjs — batch report generation for Substrate
   --------------------------------------------------------------------------
   Runs on your machine or in CI. Never in a browser. The key stays in the
   environment; the published artifact is a reviewed JSON file with no
   credentials and no runtime network dependency.

     export ANTHROPIC_API_KEY=sk-...
     node build-corpus.mjs requests.json corpus.json

   requests.json is what the site's request queue exports:
     { "requested": [ { "q": "Bialetti Moka Express 6-cup" } ] }

   Products already present in corpus.json are skipped unless --refresh is
   passed or they are past the review cycle. Rebuilding a report that has
   not changed only introduces drift.
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SCHEMA = 1;
const TTL_DAYS = 180;
const MODEL = "claude-sonnet-4-6";
const KEY = process.env.ANTHROPIC_API_KEY;

const [, , reqPath = "requests.json", outPath = "corpus.json"] = process.argv;
const REFRESH = process.argv.includes("--refresh");

if (!KEY) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(1); }

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
async function callModel(query) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content:
          `Research the consumer product: "${query}".\n\n` +
          `Search for teardowns, spec sheets, manufacturer material disclosures, patents, ` +
          `and country-of-origin filings. Then produce a composition report describing ` +
          `WHAT EACH PART IS MADE OF and HOW IT WAS FORMED.\n\n` + SCHEMA_NOTE
      }]
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  const raw = text.replace(/```json|```/g, "").trim();
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no JSON object in response");
  const obj = JSON.parse(raw.slice(a, b + 1));
  obj._searches = data.content.filter(b => b.type === "web_search_tool_result").length;
  return obj;
}

/* --------------------------------------------------------------- verifier */
/* Identical to the one in substrate.html. Keep them in sync — the site
   re-runs this on load, so a divergence shows up as a corpus that gets
   silently corrected in the browser. */
const TAGN = { e: "EXACT", l: "LIKELY", u: "UNKNOWN" };

export function verify(o) {
  const log = [];
  const srcOK = i => Number.isInteger(i) && o.sources?.[i] && /^https?:\/\//.test(o.sources[i].u || "");
  const step = (obj, label) => {
    if (!obj) return;
    const from = obj.t;
    if (obj.t === "e" && !srcOK(obj.src)) obj.t = "l";
    if (obj.t === "l" && !(obj.why || "").trim()) obj.t = "u";
    if (obj.t !== from) log.push(`${label} was tagged ${TAGN[from]} without ` +
      `${from === "e" ? "a working source" : "an inference basis"} — now ${TAGN[obj.t]}`);
    if (obj.t === "u") ["spec", "o", "s", "p", "m", "tier", "auto", "tol"]
      .forEach(k => { if (k in obj) obj[k] = null; });
    if (!["e", "l", "u"].includes(obj.t)) { obj.t = "u"; log.push(`${label} had no certainty tag — treated as UNKNOWN`); }
  };

  const t = o.target;
  t.materials.forEach(m => step(m, `Material "${m.n}"`));
  t.sourcing.forEach(x => step(x, `Sourcing of "${x.m}"`));
  step(t.construction, "Construction method");
  step(t.assembly, "Assembly location");
  step(t.skill, "Skill tier");
  t.parts.forEach(x => step(x, `Component "${x.n}"`));

  const ids = new Set((t.comps || []).map(c => c.id));
  const prune = (arr, f, lbl) => {
    const kept = (arr || []).filter(x => ids.has(f(x)));
    const n = (arr || []).length - kept.length;
    if (n) log.push(`${n} ${lbl} row(s) referenced an undeclared component — dropped`);
    return kept;
  };
  t.materials = prune(t.materials, x => x.c, "material");
  t.sourcing = prune(t.sourcing, x => x.c, "sourcing");
  t.construction.steps = prune(t.construction.steps, x => x.c, "process");
  t.skill.ops = prune(t.skill.ops, x => x[0], "skill");
  t.parts = prune(t.parts, x => x.c, "component");

  const sum = t.materials.reduce((a, m) => a + (+m.share || 0), 0);
  if (sum > 105) log.push(`Material shares summed to ${Math.round(sum)}% — mass figures approximate`);

  const all = [...t.materials, ...t.sourcing, t.construction, t.assembly, t.skill, ...t.parts];
  if (!all.some(x => x.t === "e")) log.push("No field is source-confirmed — everything inferred or missing");
  return log;
}

/* ---------------------------------------------------------------- helpers */
const norm = x => (x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slug = x => norm(x).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const today = new Date().toISOString().slice(0, 10);
const ageOf = d => Math.round((Date.now() - new Date(d).getTime()) / 864e5);

function toProducts(o) {
  const kid = "k-" + slug(o.klassLabel);
  const t = o.target;
  const id = slug(t.brand + "-" + t.model);
  const target = {
    id, brand: t.brand, model: t.model, klass: kid, year: t.year || "unspecified",
    axes: t.axes, comps: t.comps, materials: t.materials, sourcing: t.sourcing,
    construction: t.construction, assembly: t.assembly, skill: t.skill,
    parts: t.parts, issues: t.issues || [],
    gen: today, rev: false, sources: o.sources || [], vlog: o._vlog || []
  };
  const peers = (o.peers || []).slice(0, 2).map((p, i) => ({
    id: `${id}-peer${i}`, brand: p.brand, model: p.model, klass: kid, year: "unspecified",
    axes: p.axes, comps: [], materials: [], sourcing: [],
    construction: { mode: "Unknown", t: "u", auto: null, tol: null, steps: [] },
    assembly: { sites: [{ l: "Not researched", o: "Included for delta comparison only" }], label: "Not researched", count: "Unknown", t: "u" },
    skill: { tier: null, t: "u", basis: p.why || "Delta reference; no report built.", ops: [] },
    parts: [], issues: [], stub: true, gen: today, rev: false, sources: [], vlog: []
  }));
  return { kid, klassLabel: o.klassLabel, products: [target, ...peers] };
}

/* ------------------------------------------------------------------- main */
const reqs = JSON.parse(readFileSync(reqPath, "utf8")).requested || [];
const corpus = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, "utf8"))
  : { schema: SCHEMA, built: today, classes: {}, products: [] };

const have = new Set(corpus.products.map(p => p.id));
let built = 0, skipped = 0, failed = 0, adjusted = 0;

for (const r of reqs) {
  const guess = slug(r.q);
  const hit = corpus.products.find(p => p.id.startsWith(guess.slice(0, 20)));
  if (hit && !REFRESH && ageOf(hit.gen) < TTL_DAYS) {
    console.log(`skip   ${r.q}  (built ${hit.gen}, ${ageOf(hit.gen)}d old)`);
    skipped++; continue;
  }
  try {
    process.stdout.write(`build  ${r.q} … `);
    const o = await callModel(r.q);
    o._vlog = verify(o);
    adjusted += o._vlog.length;
    const { kid, klassLabel, products } = toProducts(o);
    corpus.classes[kid] = klassLabel;
    for (const p of products) {
      const i = corpus.products.findIndex(x => x.id === p.id);
      if (i >= 0) corpus.products[i] = p; else corpus.products.push(p);
    }
    console.log(`ok  (${o._searches} search result set(s), ${o._vlog.length} claim(s) adjusted)`);
    o._vlog.forEach(l => console.log(`         ↓ ${l}`));
    built++;
  } catch (e) {
    console.log(`FAILED — ${e.message}`);
    failed++;
  }
}

corpus.schema = SCHEMA;
corpus.built = today;
writeFileSync(outPath, JSON.stringify(corpus, null, 2));

const unreviewed = corpus.products.filter(p => !p.rev && !p.stub).length;
const overdue = corpus.products.filter(p => ageOf(p.gen) > TTL_DAYS).length;

console.log(`
─────────────────────────────────────────────
built ${built}   skipped ${skipped}   failed ${failed}
${adjusted} claim(s) downgraded by the verifier
${corpus.products.length} products across ${Object.keys(corpus.classes).length} classes → ${outPath}

${unreviewed} report(s) await human review before publication.
${overdue} report(s) are past the ${TTL_DAYS}-day cycle — rerun with --refresh.

Set rev:true on a product once a person has checked it against its
sources. The site shows unreviewed reports as machine-built.
─────────────────────────────────────────────`);
