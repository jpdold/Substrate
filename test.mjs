#!/usr/bin/env node
/* ==========================================================================
   test.mjs — regression suite for Substrate
   --------------------------------------------------------------------------
   Boots the page the way a browser does, then exercises the data layer and
   every renderer across every product in both pivots.

       node test.mjs

   No dependencies. Exits non-zero on failure so CI can gate on it.
   ========================================================================== */

import { readFileSync } from "node:fs";

const fails = [];
const fail = m => fails.push(m);
const ok = m => console.log(`  ok   ${m}`);

const html = readFileSync("index.html", "utf8");
const block = html.split("<script>")[1]?.split("</script>")[0];
if (!block) { console.error("could not find the script block in index.html"); process.exit(1); }

/* The DOM-bound tail is excluded HERE and only here, so the pure functions can
   be imported as a module. Section 0 runs the whole thing separately — that
   split is what let a dead page pass fifty-two checks once. */
const src = block.split("/* ============================ RENDER ============================ */")[0];

const stub = `
globalThis.render = () => {};
globalThis.document = { getElementById: () => null, createElement: () => ({ click(){} }) };
globalThis.window = { scrollTo(){} };
globalThis.fetch = async () => { throw new Error("network disabled in tests"); };
`;

const mod = await import(
  "data:text/javascript," + encodeURIComponent(
    stub + src + "\nexport { P, S, CATS, catPath, catCrumb, catLabel, catMatch, catSubtree, catLeaves, " +
    "resultGroups, emptyMatches, peers, verify, verifyAll, ingest, scoreOf, idNorm, idsOf, " +
    "quickView, fullView, vpanel, matches, results, stale, ageDays, " +
    "norm, addReq, REQS, renderGen, renderMethod, TABL, " +
    "exportPayload, exportRows, loadCorpus, META, " +
    "ITEM_TYPES, IDENTIFIERS, identList, COUNTRIES, titleCase, DRAFTS, renderAdd, blankForm, saveDraft };"
  )
);

const {
  P, S, CATS, catPath, catCrumb, catMatch, catSubtree, catLeaves,
  resultGroups, emptyMatches, verify, verifyAll, ingest, scoreOf, idNorm, idsOf,
  quickView, fullView, vpanel, results, stale, norm,
  renderMethod, TABL, exportPayload, exportRows, loadCorpus, META,
  ITEM_TYPES, IDENTIFIERS, identList, COUNTRIES, titleCase, DRAFTS, renderAdd, blankForm, saveDraft
} = mod;

const TABS = p => [["quick", () => quickView(p)], ["full", () => fullView(p)]];
const strays = out => (out.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,60}/s) || [])[0];

/* ------------------------------------------------- 0. the page actually boots */
/* The suite used to load the script block MINUS its DOM-bound tail, so
   render(), renderRail() and every inline onclick= the page relies on were
   never executed by anything. Fifty-two checks passed green while the
   deployed page was dead on arrival.

   So this runs the WHOLE block, in a vm context rather than an ES module,
   because a classic <script> puts its function declarations on the global
   object and an import does not — and the inline handlers in the static HTML
   can only find them there. It runs first: a page that does not boot makes
   every other assertion here meaningless. */
