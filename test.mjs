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
    "norm, addReq, REQS, renderGen, renderMethod, AXES, DEFAULT_W, SEV, " +
    "gapView, gapFields, classSilence, TABL, " +
    "srcDensity, deriveAxes, DERIVED_AXES, EVW, srcNote, " +
    "compDeltas, compDeltaView, CATTR };"
  )
);

const {
  P, S, CLASSES, certCount, score, deltas, peers, verify, ingest,
  quickView, fullView, peerView, customView, vpanel, results, stale, norm,
  renderMethod, AXES, DEFAULT_W, SEV,
  gapView, gapFields, classSilence, TABL,
  srcDensity, deriveAxes, DERIVED_AXES, EVW, srcNote,
  compDeltas, compDeltaView, CATTR
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
        + fullView(p) + customView(p) + vpanel(p) + gapView(p) + srcNote(p)
        + ["axis", "comp"].map(dp => { S.dpiv = dp; return peerView(p, d); }).join("");
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
/* verify() mutates its argument, so keep an untouched copy for section 10,
   which runs both implementations against the same input. */
const badPristine = structuredClone(bad);
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

/* --------------------------------------------------------- 7. gap report */
console.log("\ngap report");

/* The gap report and the certainty bar read the same fields. If they ever
   disagree, one of them is lying about how much of the report is missing. */
for (const p of P) {
  if (p.stub) continue;
  const u = gapFields(p).filter(x => x.t === "u").length;
  if (u !== certCount(p).u)
    fail(`${p.id}: gap report counts ${u} unknown, certainty bar counts ${certCount(p).u}`);
}
ok("unknown counts agree with the certainty bar on every product");

/* A tab that is not in TABL is unreachable; one in TABL with no branch renders
   the peer view by mistake. Both have shipped before in other tabs. */
if (!TABL.gaps) fail("Gaps is missing from the tab list");
for (const p of P.slice(0, 3)) {
  if (!/does not know|has not been researched/.test(gapView(p)))
    fail(`${p.id}: gaps tab did not render the gap view`);
}
ok(`${Object.keys(TABL).length} tabs, Gaps routes to the gap view`);

/* Systemic silence is the finding the view exists to surface — assert it
   against the corpus rather than trusting the reduction. */
const knife = P.find(p => p.klass === "knife8" && !p.stub);
const inst = P.find(p => p.klass === "instant" && !p.stub);
const skil = P.find(p => p.klass === "skillet" && !p.stub);
if (!classSilence(knife).silent.sourcing) fail("knife class: sourcing silence not detected");
if (!classSilence(inst).silent.skill) fail("instant class: skill silence not detected");
if (classSilence(skil).silent.material) fail("skillet class: material wrongly called silent");
if (!classSilence(knife).comparable) fail("knife class should be comparable");
ok("class-wide silence detected in sourcing (knives) and skill (instant coffee)");

/* A stub peer is not evidence that an industry is silent. Generated classes are
   one real product plus two stubs, so they must report as not comparable. */
const genP = P.find(p => p.klass.startsWith("gen-") && !p.stub);
if (genP) {
  const cs = classSilence(genP);
  if (cs.comparable) fail("a class of one researched product was treated as comparable");
  if (cs.n !== 1) fail(`stubs leaked into the silence set (n=${cs.n})`);
  if (!/no peer disclosure|unclassified/.test(gapView(genP)))
    fail("gap view did not say the gaps are unclassified");
  ok("stubs excluded from silence; single-product class reported as unclassified");
} else fail("no generated product to check stub exclusion against");

/* ------------------------------------------------------ 8. derived axes */
console.log("\nderived axes");

/* The axis on the product must equal what the rows say, or the score is
   running on a number nobody derived. */
for (const p of P) {
  const d = srcDensity(p);
  if (d === null) {
    if (p.srcAdj?.derived) fail(`${p.id}: claims a derived axis with no sourcing rows`);
    continue;
  }
  if (p.axes.sourcing !== d)
    fail(`${p.id}: sourcing axis is ${p.axes.sourcing}, rows compute to ${d}`);
  if (!p.srcAdj?.derived) fail(`${p.id}: derived axis not recorded`);
  if (p.srcAdj.value !== d) fail(`${p.id}: recorded value ${p.srcAdj.value} != ${d}`);
  if (p.srcAdj.diff !== d - p.srcAdj.model) fail(`${p.id}: diff does not reconcile`);
}
ok("every sourcing axis equals its rows, and the adjustment is recorded");

/* Running it twice must not compound: it derives from rows, never from the
   axis it just wrote. */
const dp = P.find(p => p.srcAdj?.derived);
const snap = JSON.stringify(dp.srcAdj);
deriveAxes(dp); deriveAxes(dp);
if (JSON.stringify(dp.srcAdj) !== snap) fail("deriveAxes is not idempotent");
ok("deriveAxes is idempotent — model original survives repeat runs");

/* Half credit for LIKELY is the rule the Method page publishes. */
if (EVW.e !== 1 || EVW.l !== 0.5 || EVW.u !== 0) fail("evidence weights are not 1 / 0.5 / 0");
const allE = { sourcing: [{ t: "e" }, { t: "e" }] };
const allU = { sourcing: [{ t: "u" }, { t: "u" }] };
const half = { sourcing: [{ t: "e" }, { t: "u" }] };
if (srcDensity(allE) !== 100) fail("all-confirmed sourcing did not score 100");
if (srcDensity(allU) !== 0) fail("all-missing sourcing did not score 0");
if (srcDensity(half) !== 50) fail("half-confirmed sourcing did not score 50");
if (srcDensity({ sourcing: [] }) !== null) fail("empty sourcing should be null, not 0");
ok("scale anchored: 100 all confirmed, 50 half, 0 none, null when there are no rows");

/* A stub keeps the pass's axis and must say the axis is unchecked, not
   silently present a judged number as derived. */
const stubP = P.find(p => p.stub);
if (stubP) {
  if (stubP.srcAdj?.derived) fail("a stub reported a derived axis");
  if (!/could not be computed/.test(srcNote(stubP))) fail("stub does not disclose the axis is unchecked");
  ok("stub keeps the judged axis and discloses that it is unchecked");
} else fail("no stub to check");

/* The Method page must document the derivation, not the old all-six claim. */
const m2 = renderMethod();
for (const k of DERIVED_AXES) {
  if (!m2.includes("not judged")) fail(`method page does not mark ${k} as derived`);
}
if (!/0\.5/.test(m2)) fail("method page does not publish the half-credit rule");
if (/The axis scores are the least verified/.test(m2))
  fail("method page still claims all six axes are unverified judgment");
ok("method page documents the derivation and no longer claims all six are judged");

/* --------------------------------------------------- 9. component deltas */
console.log("\ncomponent deltas");

/* The join key is the component id, which is shared within a class. If that
   ever stops being true the view silently compares nothing. */
{
  const byClass = {};
  P.filter(p => !p.stub).forEach(p => (byClass[p.klass] ||= []).push(p));
  let shared = 0;
  for (const ps of Object.values(byClass)) {
    if (ps.length < 2) continue;
    const sets = ps.map(p => new Set(p.comps.map(c => c.id)));
    const common = [...sets[0]].filter(id => sets.every(s => s.has(id)));
    if (!common.length) fail(`class ${ps[0].klass}: no component id shared by every product`);
    shared += common.length;
  }
  ok(`${shared} component ids shared across their whole class`);
}

/* The headline case: same alloy, different forming. Comparing raw strings
   would miss it, because the specs differ on hardness. */
{
  const w = P.find(p => p.brand.startsWith("W") && p.klass === "knife8");
  const cd = compDeltas(w);
  if (!cd) { fail("no component deltas for the knife class"); }
  else {
    const blade = cd.rows.find(r => r.id === "blade");
    if (!blade) fail("blade component not in the delta rows");
    else {
      const mat = blade.attrs.find(a => a.a.k === "material");
      const frm = blade.attrs.find(a => a.a.k === "forming");
      if (mat.state !== "same") fail(`blade material should read same across class, got ${mat.state}`);
      if (!/X50CrMoV15/.test(mat.shared || "")) fail("shared alloy not surfaced on the blade row");
      if (frm.state !== "differs") fail(`blade forming should differ, got ${frm.state}`);
      ok("blade: same alloy across the class, forming differs — the note's case");
    }
  }
}

/* A part a peer declares and this product does not is a comparison, not an
   omission — it must still appear, flagged. */
{
  const v = P.find(p => p.id && p.klass === "knife8" && p.comps.some(c => c.id === "tang"));
  const cd = compDeltas(v);
  const rivets = cd.rows.find(r => r.id === "rivets");
  if (!rivets) fail("a peer-only component was dropped from the matrix");
  else {
    if (rivets.onTarget) fail("rivets wrongly marked as on the Victorinox roster");
    if (!/not on this roster/.test(compDeltaView(v))) fail("absent component not disclosed in the view");
    ok("peer-only components appear and are flagged as absent here");
  }
}

/* Stubs have no component tree and must not produce an empty comparison. */
{
  const stubP = P.find(p => p.stub);
  if (compDeltas(stubP) !== null) fail("a stub produced component deltas");
  const genP = P.find(p => p.klass.startsWith("gen-") && !p.stub);
  if (genP && compDeltas(genP) !== null) fail("a class of stubs produced component deltas");
  if (genP && !/No researched peer/.test(compDeltaView(genP)))
    fail("view does not explain why there are no component deltas");
  ok("stubs excluded; a class without researched peers says so");
}

/* Both pivots must route, and every attribute must be reachable. */
if (CATTR.length !== 4) fail(`expected 4 comparison attributes, found ${CATTR.length}`);
if (CATTR.some(a => a.k === "role")) fail("role is in the header, not a compared row");
{
  S.dpiv = "comp";
  const w = P.find(p => p.klass === "knife8" && !p.stub);
  const out = peerView(w, deltas(w));
  if (!/Component deltas/.test(out)) fail("By component pivot did not route to the component view");
  S.dpiv = "axis";
  if (!/Peer set/.test(peerView(w, deltas(w)))) fail("By axis pivot did not route to the axis matrix");
  ok("both peer pivots route correctly");
}

/* ------------------------------------------- 10. the two duplicated copies */
/* Invariant 1 says verify() in index.html and build-corpus.mjs must stay
   identical, and invariant 8's deriveAxes() is duplicated the same way. A
   comment cannot enforce that — they had already drifted in their log wording
   before this test existed. Run both against the same input and diff. */
console.log("\nindex.html vs build-corpus.mjs");
{
  const build = await import("./build-corpus.mjs");

  /* Every log line verify() can emit needs a payload that reaches it. The
     adversarial payload alone does not: after its orphan is pruned the shares
     sum to 100, and it keeps one valid EXACT — so the mass-share and
     nothing-confirmed branches never fire, and a drift in those two strings
     slipped through a comparison that only ran that payload. */
  const sources = [{ t: "Src", u: "https://example.com/spec" }];
  const mk = over => ({
    klassLabel: "Test class",
    sources,
    target: {
      brand: "B", model: "M", year: "current",
      axes: { material: 1, sourcing: 1, construction: 1, assembly: 1, skill: 1, superstructure: 1 },
      comps: [{ id: "c", n: "Comp", role: "Critical" }],
      materials: [{ c: "c", n: "Mat", share: 50, spec: "S", t: "e", src: 0 }],
      sourcing: [{ c: "c", m: "Src", o: "O", s: "s", t: "e", src: 0 }],
      construction: { mode: "Factory", t: "e", auto: "a", tol: "t", src: 0, steps: [{ c: "c", p: "p" }] },
      assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Single site", t: "e", src: 0 },
      skill: { tier: "T", t: "e", basis: "b", src: 0, ops: [["c", "op", "sk"]] },
      parts: [{ c: "c", n: "P", m: "m", crit: "Critical", t: "e", src: 0, fail: "f" }],
      issues: [],
      ...over,
    },
  });

  const cases = [
    ["adversarial payload", badPristine],
    ["clean payload", mk({})],
    ["material shares over 105%", mk({
      materials: [
        { c: "c", n: "A", share: 80, spec: "S", t: "e", src: 0 },
        { c: "c", n: "B", share: 40, spec: "S", t: "e", src: 0 },
      ],
    })],
    ["nothing source-confirmed", mk({
      materials: [{ c: "c", n: "Mat", share: 50, spec: "S", t: "u" }],
      sourcing: [{ c: "c", m: "Src", o: "O", s: "s", t: "u" }],
      construction: { mode: "Factory", t: "u", auto: "a", tol: "t", steps: [{ c: "c", p: "p" }] },
      assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Unknown", t: "u" },
      skill: { tier: "T", t: "u", basis: "b", ops: [["c", "op", "sk"]] },
      parts: [{ c: "c", n: "P", m: "m", crit: "Critical", t: "u", fail: "f" }],
    })],
  ];

  let lines = 0, seen = new Set();
  for (const [label, payload] of cases) {
    const a = structuredClone(payload);
    const b = structuredClone(payload);
    const logA = verify(a);
    const logB = build.verify(b);
    logA.forEach(l => seen.add(l));
    lines += logA.length;

    if (JSON.stringify(logA) !== JSON.stringify(logB)) {
      fail(`verify() log drifted between the two copies on the ${label}`);
      for (let i = 0; i < Math.max(logA.length, logB.length); i++) {
        if (logA[i] !== logB[i]) {
          fail(`  index.html   ${JSON.stringify(logA[i])}`);
          fail(`  build-corpus ${JSON.stringify(logB[i])}`);
        }
      }
    }
    /* The log is what the reader sees, but the corrections matter more — a
       verifier that logs the same line while nulling a different field is
       still divergent. */
    if (JSON.stringify(a) !== JSON.stringify(b))
      fail(`verify() left the ${label} in different states between the two copies`);
  }

  /* Guard the coverage itself, so a future payload change can't quietly stop
     exercising a branch and make this comparison hollow again. */
  const branches = [/mass figures/, /source-confirmed/, /undeclared component/, /certainty tag/, /without a working source/, /without an inference basis/];
  for (const re of branches) {
    if (![...seen].some(l => re.test(l)))
      fail(`no test payload reaches the verify() branch matching ${re}`);
  }
  ok(`verify() agrees across ${cases.length} payloads, ${lines} log lines, all ${branches.length} branches`);

  /* Same check for the derived axis. */
  if (build.EVW.e !== EVW.e || build.EVW.l !== EVW.l || build.EVW.u !== EVW.u)
    fail("evidence weights differ between index.html and build-corpus.mjs");
  for (const rows of [
    [{ t: "e" }, { t: "e" }], [{ t: "e" }, { t: "u" }], [{ t: "l" }, { t: "u" }, { t: "e" }], [],
  ]) {
    const p1 = { sourcing: rows, axes: { sourcing: 58 } };
    const p2 = structuredClone(p1);
    deriveAxes(p1); build.deriveAxes(p2);
    if (JSON.stringify(p1) !== JSON.stringify(p2))
      fail(`deriveAxes() diverged on ${rows.length} row(s): ${JSON.stringify(p1)} vs ${JSON.stringify(p2)}`);
  }
  ok("deriveAxes() and the evidence weights agree across both copies");

  /* Importing the build script must not run it — a top-level process.exit on a
     missing API key would take this suite down with it. */
  if (typeof build.verify !== "function") fail("build-corpus.mjs did not export verify");
  ok("build-corpus.mjs is importable without executing its main flow");

  /* The request shape cannot be exercised without an API key and a live call,
     so assert the parts that silently degrade rather than error. */
  const src = readFileSync("build-corpus.mjs", "utf8");

  if (build.MODEL !== "claude-sonnet-5") fail(`unexpected model: ${build.MODEL}`);
  /* max_tokens bounds thinking and text together on this model, and the call is
     not streamed — too low truncates the JSON, too high risks an HTTP timeout. */
  if (build.MAX_TOKENS < 16000) fail(`max_tokens ${build.MAX_TOKENS} risks truncating the report`);
  if (build.MAX_TOKENS > 16000) fail(`max_tokens ${build.MAX_TOKENS} needs streaming to avoid an HTTP timeout`);

  if (!src.includes("web_search_20260209")) fail("web search is not on the dynamic-filtering version");
  if (src.includes("web_search_20250305")) fail("the superseded web search version is still declared");
  /* Dynamic filtering runs code execution internally; declaring the tool as
     well gives the model a second execution environment and confuses it. */
  if (/type:\s*"code_execution/.test(src)) fail("code_execution declared alongside the filtering web search");
  /* Thinking is on by default on this model but was off on the previous one —
     state it, so the script does not silently change behaviour with the model. */
  if (!/thinking:\s*\{\s*type:\s*"adaptive"/.test(src)) fail("adaptive thinking is not stated explicitly");
  /* Both are rejected outright on this model. */
  if (/\b(temperature|top_p|top_k)\s*:/.test(src)) fail("a sampling parameter would be rejected by this model");
  if (/budget_tokens/.test(src)) fail("budget_tokens is removed on this model");

  if (!/stop_reason\s*===\s*"refusal"/.test(src)) fail("refusal stop reason is unhandled");
  if (!/stop_reason\s*!==\s*"pause_turn"/.test(src)) fail("pause_turn is unhandled — server tools can stall mid-report");
  ok(`request shape: ${build.MODEL}, ${build.MAX_TOKENS} tokens, filtering web search, stalls and refusals handled`);

  /* Drive callModel against a stubbed transport. The continuation loop and the
     stop-reason guards are the parts most likely to be wrong and the parts a
     dry run never reaches — without this they would first execute against a
     paid API call. */
  const realFetch = globalThis.fetch;
  const reply = body => ({ ok: true, json: async () => body });
  const payload = '{"klassLabel":"K","target":{},"peers":[],"sources":[]}';
  const searchOK = { type: "web_search_tool_result", content: [{ title: "t" }] };
  const searchBad = { type: "web_search_tool_result", content: { error_code: "max_uses_exceeded" } };
  let sent = [];

  const run = async responses => {
    sent = [];
    let i = 0;
    globalThis.fetch = async (_url, opts) => {
      sent.push(JSON.parse(opts.body));
      return reply(responses[Math.min(i++, responses.length - 1)]);
    };
    try { return await build.callModel("thing"); }
    finally { globalThis.fetch = realFetch; }
  };

  try {
    // a plain successful turn
    let out = await run([{ stop_reason: "end_turn", content: [searchOK, { type: "text", text: payload }] }]);
    if (out.klassLabel !== "K") fail("callModel did not parse the report");
    if (out._searches !== 1 || out._searchErrors !== 0) fail("search counting wrong on a clean turn");
    if (sent.length !== 1) fail(`expected 1 request, made ${sent.length}`);

    // a failed search is not research — it must not inflate the count
    out = await run([{ stop_reason: "end_turn", content: [searchOK, searchBad, { type: "text", text: payload }] }]);
    if (out._searches !== 1 || out._searchErrors !== 1) fail("a failed web search was counted as a result set");

    /* Stalled server-tool loop: continue, and stitch the text across turns.
       A regression here throws while parsing the paused turn's partial JSON, so
       catch it — an uncaught throw aborts the suite and hides everything below. */
    try {
      out = await run([
        { stop_reason: "pause_turn", content: [searchOK, { type: "text", text: '{"klassLabel":"K",' }] },
        { stop_reason: "end_turn", content: [{ type: "text", text: '"target":{},"peers":[],"sources":[]}' }] },
      ]);
      if (sent.length !== 2) fail(`pause_turn did not continue (${sent.length} request(s))`);
      if (sent[1].messages.length !== 2 || sent[1].messages[1].role !== "assistant")
        fail("continuation did not resend the paused assistant turn");
      if (out.klassLabel !== "K") fail("text was not stitched across the continuation");
      if (out._searches !== 1) fail("searches from the paused turn were lost");
    } catch (e) {
      fail(`pause_turn not continued — the stalled turn's partial JSON was treated as final (${e.message})`);
    }

    // a loop that never settles must stop, not spin
    let threw = "";
    try {
      await run([{ stop_reason: "pause_turn", content: [{ type: "text", text: "" }] }]);
    } catch (e) { threw = e.message; }
    if (!/still paused/.test(threw)) fail(`endless pause_turn not bounded: ${threw}`);

    // the two stops that would otherwise read as "no JSON object in response"
    for (const [stop, extra, re] of [
      ["max_tokens", {}, /truncated/],
      ["refusal", { stop_details: { category: "cyber" } }, /declined by safety/],
    ]) {
      threw = "";
      try {
        await run([{ stop_reason: stop, content: [{ type: "text", text: "partial" }], ...extra }]);
      } catch (e) { threw = e.message; }
      if (!re.test(threw)) fail(`${stop} did not report clearly: ${threw}`);
    }
    ok("callModel: continues on stall, bounds it, counts real searches, reports refusal and truncation");
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ----------------------------------------------------------------- done */
console.log("");
if (fails.length) {
  console.error(`FAILED — ${fails.length} problem(s)\n`);
  fails.forEach(f => console.error(`  · ${f}`));
  process.exit(1);
}
console.log(`PASSED — ${P.length} products, ${Object.keys(CLASSES).length} classes, verifier holds\n`);
