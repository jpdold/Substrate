#!/usr/bin/env node
/* ==========================================================================
   test.mjs — regression suite for Substrate
   --------------------------------------------------------------------------
   Extracts the script block from index.html, stubs the DOM, and exercises
   every renderer across every product in both pivots. Then runs the verifier
   against a deliberately confabulated payload and asserts it catches each
   fault.

       node test.mjs

   No dependencies. Exits non-zero on failure so CI can gate on it.
   ========================================================================== */

import { readFileSync } from "node:fs";

const fails = [];
const fail = m => fails.push(m);
const ok = m => console.log(`  ok   ${m}`);

/* ---- load the site's script block, minus the DOM-bound tail ---- */
const html = readFileSync("index.html", "utf8");
const block = html.split("<script>")[1]?.split("</script>")[0];
if (!block) { console.error("could not find the script block in index.html"); process.exit(1); }
const src = block.split("/* ============================ RENDER ============================ */")[0];

const stub = `
globalThis.render = () => {};
globalThis.document = { getElementById: () => null, createElement: () => ({ click(){} }) };
globalThis.window = { scrollTo(){} };
globalThis.fetch = async () => { throw new Error("network disabled in tests"); };
`;

const mod = await import(
  "data:text/javascript," + encodeURIComponent(
    stub + src + "\nexport { P, S, CLASSES, certCount, score, deltas, peers, verify, ingest, " +
    "quickView, fullView, peerView, customView, vpanel, matches, results, stale, ageDays, " +
    "norm, addReq, REQS, renderGen, renderMethod, AXES, DEFAULT_W, SEV };"
  )
);

const {
  P, S, CLASSES, certCount, score, deltas, peers, verify, ingest,
  quickView, fullView, peerView, customView, vpanel, results, stale, norm,
  renderMethod, AXES, DEFAULT_W, SEV
} = mod;

/* ---------------------------------------------------------- 1. integrity */
console.log("\nstructural integrity");
for (const p of P) {
  const ids = new Set((p.comps || []).map(c => c.id));
  const check = (arr, f, lbl) => (arr || []).forEach(x => {
    if (!ids.has(f(x))) fail(`${p.id}: ${lbl} row references undeclared component "${f(x)}"`);
  });
  if (!p.stub) {
    check(p.materials, x => x.c, "material");
    check(p.sourcing, x => x.c, "sourcing");
    check(p.construction.steps, x => x.c, "process");
    check(p.skill.ops, x => x[0], "skill");
    check(p.parts, x => x.c, "component");
  }
  if (peers(p).length < 1) fail(`${p.id}: no peers — deltas() will throw`);
  const a = p.axes;
  ["material", "sourcing", "construction", "assembly", "skill", "superstructure"]
    .forEach(k => { if (typeof a?.[k] !== "number") fail(`${p.id}: axis "${k}" is not a number`); });
}
if (!fails.length) ok(`${P.length} products, no orphan rows, every class has peers`);

/* ------------------------------------------------------------ 2. renders */
console.log("\nrenderers");
let rendered = 0;
for (const p of P) {
  for (const pivot of ["attr", "comp"]) {
    S.pivot = pivot;
    try {
      const c = certCount(p), d = deltas(p);
      const out = quickView(p, c, d.filter(x => x.d > 0), d.filter(x => x.d < 0))
        + fullView(p) + peerView(p, d) + customView(p) + vpanel(p);
      if (/undefined|NaN|\[object Object\]/.test(out)) fail(`${p.id}/${pivot}: stray value in output`);
      rendered++;
    } catch (e) { fail(`${p.id}/${pivot}: ${e.message}`); }
  }
}
ok(`${rendered} render passes across ${P.length} products x 2 pivots`);

/* ------------------------------------------------------------- 3. search */
console.log("\nsearch");
const probes = [
  ["coffee", 1], ["nescafe", 1], ["Nescafé", 1], ["robusta", 1],
  ["solingen", 1], ["forged", 1], ["preservative", 1], ["induction", 1]
];
for (const [q, min] of probes) {
  S.q = q;
  const n = results().length;
  if (n < min) fail(`search "${q}" returned ${n}, expected at least ${min}`);
}
S.q = "";
if (norm("Nescafé") !== "nescafe") fail("norm() is not stripping diacritics");
ok(`${probes.length} probes, accent-insensitive`);