console.log("\nboot");
{
  const vm = await import("node:vm");
  const whole = html.split("<script>")[1].split("</script>")[0];

  const els = {};
  const mk = id => (els[id] ||= { id, innerHTML:"", value:"", style:{},
    classList:{add(){},remove(){},toggle(){}}, focus(){}, setSelectionRange(){},
    addEventListener(){}, querySelectorAll:()=>[] });

  const box = {
    console: { log(){}, warn(){}, error(){} },
    document: { getElementById: mk, createElement: () => ({click(){},style:{},setAttribute(){}}),
                addEventListener(){}, querySelectorAll:()=>[], body:{appendChild(){}} },
    window: { scrollTo(){}, addEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}) },
    fetch: async () => { throw new Error("offline in tests"); },
    URL: { createObjectURL:()=>"blob:", revokeObjectURL(){} },
    Blob: class {}, setTimeout, clearTimeout, Date, Math, JSON, Set, Map, Intl,
  };
  box.globalThis = box;
  vm.createContext(box);

  let booted = true;
  try { vm.runInContext(whole, box, { filename: "index.html<script>" }); }
  catch (e) { booted = false; fail(`the page throws on load: ${e.message}`); }

  if (booted) {
    const out = id => els[id]?.innerHTML || "";
    if (!out("main").length) fail("#main is empty after load — the page renders nothing");
    if (!out("rail").length) fail("#rail is empty after load — the facets render nothing");

    /* Every function an inline handler names has to exist. Guessing at the
       list is how "toggleFacet" got tested instead of "toggle"; this reads
       the attributes off the real markup instead. */
    const RESERVED = new Set(["return","if","typeof","new","function","void","delete","this"]);
    const handlers = new Set();
    const scan = s => {
      for (const m of s.matchAll(/\bon(?:click|change|input|submit|keydown)\s*=\s*"([^"]*)"/g))
        for (const c of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))
          if (!RESERVED.has(c[1])) handlers.add(c[1]);
    };
    scan(html.split("<script>")[0]);
    ["main","rail"].forEach(id => scan(out(id)));
    box.open_(P[0].id); scan(out("main"));
    for (const t of Object.keys(TABL)) { box.setTab(t); scan(out("main")); }
    box.goHome(); box.openMethod(); scan(out("main"));
    box.openGen(""); scan(out("main"));

    const missing = [...handlers].filter(f => typeof box[f] !== "function");
    if (missing.length) fail(`inline handler(s) not defined: ${missing.join(", ")}`);

    box.goHome();
    box.setQ("kitchen knife");
    if (!/Victorinox/.test(out("main"))) fail('setQ("kitchen knife") rendered no knives');
    box.setQ("camping knife");
    if (!/Nothing filed here yet/.test(out("main"))) fail('setQ("camping knife") did not report the empty category');
    box.setQ("");

    box.open_("wusthof");
    if (!/Materials/.test(out("main"))) fail('open_("wusthof") rendered no report');
    for (const t of Object.keys(TABL)) {
      box.setTab(t);
      if (!out("main").length) fail(`tab "${t}" rendered nothing`);
      if (strays(out("main"))) fail(`tab "${t}" printed a stray value`);
    }

    box.openMethod();
    if (!/What a report records/.test(out("main"))) fail("openMethod() rendered no method page");

    ok(`boots clean, ${handlers.size} inline handlers all defined, every view drives`);
  }

  /* The hero, the legend and the footer are static HTML outside the <script>
     block, so every renderer edit goes straight past them. They described the
     certainty tiers on the live site for four commits before anyone noticed. */
  for (const dead of ["EXACT", "LIKELY", "UNKNOWN", "ertainty",
                      "Peer deltas", "Not cited", "Citation coverage", "cited"]) {
    if (html.includes(dead)) fail(`the page still says "${dead}" — probably in the static shell or a stale label`);
  }
  ok("no copy anywhere still describes the tiers, comparison, or citations");
}

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
    check(p.construction?.steps, x => x.c, "process");
    check(p.skill?.ops, x => x[0], "skill");
    check(p.parts, x => x.c, "component");
  }
  if (!CATS[p.klass]) fail(`${p.id}: klass "${p.klass}" is not a category`);
}
if (!fails.length) ok(`${P.length} products, no orphan rows, every one filed under a real category`);

/* With the citation gate gone, the data itself is what reaches the page. A
   product that renders nothing is a data problem now rather than a policy
   one, and that is the thing most worth catching while the corpus is grown
   by hand. */
{
  const bare = P.filter(p => !p.stub && !(p.materials || []).length
    && !p.construction && !p.assembly && !(p.parts || []).length);
  if (bare.length) fail(`${bare.length} product(s) carry no data at all: ${bare.map(p => p.id).join(", ")}`);
  const counts = P.filter(p => !p.stub).map(p => (p.materials || []).length);
  ok(`every product carries data — ${Math.min(...counts)} to ${Math.max(...counts)} materials each`);
}

/* ------------------------------------------------------------ 2. renders */
console.log("\nrenderers");
let rendered = 0;
for (const p of P) {
  for (const pivot of ["attr", "comp"]) {
    S.pivot = pivot;
    S.cur = p.id;
    try {
      const out = TABS(p).map(([, f]) => f()).join("") + vpanel(p);
      const hit = strays(out);
      if (hit) fail(`${p.id}/${pivot}: stray value in output — …${hit.replace(/\s+/g, " ")}…`);
      rendered++;
    } catch (e) { fail(`${p.id}/${pivot}: ${e.message}`); }
  }
}
ok(`${rendered} render passes across ${P.length} products x ${Object.keys(TABL).length} tabs x 2 pivots`);

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

/* ------------------------------------------------------- 3b. categories */
/* "kitchen knife" must return kitchen knives and not camping knives.
   Substring search cannot do it — every one of them contains "knife" — so
   these are the assertions that keep the resolution working. */
console.log("\ncategories");
{
  for (const [id, c] of Object.entries(CATS)) {
    if (c.p && !CATS[c.p]) fail(`category "${id}" points at a parent that does not exist: "${c.p}"`);
    if (!c.n) fail(`category "${id}" has no name`);
    const path = catPath(id);
    if (path[path.length - 1] !== id) fail(`catPath("${id}") does not end at itself — cycle or broken chain`);
    if (path.length > 6) fail(`category "${id}" is ${path.length} deep — probably a cycle`);
  }
  ok(`${Object.keys(CATS).length} categories, ${catLeaves().length} leaves, every parent resolves`);

  const hit = q => catMatch(q).flatMap(catSubtree);
  if (!hit("kitchen knife").includes("knife8")) fail('"kitchen knife" does not reach the chef knife category');
  if (!hit("camping knife").includes("fixed")) fail('"camping knife" does not reach the fixed-blade category');
  if (!hit("cookware").includes("skillet")) fail("a parent-only term did not reach its leaf");
  if (hit("kitchen").includes("instant")) fail('"kitchen" reached a food category');
  if (catMatch("wusthof").length) fail('"wusthof" was treated as a category');
  ok("the tree still resolves a query to the categories it names");

  S.q = "wusthof";
  if (!results().some(p => /W/.test(p.brand))) fail("brand search stopped working");
  S.q = "solingen";
  if (!results().length) fail("a term that lives only in a report's body stopped resolving");
  S.q = "";
  ok("brand and body-text queries still resolve");

  S.q = "camping knife";
  if (!emptyMatches().includes("fixed")) fail('"camping knife" did not report its empty category');
  S.q = "kitchen knife";
  if (emptyMatches().includes("knife8")) fail("a populated category was reported as empty");
  S.q = "";
  ok("a named-but-empty category is still reported alongside whatever matched");

  S.q = "knife";
  const g = resultGroups();
  if (!g.length) fail('"knife" returned no groups');
  if (g.some(x => !x.crumb || !x.items.length)) fail("a result group is missing its breadcrumb or its items");
  if (new Set(g.map(x => x.k)).size !== g.length) fail("a category appeared in two groups");
  S.q = "";
  ok("results group under their category with a breadcrumb");
}


/* ------------------------------------------------------- 3c. relevance */
/* The tree used to GATE: naming a category returned that subtree and nothing
   else, so "kitchen knife" could not reach a camping knife however useful
   that might be. It ranks now. These assertions are the inverse of the ones
   they replaced, and the direction is the whole point — inclusive but
   correctly ordered, not inclusive and arbitrary. */
console.log("\nrelevance");
{
  /* two outdoor knives, so a kitchen query has something to out-rank rather
     than merely exclude */
  const extra = [
    { id:"t-mora", brand:"Morakniv", model:"Companion Heavy Duty", klass:"fixed", year:"current",
      comps:[{id:"blade",n:"Blade",role:"Critical"}],
      materials:[{c:"blade",n:"Carbon steel",spec:"3.2mm"}], sourcing:[], parts:[],
      construction:{mode:"Factory",steps:[{c:"blade",p:"Stamped and ground"}]},
      assembly:{sites:[{l:"Mora, Sweden"}],label:"Made in Sweden",count:"Single site"},
      skill:null, issues:[],
      ids:[{scheme:"EAN",value:"7391846013150"},{scheme:"SKU",value:"M-12494"}] },
    { id:"t-opinel", brand:"Opinel", model:"No.8 Carbon", klass:"pocket", year:"current",
      comps:[{id:"blade",n:"Blade",role:"Critical"}],
      materials:[{c:"blade",n:"Carbon steel",spec:"XC90"}], sourcing:[], parts:[],
      construction:{mode:"Factory",steps:[{c:"blade",p:"Stamped"}]},
      assembly:{sites:[{l:"Chambery, France"}],label:"Made in France",count:"Single site"},
      skill:null, issues:[], ids:[{scheme:"UPC",value:"3123840002083"}] },
  ];
  P.push(...extra);
  const rank = q => { S.q = q; const r = results(); S.q = ""; return r.map(p => p.id); };
  const sc = (id, q) => scoreOf(P.find(p => p.id === id), q);

  /* inclusive: the outdoor knives are returned, not filtered away */
  {
    const r = rank("kitchen knife");
    if (!r.includes("t-mora") || !r.includes("t-opinel"))
      fail('"kitchen knife" still excludes outdoor knives — the gate is back');
    if (P.find(p => p.id === r[0]).klass !== "knife8")
      fail('"kitchen knife" did not lead with a kitchen knife: ' + r[0]);
    if (sc("wusthof", "kitchen knife") <= sc("t-mora", "kitchen knife"))
      fail('a camping knife scored at or above a chef knife on "kitchen knife"');
    ok('"kitchen knife" returns outdoor knives too, and still leads with kitchen ones');
  }

  /* the reverse, which caught a real bug: "camping" is in no breadcrumb,
     only on the category's synonyms */
  {
    if (sc("t-mora", "camping knife") <= sc("wusthof", "camping knife"))
      fail('"camping knife" ranked a chef knife at or above a camping knife');
    if (!sc("t-mora", "bushcraft")) fail("a category synonym does not reach its products");
    ok('"camping knife" leads with the camping knife, via the category synonyms');
  }

  /* a term must start a word: "pan" once matched "Com-pan-ion" */
  {
    if (sc("t-mora", "frying pan")) fail('"frying pan" matched "Companion" mid-word');
    if (!sc("lodge", "frying pan")) fail('"frying pan" no longer reaches a skillet');
    if (!sc("wusthof", "knif")) fail("a prefix a reader types no longer reaches the word");
    ok("terms match the start of a word — prefixes reach, interiors do not");
  }

  /* A query of only one-character terms cannot discriminate, so it must not
     pretend to: everything scores the same rather than something being
     falsely promoted. This is what incremental typing looks like at the
     first keystroke. */
  {
    const all = P.filter(p => !p.stub).map(p => sc(p.id, "a"));
    if (new Set(all).size !== 1) fail("a one-character term ranked some products above others");
    ok("a one-character query does not discriminate");
  }

  /* identifiers are an identity claim, and win outright */
  {
    if (idNorm("7391 8460-13150") !== "7391846013150") fail("idNorm does not strip spacing and hyphens");
    const probes = [["7391846013150","t-mora"], ["7391 8460 13150","t-mora"],
                    ["m-12494","t-mora"], ["3123840002083","t-opinel"]];
    for (const [q, id] of probes) {
      const r = rank(q);
      if (r[0] !== id) fail('identifier "' + q + '" returned ' + (r[0] || "nothing") + ', expected ' + id);
      if (r.length !== 1) fail('identifier "' + q + '" returned ' + r.length + ' products — it should be exact');
    }
    if (sc("t-mora", "7391846013150") !== 1000) fail("an exact identifier did not win outright");
    if (rank("0000000000000").length) fail("an identifier nobody carries returned something");
    if (idsOf({ ids:[{scheme:"UPC",value:""}] }).length) fail("idsOf kept an identifier with no value");
    ok("identifiers match exactly, ignore spacing, and return only their own product");
  }

  P.length = P.length - extra.length;
  S.q = "";
}
/* ----------------------------------------------------------- 4. verifier */
/* Two checks left, and neither was ever about evidence: a row must name a
   component that exists, and mass shares must not exceed the object. Both
   are about whether a report can be READ. */