/* ----------------------------------------------------------- 4. verifier */
console.log("\nverifier — adversarial payload");
const bad = {
  klassLabel: "Stovetop espresso maker, 6-cup",
  sources: [{ t: "Bialetti", u: "https://www.bialetti.com/moka-express" }],
  target: {
    brand: "Bialetti", model: "Moka Express 6-cup", year: "current",
    axes: { material: 70, sourcing: 40, construction: 75, assembly: 80, skill: 45, superstructure: 72 },
    comps: [
      { id: "body", n: "Boiler and upper chamber", role: "Critical" },
      { id: "gasket", n: "Gasket", role: "Critical" },
      { id: "handle", n: "Handle", role: "Structural" }
    ],
    materials: [
      { c: "body", n: "Aluminium alloy", share: 80, spec: "EN AB-46000", t: "e", src: 0 },   // valid
      { c: "gasket", n: "Silicone rubber", share: 5, spec: "Food-grade", t: "e", src: 9 },   // bad src
      { c: "handle", n: "Phenolic resin", share: 15, spec: "Bakelite", t: "l" },             // no why
      { c: "ghost", n: "Chromium plating", share: 3, spec: "Decorative", t: "e", src: 0 }    // orphan
    ],
    sourcing: [{ c: "body", m: "Aluminium ingot", o: "Italy", s: "unnamed", t: "e", src: 0 }],
    construction: {
      mode: "Factory", t: "l", why: "published plant", auto: "High", tol: "n/a",
      steps: [{ c: "body", p: "Die-cast" }, { c: "nowhere", p: "Assembled" }]                // orphan
    },
    assembly: { sites: [{ l: "Italy", o: "Casting" }], label: "Made in Italy", count: "Single site", t: "e", src: 0 },
    skill: { tier: "Trained worker", t: "x", basis: "line work",                              // invalid tag
             ops: [["body", "Casting", "Operator"], ["ghost", "Trim", "Operator"]] },         // orphan
    parts: [{ c: "body", n: "Boiler", m: "Cast aluminium", crit: "Critical", t: "e", src: 0, fail: "Pressure vessel." }],
    issues: []
  },
  peers: [
    { brand: "Alessi", model: "Pulcina 6-cup", axes: { material: 78, sourcing: 52, construction: 80, assembly: 78, skill: 55, superstructure: 76 }, why: "Different valve" },
    { brand: "Generic", model: "Import moka pot", axes: { material: 35, sourcing: 10, construction: 40, assembly: 25, skill: 20, superstructure: 30 }, why: "No disclosure" }
  ]
};
const log = verify(bad);
const expect = [
  [/Silicone rubber.*EXACT.*source/i, "EXACT with unresolvable source downgraded"],
  [/Phenolic resin.*LIKELY.*inference/i, "LIKELY with no inference basis downgraded"],
  [/certainty tag/i, "invalid tag treated as UNKNOWN"],
  [/material row.*undeclared/i, "orphan material dropped"],
  [/process row.*undeclared/i, "orphan process dropped"],
  [/skill row.*undeclared/i, "orphan skill op dropped"]
];
for (const [re, label] of expect) {
  if (log.some(l => re.test(l))) ok(label);
  else fail(`verifier missed: ${label}`);
}
const t = bad.target;
if (t.materials.find(m => m.n === "Silicone rubber")?.t !== "u") fail("cascade e->l->u did not complete");
if (t.materials.find(m => m.n === "Silicone rubber")?.spec !== null) fail("UNKNOWN value was not nulled");
if (t.materials.find(m => m.n === "Aluminium alloy")?.t !== "e") fail("valid EXACT was wrongly downgraded");
if (log.filter(l => /Silicone rubber/.test(l)).length !== 1) fail("cascade logged more than one line");
ok("valid EXACT preserved; UNKNOWN values nulled; cascade logs once");

/* ------------------------------------------------------- 5. ingest + age */
console.log("\ningest and freshness");
bad._vlog = log;
const before = P.length;
const built = ingest(bad);
if (P.length !== before + 3) fail(`ingest added ${P.length - before} products, expected 3`);
if (peers(built).length !== 2) fail("generated peers did not attach to the class");
try { fullView(peers(built)[0]); ok("stub peer renders without a component tree"); }
catch (e) { fail(`stub render: ${e.message}`); }
built.gen = "2020-01-01";
if (!stale(built)) fail("stale() failed on a record past the review cycle");
built.gen = new Date().toISOString().slice(0, 10);
if (stale(built)) fail("stale() false positive on a fresh record");
ok("ingest attaches peers; staleness threshold correct");

/* -------------------------------------------------------- 6. method page */
/* The page documents the weights and the delta bands. If it ever states a
   number the code no longer uses, the page is lying — so assert it is
   generated from the same constants rather than transcribed. */
console.log("\nmethod page");
const m = renderMethod();
if (/undefined|NaN|\[object Object\]/.test(m)) fail("method page: stray value in output");
for (const [k, label] of AXES) {
  if (!m.includes(label)) fail(`method page: axis "${label}" not documented`);
  if (!m.includes(DEFAULT_W[k].toFixed(1))) fail(`method page: weight for "${label}" not shown`);
}
if (!m.includes(String(SEV.dq))) fail("method page: disqualifying band does not match SEV.dq");
if (!m.includes(String(SEV.fn))) fail("method page: functional band does not match SEV.fn");
for (const t of ["EXACT", "LIKELY", "UNKNOWN"]) {
  if (!m.includes(t)) fail(`method page: ${t} tag not explained`);
}
if (!/least verified/.test(m)) fail("method page: does not disclose that axis scores are unverified");
ok(`${AXES.length} axes with live weights, delta bands match SEV, limits disclosed`);

/* the request-queue copy must not claim on-demand research anywhere */
const html2 = readFileSync("index.html", "utf8");
if (/Generate a report for|Generate the full report/.test(html2))
  fail("a button still offers to generate a report on demand");
if (/search the web/i.test(html2)) fail("copy still claims Substrate searches the web on demand");
ok("no button or copy promises on-demand research");

/* ----------------------------------------------------------------- done */
console.log("");
if (fails.length) {
  console.error(`FAILED — ${fails.length} problem(s)\n`);
  fails.forEach(f => console.error(`  · ${f}`));
  process.exit(1);
}
console.log(`PASSED — ${P.length} products, ${Object.keys(CLASSES).length} classes, verifier holds\n`);