console.log("\nverifier");
const bad = {
  klassLabel: "Stovetop espresso maker",
  target: {
    brand: "Bialetti", model: "Moka Express 6-cup", year: "current",
    comps: [{ id: "body", n: "Body", role: "Structural" },
            { id: "handle", n: "Handle", role: "Structural" }],
    materials: [
      { c: "body", n: "Aluminium alloy", share: 80, spec: "EN AB-46000" },
      { c: "handle", n: "Phenolic resin", share: 15, spec: "Bakelite" },
      { c: "ghost", n: "Chromium plating", share: 3, spec: "Decorative" },   // orphan
    ],
    sourcing: [{ c: "body", m: "Aluminium ingot", o: "Italy", s: "unnamed" }],
    construction: { mode: "Factory", auto: "High", tol: "n/a",
      steps: [{ c: "body", p: "Die-cast" }, { c: "ghost", p: "Electroplated" }] },
    assembly: { sites: [{ l: "Italy", o: "Casting" }], label: "Made in Italy", count: "Single site" },
    skill: { tier: "Trained worker", basis: "line work",
             ops: [["body", "Casting", "Machine operator"], ["ghost", "Plating", "Operator"]] },
    parts: [{ c: "body", n: "Boiler", m: "Cast aluminium", crit: "Critical", fail: "Pressure vessel." }],
    issues: [],
  }
};
const badPristine = structuredClone(bad);
const log = verify(bad);
for (const [re, label] of [
  [/material row.*undeclared/i, "orphan material dropped"],
  [/process row.*undeclared/i, "orphan process dropped"],
  [/skill row.*undeclared/i, "orphan skill op dropped"],
]) {
  if (log.some(l => re.test(l))) ok(label);
  else fail(`verifier missed: ${label}`);
}
{
  const t = bad.target;
  if (t.materials.some(m => m.n === "Chromium plating")) fail("the orphan row survived the prune");
  if (t.materials.length !== 2) fail(`expected 2 materials after the prune, got ${t.materials.length}`);
  if (!t.construction) fail("the verifier nulled a section it has no business touching");
  if (!t.skill?.tier) fail("the verifier discarded a value it should have left alone");

  const twice = structuredClone(badPristine);
  verify(twice); const snap = JSON.stringify(twice);
  verify(twice);
  if (JSON.stringify(twice) !== snap) fail("verify() is not idempotent");
  ok("orphans dropped, everything else left exactly as recorded, and idempotent");

  const over = structuredClone(badPristine);
  over.target.materials = [
    { c: "body", n: "A", share: 80, spec: "S" },
    { c: "body", n: "B", share: 40, spec: "S" },
  ];
  if (!verify(over).some(x => /approximate/i.test(x))) fail("material shares over 105% were not flagged");
  ok("material shares over 105% are flagged");
}

/* ------------------------------------------------------- 5. ingest + age */
console.log("\ningest and freshness");
{
  const before = P.length;
  const built = ingest(bad);
  if (P.length !== before + 1) fail(`ingest added ${P.length - before} products, expected 1`);
  built.gen = "2020-01-01";
  if (!stale(built)) fail("stale() failed on a record past the review cycle");
  built.gen = new Date().toISOString().slice(0, 10);
  if (stale(built)) fail("stale() false positive on a fresh record");
  try { quickView(built); fullView(built); }
  catch (e) { fail(`a freshly ingested product does not render: ${e.message}`); }
  ok("ingest adds one product, it renders, and the staleness threshold is correct");
}

/* -------------------------------------------------------- 6. method page */
console.log("\nmethod page");
{
  const m = renderMethod();
  if (strays(m)) fail(`method page: stray value — …${strays(m).replace(/\s+/g, " ")}…`);
  if (!/What a report records/.test(m)) fail("method page does not say what a report records");
  if (!/Absence is not a finding/.test(m)) fail("method page does not explain the empty state");
  if (!/Sources are not published/.test(m)) fail("method page does not disclose that sources are missing");
  for (const dead of ["Peer deltas", "composite", "weighting", "Build custom"]) {
    if (m.includes(dead)) fail(`method page still presents "${dead}" as live`);
  }
  /* the category table is read out of the running tree, not transcribed */
  for (const k of catLeaves()) if (!m.includes(catCrumb(k))) fail(`method page omits the category "${k}"`);
  ok("states what is recorded and what is missing, and lists every category from the live tree");
}
if (/Generate a report for|Generate the full report/.test(html))
  fail("a button still offers to generate a report on demand");
if (/search the web/i.test(html)) fail("copy still claims Substrate searches the web on demand");
ok("no button or copy promises on-demand research");

/* --------------------------------------------------------- 7. empty state */
/* The one misreading this build has to avoid: a field with nothing in it is
   a fact about the catalogue, not about the product. */
console.log("\nempty state");
{
  const empty = {
    id: "empty", brand: "Empty", model: "Nothing Recorded", klass: "knife8", year: "unspecified",
    comps: [], materials: [], sourcing: [], parts: [],
    construction: null, assembly: null, skill: null, issues: [],
  };
  const q = quickView(empty);
  if ((q.split("No Data For Now").length - 1) < 4)
    fail("a product with nothing recorded did not say No Data For Now on every field");
  if (strays(q)) fail("the empty product printed a stray value");
  if (!/not a statement about the product/.test(q))
    fail("the report does not disclaim what an absent field means");
  try { fullView(empty); } catch (e) { fail(`fullView on an empty product: ${e.message}`); }
  ok("an empty product renders, says No Data For Now, and carries the disclaimer");
}

/* ------------------------------------------------------------ 8. exports */
console.log("\nexport");
{
  const pay = exportPayload(P.slice(0, 3));
  const j = JSON.stringify(pay);
  for (const dead of ['"axes"', '"certainty"', '"score"', '"coverage"', '"cited"', '"uncited"', '"sources"']) {
    if (j.includes(dead)) fail(`export still carries ${dead}`);
  }
  for (const x of pay.products) {
    const p = P.find(y => y.id === x.id);
    if (!Array.isArray(x.category) || !x.category.length) fail(`${x.id}: export omitted the category path`);
    if (x.materials.length !== (p.materials || []).length) fail(`${x.id}: export lost material rows`);
    if (x.reviewed !== false) fail(`${x.id}: export did not carry review state`);
  }
  if (!/not recorded/.test(pay.note)) fail("export does not explain what an absent field means");
  ok(`${pay.products.length} products export with their full component roster and no citation fields`);
}

/* ------------------------------------------- 9. the two duplicated copies */
console.log("\nindex.html vs build-corpus.mjs");
{
  const build = await import("./build-corpus.mjs");
  const bcSrc = readFileSync("build-corpus.mjs", "utf8");
  const slice = (s, a, z) => {
    const i = s.indexOf(a), j = s.indexOf(z, i);
    return i < 0 || j < 0 ? null : s.slice(i, j).replace(/\s+$/, "");
  };
  const A = slice(html, "function verify(o){", "function slug(x)");
  const B = slice(bcSrc, "function verify(o){", "/* ------------");
  if (!A || !B) fail("could not locate verify() in one of the two files");
  else if (A !== B) fail("verify() has drifted between index.html and build-corpus.mjs");
  else ok(`verify() is character-identical in both files (${A.length} chars)`);

  const mk = over => ({ klassLabel: "Test class", target: {
    brand: "B", model: "M", year: "current",
    comps: [{ id: "c", n: "Comp", role: "Critical" }],
    materials: [{ c: "c", n: "Mat", share: 50, spec: "S" }],
    sourcing: [{ c: "c", m: "Src", o: "O", s: "s" }],
    construction: { mode: "Factory", auto: "a", tol: "t", steps: [{ c: "c", p: "p" }] },
    assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Single site" },
    skill: { tier: "T", basis: "b", ops: [["c", "op", "sk"]] },
    parts: [{ c: "c", n: "P", m: "m", crit: "Critical", fail: "f" }],
    issues: [], ...over } });

  const cases = [
    ["orphan payload", badPristine],
    ["clean payload", mk({})],
    ["shares over 105%", mk({ materials: [
      { c: "c", n: "A", share: 80, spec: "S" }, { c: "c", n: "B", share: 40, spec: "S" }] })],
  ];
  let lines = 0;
  for (const [label, payload] of cases) {
    const a = structuredClone(payload), b = structuredClone(payload);
    const logA = verify(a), logB = build.verify(b);
    if (JSON.stringify(logA) !== JSON.stringify(logB))
      fail(`${label}: the two verifiers logged differently`);
    if (JSON.stringify(a) !== JSON.stringify(b))
      fail(`${label}: the two verifiers left the payload in different states`);
    lines += logA.length;
  }
  ok(`${cases.length} payloads, ${lines} log lines — both copies agree`);

  /* the generation schema must not reintroduce what the site just dropped */
  for (const dead of ['"src":0', '"sources"', "EXACT", "LIKELY", "UNKNOWN", '"axes"']) {
    if (bcSrc.includes(dead)) fail(`build-corpus.mjs still asks the model for ${dead}`);
  }
  if (!/No Data For Now/.test(bcSrc)) fail("build-corpus.mjs does not tell the model what an omitted field means");
  ok("the generation schema asks for data only — no citations, no peers, no scores");
}

/* ------------------------------------------- 10. scheduled rebuild wiring */
console.log("\nscheduled rebuild");
{
  const build = await import("./build-corpus.mjs");
  const old = { id: "a", brand: "Old", model: "Thing", gen: "2020-01-01" };
  const fresh = { id: "b", brand: "New", model: "Thing", gen: new Date().toISOString().slice(0, 10) };
  const corpus = { products: [old, fresh] };

  let w = build.workList([], corpus, { stale: false });
  if (w.take.length) fail("an empty queue produced work without --stale");
  w = build.workList([], corpus, { stale: true });
  if (!w.take.some(x => /Old Thing/.test(x.q))) fail("--stale did not pick up a report past the cycle");
  if (w.take.some(x => /New Thing/.test(x.q))) fail("--stale rebuilt a report still inside the cycle");
  w = build.workList([{ q: "Old Thing" }], corpus, { stale: true });
  if (w.take.filter(x => /old.*thing/i.test(x.q)).length !== 1)
    fail("a queued product that is also stale was scheduled twice");
  w = build.workList([{ q: "Old Thing", id: "a", klass: "knife8" }], corpus, {});
  if (w.take[0].id !== "a" || w.take[0].klass !== "knife8")
    fail("a queued entry's pinned id and class were not carried to the build");
  const many = Array.from({ length: 9 }, (_, i) => ({ q: `Product ${i}` }));
  w = build.workList(many, { products: [] }, { max: 5 });
  if (w.take.length !== 5) fail(`cap not applied: took ${w.take.length}`);
  if (w.deferred.length !== 4) fail(`cap dropped work silently: ${w.deferred.length} deferred, expected 4`);
  ok("queue and --stale dedupe, pins carry, cap holds and reports overflow");
}

/* ---------------------------------------- 11. corpus merges, never replaces */
console.log("\ncorpus loading");
{
  const beforeP = P.slice();
  const realFetch = globalThis.fetch;
  const mkP = (id, over) => ({
    id, brand: "Fetched", model: id, klass: "knife8", year: "current",
    comps: [{ id: "c", n: "Comp", role: "Critical" }],
    materials: [{ c: "c", n: "Mat", share: 50, spec: "S" }],
    sourcing: [{ c: "c", m: "Src", o: "O", s: "s" }],
    construction: { mode: "Factory", auto: "a", tol: "t", steps: [{ c: "c", p: "p" }] },
    assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Single site" },
    skill: { tier: "T", basis: "b", ops: [["c", "op", "sk"]] },
    parts: [{ c: "c", n: "P", m: "m", crit: "Critical", fail: "f" }],
    issues: [], gen: "2026-08-14", rev: false, vlog: [], ...over,
  });
  const overridden = beforeP.find(p => !p.stub).id;
  globalThis.fetch = async url => {
    if (String(url).includes("corpus.json")) return { ok: true, json: async () => ({
      schema: 1, built: "2026-08-14", classes: { newklass: "A new class" },
      products: [mkP("fetched-new"), mkP(overridden, { brand: "Overridden" })] }) };
    throw new Error("no advisories");
  };
  try { await loadCorpus(); } finally { globalThis.fetch = realFetch; }

  for (const p of beforeP)
    if (!P.some(x => x.id === p.id)) fail(`loading corpus.json dropped the embedded product ${p.id}`);
  if (!P.find(x => x.id === "fetched-new")) fail("the fetched product was not added");
  const ov = P.find(x => x.id === overridden);
  if (!ov || ov.brand !== "Overridden") fail("a rebuilt product did not override the embedded one of the same id");
  if (P.filter(x => x.id === overridden).length !== 1) fail("the override duplicated the product instead of replacing it");
  if (!CATS.knife8) fail("merging classes wiped the embedded ones");
  if (!CATS.newklass) fail("the fetched class was not merged in");
  if (!/embedded/.test(META.source)) fail(`META.source does not disclose the merge: ${META.source}`);

  const added = P.find(x => x.id === "fetched-new");
  if (added) {
    const before = JSON.stringify(added);
    verifyAll();
    if (JSON.stringify(added) !== before) fail("re-verifying a loaded corpus changed it");
  }
  P.length = 0; P.push(...beforeP);
  delete CATS.newklass;
  ok(`corpus.json merges: ${beforeP.length} embedded kept, 1 added, 1 overridden by id`);
}

/* ------------------------------------------------------- 12. add an item */
/* The first path into the catalogue that does not cost money. What matters
   here is the data underneath the form: a broken category list or a silently
   dropped field is invisible on screen and permanent in whatever gets typed. */
console.log("\nadd item");
{
  /* ---- the taxonomy the form offers ---- */
  const types = Object.entries(ITEM_TYPES);
  if (types.length !== 8) fail(`expected 8 item types, found ${types.length}`);
  for (const [k, t] of types) {
    if (!t.n) fail(`item type "${k}" has no label`);
    if (!Array.isArray(t.cats) || t.cats.length < 8)
      fail(`item type "${k}" has ${t.cats?.length ?? 0} categories — too few to be complete`);
    if (new Set(t.cats).size !== t.cats.length)
      fail(`item type "${k}" repeats a category`);
    if (t.cats.some(c => !c || !c.trim())) fail(`item type "${k}" has a blank category`);
  }
  const allCats = types.flatMap(([, t]) => t.cats);
  ok(`${types.length} item types, ${allCats.length} categories, none blank or repeated within a type`);

  /* ---- the identifier list swaps on type, and Unknown is always reachable ---- */
  {
    const raw = identList("raw"), trade = identList("consumer");
    if (raw[0][0] !== "CAS Registry Number") fail("raw materials do not lead with CAS");
    if (trade[0][0] !== "SKU") fail("trade items do not lead with SKU");
    if (raw.at(-1)[0] !== "Unknown" || trade.at(-1)[0] !== "Unknown")
      fail("Unknown is not the last identifier option on both lists");
    if (raw.some(r => r[0] === "ISBN")) fail("a raw material was offered a book number");
    if (trade.some(r => r[0] === "CAS Registry Number")) fail("a trade item was offered a CAS number");
    for (const [k, d] of [...raw, ...trade])
      if (!k || !d) fail(`identifier "${k}" has no description — the help text renders blank`);
    /* every non-raw type gets the trade list */
    for (const [k] of types) {
      if (k === "raw") continue;
      if (identList(k)[0][0] !== "SKU") fail(`item type "${k}" did not get the trade identifier list`);
    }
    ok(`identifiers swap on type: ${raw.length} for raw materials, ${trade.length} otherwise, Unknown last on both`);
  }

  /* ---- countries ---- */
  {
    if (COUNTRIES.length < 190) fail(`only ${COUNTRIES.length} countries — the list is incomplete`);
    if (new Set(COUNTRIES).size !== COUNTRIES.length) fail("the country list repeats an entry");
    const sorted = [...COUNTRIES].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(COUNTRIES) !== JSON.stringify(sorted)) fail("the country list is not alphabetical");
    if (COUNTRIES.some(c => !c.trim())) fail("the country list has a blank entry");
    ok(`${COUNTRIES.length} countries, alphabetical, no duplicates`);
  }

  /* ---- city capitalisation ----
     Free-text cities produce "solingen", "SOLINGEN" and "Solingen" in one
     afternoon. The particles are the part that is easy to get wrong, and
     wrong in a way nobody notices until the catalogue is full of it. */
  {
    const cases = [
      ["solingen", "Solingen"], ["SHEFFIELD", "Sheffield"], ["mAnChEsTeR", "Manchester"],
      ["  toluca  ", "Toluca"], ["new york", "New York"], ["ho chi minh city", "Ho Chi Minh City"],
      ["rio de janeiro", "Rio de Janeiro"], ["la paz", "La Paz"], ["the hague", "The Hague"],
      ["stratford-upon-avon", "Stratford-upon-Avon"], ["port-au-prince", "Port-au-Prince"],
      ["aix-en-provence", "Aix-en-Provence"], ["o'fallon", "O'Fallon"],
      ["'s-hertogenbosch", "'s-Hertogenbosch"], ["frankfurt am main", "Frankfurt am Main"],
      ["san josé", "San José"], ["", ""],
    ];
    for (const [inp, exp] of cases) {
      const got = titleCase(inp);
      if (got !== exp) fail(`titleCase(${JSON.stringify(inp)}) gave "${got}", expected "${exp}"`);
    }
    if (titleCase(titleCase("port-au-prince")) !== "Port-au-Prince")
      fail("titleCase is not idempotent — it fights itself on a second blur");
    ok(`${cases.length} city forms normalise, particles stay down, and it is idempotent`);
  }

  /* ---- the form renders for every type, and reveals the right sub-list ---- */
  {
    S.form = blankForm(); S.formErr = [];
    let out = renderAdd();
    if (strays(out)) fail(`add form: stray value — …${strays(out).replace(/\s+/g, " ")}…`);
    if (/<select[^>]*>[\s\S]*?Apparel/.test(out)) fail("the category list showed before a type was chosen");

    for (const [k, t] of types) {
      S.form = blankForm(); S.form.type = k;
      out = renderAdd();
      if (strays(out)) fail(`add form/${k}: stray value`);
      for (const c of t.cats)
        if (!out.includes(c)) fail(`add form/${k}: category "${c}" is missing from the rendered list`);
      const wrong = types.find(([o]) => o !== k && !ITEM_TYPES[o].cats.every(c => t.cats.includes(c))
        && ITEM_TYPES[o].cats.some(c => !t.cats.includes(c) && out.includes(">" + c + "<")));
      if (wrong) fail(`add form/${k}: leaked a category from "${wrong[0]}"`);
    }
    ok("the form renders for all 8 types and reveals only that type's categories");
  }

  /* ---- validation refuses to record a nameless thing ---- */
  {
    const before = DRAFTS.length;
    S.form = blankForm(); S.formErr = [];
    saveDraft();
    if (DRAFTS.length !== before) fail("an empty form was saved");
    if (S.formErr.length < 3) fail(`expected errors for manufacturer, name and type, got ${S.formErr.length}`);

    S.form = blankForm();
    Object.assign(S.form, { mfr: "Wüsthof", name: "Classic 8in", type: "consumer" });
    saveDraft();
    if (DRAFTS.length !== before) fail("a form with no category was saved");
    if (!S.formErr.some(e => /category/i.test(e))) fail("the missing category was not reported");

    /* an identifier scheme with no value is a half-answer; Unknown is a whole one */
    S.form.cat = "Home & Garden"; S.form.identType = "UPC";
    saveDraft();
    if (DRAFTS.length !== before) fail("an identifier scheme with no value was saved");
    S.form.identType = "Unknown";
    saveDraft();
    if (DRAFTS.length !== before + 1) fail("a valid item was not saved");

    const d = DRAFTS.at(-1);
    if (d.manufacturer !== "Wüsthof" || d.name !== "Classic 8in") fail("the saved item lost its name");
    if (d.typeLabel !== ITEM_TYPES.consumer.n) fail("the saved item lost its type label");
    if (d.ids.length) fail("an Unknown identifier recorded a value anyway");
    if (!/No identifier marked/.test(d.identifierNote || ""))
      fail("an Unknown identifier did not record why it is absent");
    if (!("composition" in d)) fail("the record has no slot for composition, which is the next step");
    if (S.form.mfr) fail("the form did not clear after a successful save");
    DRAFTS.length = before;
    ok("validation blocks a nameless, typeless or half-identified item and clears on success");
  }

  /* ---- origin is optional, and absent means absent ---- */
  {
    const before = DRAFTS.length;
    S.form = blankForm();
    Object.assign(S.form, { mfr: "M", name: "N", type: "raw", cat: "Metals & Alloys" });
    saveDraft();
    const d = DRAFTS.at(-1);
    if (d.origin !== null) fail("an item with no country or city recorded an origin anyway");
    if (d.ids.length) fail("an item with no identifier recorded one anyway");
    if (d.image !== null) fail("an item with no image recorded one anyway");
    DRAFTS.length = before;
    ok("an unanswered field records as null rather than as an empty string");
  }

  S.form = null; S.formErr = [];
}

/* ----------------------------------------------------------------- done */
console.log("");
if (fails.length) {
  console.error(`FAILED — ${fails.length} problem(s)\n`);
  fails.forEach(f => console.error(`  · ${f}`));
  process.exit(1);
}
const mats = P.reduce((a, p) => a + (p.materials || []).length, 0);
console.log(`PASSED — ${P.length} products, ${catLeaves().length} categories, ${mats} material rows\n`);
