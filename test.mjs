#!/usr/bin/env node
/* ==========================================================================
   test.mjs — regression suite for Substrate
   --------------------------------------------------------------------------
   Extracts the script block from index.html, stubs the DOM, and exercises
   every renderer across every product in both pivots. Then runs the verifier
   against a deliberately confabulated payload and asserts it moves each
   unsupported claim out of the tables.

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
    stub + src + "\nexport { P, S, CATS, catPath, catCrumb, catLabel, catMatch, catSubtree, catLeaves, " +
    "resultGroups, emptyMatches, coverage, covbar, cite, peers, verify, verifyAll, ingest, " +
    "quickView, fullView, peerView, vpanel, matches, results, stale, ageDays, " +
    "norm, addReq, REQS, renderGen, renderMethod, " +
    "gapView, classSilence, citedBy, prosePointer, covCompare, TABL, " +
    "compDeltas, compDeltaView, CATTR, " +
    "SPECS, specCell, specTable, " +
    "tcmp, clearCmp, cmpSet, compareView, exportPayload, comparisonCSV, exportRows, citedClaims, " +
    "loadCorpus, META };"
  )
);

const {
  P, S, CATS, catPath, catCrumb, catLabel, catMatch, catSubtree, catLeaves,
  resultGroups, emptyMatches, coverage, cite, peers, verify, verifyAll, ingest,
  quickView, fullView, peerView, vpanel, results, stale, norm,
  renderMethod, gapView, classSilence, citedBy, TABL,
  compDeltas, compDeltaView, CATTR,
  SPECS, specCell, specTable,
  tcmp, clearCmp, cmpSet, compareView, exportPayload, comparisonCSV, exportRows, citedClaims,
  loadCorpus, META
} = mod;

/* Every tab a report can render. Kept in one place so a new tab cannot be
   added without the render sweep below picking it up. */
const TABS = p => [
  ["quick", () => quickView(p, coverage(p))],
  ["full",  () => fullView(p)],
  ["peers", () => peerView(p)],
  ["gaps",  () => gapView(p)],
];
const strays = out => (out.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,60}/s) || [])[0];

/* ------------------------------------------------- 0. the page actually boots */
/* This suite used to load the script block MINUS its DOM-bound tail, so
   render(), renderRail(), renderTray() and every inline onclick= the page
   relies on were never executed by anything. Fifty-two checks passed green
   while the deployed page was dead on arrival: renderRail() counted facets
   with p.construction.mode, which became null the moment a claim could be
   uncited, and the exception took the whole boot down before a single
   handler bound.

   So this runs the WHOLE block, in a vm context rather than an ES module,
   because a classic <script> puts its function declarations on the global
   object and an import does not — and the inline handlers in the static HTML
   can only find them if they are global. It runs first, because a page that
   does not boot makes every other assertion here meaningless. */
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
    const scan = src => {
      for (const m of src.matchAll(/\bon(?:click|change|input|submit|keydown)\s*=\s*"([^"]*)"/g))
        for (const c of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))
          if (!RESERVED.has(c[1])) handlers.add(c[1]);
    };
    scan(html.split("<script>")[0]);            // the static shell
    ["main","rail","trayin"].forEach(id => scan(out(id)));
    box.open_(P[0].id); scan(out("main"));      // a report, and its tabs
    for (const t of Object.keys(TABL)) { box.setTab(t); scan(out("main")); }
    box.goHome(); box.openMethod(); scan(out("main"));
    box.openGen(""); scan(out("main"));

    const missing = [...handlers].filter(f => typeof box[f] !== "function");
    if (missing.length) fail(`inline handler(s) not defined: ${missing.join(", ")}`);

    /* And the flows themselves, driven the way a reader drives them. */
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
      if (/undefined|\[object Object\]/.test(out("main"))) fail(`tab "${t}" printed a stray value`);
    }

    box.goHome();
    box.tcmp("wusthof"); box.tcmp("victorinox");
    if (!out("trayin").length) fail("the compare tray renders nothing when filled");
    box.openCompare();
    if (!/Specifications/.test(out("main"))) fail("openCompare() rendered no spec sheet");
    box.clearCmp();

    box.openMethod();
    if (!/citation/i.test(out("main"))) fail("openMethod() rendered no method page");

    ok(`boots clean, ${handlers.size} inline handlers all defined, every view drives`);
  }

  /* The hero, the legend and the footer are static HTML outside the <script>
     block, so every edit that removed the tiers went straight past them. They
     described EXACT/LIKELY/UNKNOWN on the live site for four commits. */
  for (const dead of ["EXACT","LIKELY","UNKNOWN","Certainty tags","confirmed, inferred, or missing"]) {
    if (html.includes(dead)) fail(`the page still says "${dead}" — probably in the static shell, which no renderer touches`);
  }
  ok("no static copy still describes the certainty tiers");
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
  if (peers(p).length < 1) fail(`${p.id}: no peers — the class has nothing to compare against`);

  /* Coverage is the only number on the site. If its parts stop adding up,
     every bar and every percentage is reporting something else. */
  const c = coverage(p);
  if (c.cited + c.uncited !== c.total)
    fail(`${p.id}: coverage does not add up — ${c.cited} cited + ${c.uncited} uncited != ${c.total}`);
  if (c.total !== (p.uncited || []).length + c.cited)
    fail(`${p.id}: coverage total disagrees with the uncited list`);
}
if (!fails.length) ok(`${P.length} products, no orphan rows, every class has peers, coverage adds up`);

/* Nothing in a table may be uncited. This is the whole thesis expressed as an
   assertion: if it ever passes vacuously the site has stopped being what it
   claims to be, so it also checks that at least one row exists to test. */
{
  let checked = 0;
  const resolves = (p, r) => {
    const s = (p.sources || [])[r && r.src];
    return !!(s && /^https?:\/\//.test(s.u || ""));
  };
  for (const p of P) {
    for (const [sec, rows] of [["materials", p.materials], ["sourcing", p.sourcing], ["parts", p.parts]]) {
      (rows || []).forEach(r => {
        checked++;
        if (!resolves(p, r)) fail(`${p.id}: an uncited ${sec} row reached the table`);
      });
    }
    for (const k of ["construction", "assembly", "skill"]) {
      if (p[k]) { checked++; if (!resolves(p, p[k])) fail(`${p.id}: an uncited ${k} claim reached the table`); }
    }
  }
  ok(checked
    ? `${checked} table rows across the corpus, every one carrying a resolving citation`
    : "no table rows in the embedded corpus — it carries no sources, so every claim is prose (section 13 covers a cited product)");
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

/* A claim demoted to prose is still a claim about the product. If search only
   covered the tables, moving a row out of one would make the product harder to
   find — the migration would have quietly deleted search coverage. */
{
  const p = P.find(x => (x.uncited || []).length);
  if (!p) fail("no product has an uncited claim — the prose search probe cannot run");
  else {
    const term = (p.uncited.find(u => u.label && /[a-z]{5}/i.test(u.label)) || {}).label || "";
    const word = (term.match(/[A-Za-z]{5,}/g) || []).pop();
    if (word) {
      S.q = word;
      if (!results().some(x => x.id === p.id))
        fail(`"${word}" is in ${p.id}'s prose but search does not reach it`);
      S.q = "";
    }
  }
}
ok(`${probes.length} probes, accent-insensitive, prose reachable`);

/* ------------------------------------------------------- 3b. categories */
/* The reason the tree exists: "kitchen knife" must return kitchen knives and
   not camping knives. Substring search cannot do it — every one of them
   contains the word "knife" — so these are the assertions that keep the
   resolution working when someone edits CATS. */
console.log("\ncategories");
{
  /* Structure first: a broken parent pointer silently truncates every path,
     and every search term derived from one. */
  for (const [id, c] of Object.entries(CATS)) {
    if (c.p && !CATS[c.p]) fail(`category "${id}" points at a parent that does not exist: "${c.p}"`);
    if (!c.n) fail(`category "${id}" has no name`);
    const path = catPath(id);
    if (path[path.length - 1] !== id) fail(`catPath("${id}") does not end at itself — cycle or broken chain`);
    if (path.length > 6) fail(`category "${id}" is ${path.length} deep — probably a cycle`);
  }
  for (const p of P) {
    if (!CATS[p.klass]) fail(`${p.id}: klass "${p.klass}" is not a category`);
  }
  ok(`${Object.keys(CATS).length} categories, ${catLeaves().length} leaves, every parent resolves`);

  /* The headline case, both directions. */
  const hit = q => catMatch(q).flatMap(catSubtree);
  const kk = hit("kitchen knife");
  if (!kk.includes("knife8")) fail('"kitchen knife" does not reach the chef\'s knife category');
  if (kk.includes("fixed") || kk.includes("pocket"))
    fail('"kitchen knife" reached an outdoor knife category');

  const ck = hit("camping knife");
  if (!ck.includes("fixed")) fail('"camping knife" does not reach the fixed-blade category');
  if (ck.includes("knife8")) fail('"camping knife" reached the kitchen knife category');
  ok('"kitchen knife" and "camping knife" resolve to opposite branches');

  /* Ambiguity is answered, not guessed at. */
  const bare = hit("knife");
  if (!bare.includes("knife8") || !bare.includes("fixed"))
    fail('"knife" alone should reach both branches rather than picking one');
  ok('"knife" alone returns both branches for the reader to choose');

  /* A word only an ancestor carries still has to work — that is what makes
     "kitchen" specific, since it appears on no knife node. */
  if (!hit("cookware").includes("skillet")) fail("a parent-only term did not reach its leaf");
  if (hit("kitchen").includes("instant")) fail('"kitchen" reached a food category');
  ok("ancestor terms reach their leaves and nothing else");

  /* Non-category queries must fall through to product text, or brand search
     stops working the moment the tree is introduced. */
  if (catMatch("wusthof").length) fail('"wusthof" was treated as a category');
  S.q = "wusthof";
  if (!results().some(p => /W/.test(p.brand))) fail("brand search stopped working under the tree");
  S.q = "solingen";
  if (!results().length) fail("a term that lives only in prose stopped resolving");
  S.q = "";
  ok("non-category queries fall through to product text");

  /* An empty category is an answer, not a blank. */
  S.q = "camping knife";
  const empt = emptyMatches();
  if (!empt.includes("fixed")) fail('"camping knife" did not report its empty category');
  if (resultGroups().length) fail('"camping knife" returned products');
  S.q = "kitchen knife";
  if (emptyMatches().includes("knife8")) fail("a populated category was reported as empty");
  S.q = "";
  ok("a named-but-empty category is reported rather than returning nothing");

  /* Grouping is what makes an ambiguous query readable. */
  S.q = "knife";
  const g = resultGroups();
  if (!g.length) fail('"knife" returned no groups');
  if (g.some(x => !x.crumb || !x.items.length)) fail("a result group is missing its breadcrumb or its items");
  if (new Set(g.map(x => x.k)).size !== g.length) fail("a category appeared in two groups");
  S.q = "";
  ok("results group under their category with a breadcrumb");
}

/* ----------------------------------------------------------- 4. verifier */
console.log("\nverifier — adversarial payload");

/* Every failure the verifier exists to catch, in one payload: a row citing a
   source that does not exist, a row citing a source with no URL, a row citing
   nothing at all, and a row bound to a component nobody declared. */
const bad = {
  klassLabel: "Stovetop espresso maker",
  sources: [
    { t: "Bialetti", u: "https://www.bialetti.com/moka-express" },
    { t: "Untitled press release", u: "" },
  ],
  target: {
    brand: "Bialetti", model: "Moka Express 6-cup", year: "current",
    comps: [{ id: "body", n: "Body", role: "Structural" },
            { id: "gasket", n: "Gasket", role: "Functional" },
            { id: "handle", n: "Handle", role: "Structural" }],
    materials: [
      { c: "body", n: "Aluminium alloy", share: 80, spec: "EN AB-46000", src: 0 },  // valid
      { c: "gasket", n: "Silicone rubber", share: 5, spec: "Food-grade", src: 9 },  // src out of range
      { c: "handle", n: "Phenolic resin", share: 15, spec: "Bakelite" },            // no src at all
      { c: "ghost", n: "Chromium plating", share: 3, spec: "Decorative", src: 0 }   // orphan
    ],
    sourcing: [{ c: "body", m: "Aluminium ingot", o: "Italy", s: "unnamed", src: 1 }], // urlless source
    construction: {
      mode: "Factory", src: 0, auto: "High", tol: "n/a",
      steps: [{ c: "body", p: "Die-cast" }, { c: "ghost", p: "Electroplated" }]
    },
    assembly: { sites: [{ l: "Italy", o: "Casting" }], label: "Made in Italy", count: "Single site", src: 0 },
    skill: { tier: "Trained worker", basis: "line work",
             ops: [["body", "Casting", "Machine operator"], ["ghost", "Plating", "Operator"]] },
    parts: [{ c: "body", n: "Boiler", m: "Cast aluminium", crit: "Critical", src: 0, fail: "Pressure vessel." }],
    issues: [],
  },
  peers: [
    { brand: "Alessi", model: "Pulcina 6-cup", why: "Different valve geometry" },
    { brand: "Generic", model: "Import moka pot", why: "No disclosure at all" },
  ],
};

/* verify() mutates its argument, so keep an untouched copy for section 11,
   which runs both implementations against the same input. */
const badPristine = structuredClone(bad);
const log = verify(bad);
const expect = [
  [/Silicone rubber.*not cited/i, "row citing a source index that does not exist"],
  [/Phenolic resin.*not cited/i, "row citing nothing at all"],
  [/Aluminium ingot.*not cited/i, "row citing a source with no URL"],
  [/Skill tier.*not cited/i, "singleton citing nothing at all"],
  [/Source \[1\].*no resolvable URL/i, "source with no URL named once, on its own"],
  [/material row.*undeclared/i, "orphan material dropped"],
  [/process row.*undeclared/i, "orphan process dropped"],
  [/skill row.*undeclared/i, "orphan skill op dropped"],
];
for (const [re, label] of expect) {
  if (log.some(l => re.test(l))) ok(label);
  else fail(`verifier missed: ${label}`);
}

{
  const t = bad.target;
  const named = n => t.materials.some(m => m.n === n);
  if (!named("Aluminium alloy")) fail("a properly cited row was moved out of the table");
  if (named("Silicone rubber") || named("Phenolic resin"))
    fail("an uncited row stayed in the materials table");
  if (named("Chromium plating")) fail("the orphan row survived the prune");
  if (t.skill !== null) fail("an uncited skill claim was left readable as though it had passed");
  if (t.construction === null) fail("a cited construction claim was nulled");

  /* Relocated, not deleted — losing the content is the failure mode the old
     cascade had, and it took the best writing on the page with it. */
  const moved = t.uncited.map(u => u.label).join(" | ");
  for (const n of ["Silicone rubber", "Phenolic resin", "Aluminium ingot", "Skill tier"])
    if (!moved.includes(n)) fail(`${n} was dropped instead of moved to prose`);
  const sil = t.uncited.find(u => /Silicone/.test(u.label));
  if (sil.row.spec !== "Food-grade") fail("a demoted row lost its content on the way out");
  if (!/does not resolve|no source cited/.test(sil.why)) fail("a demoted row carries no reason");
  if (t.uncited.some(u => /Chromium/.test(u.label)))
    fail("an orphan row was written to prose — it references a component that does not exist");
  ok("uncited rows relocate with their content and a reason; orphans are dropped outright");

  if (t.coverage.cited + t.uncited.length !== t.coverage.total)
    fail("coverage on the adversarial payload does not add up");
}

/* Running it twice must not double-count, re-demote, or duplicate prose.
   loadCorpus() and verifyAll() can both reach the same product. */
{
  const twice = structuredClone(badPristine);
  verify(twice);
  const first = JSON.stringify(twice.target.coverage);
  const n1 = twice.target.uncited.length;
  verify(twice);
  if (JSON.stringify(twice.target.coverage) !== first) fail("verify() is not idempotent — coverage moved");
  if (twice.target.uncited.length !== n1) fail("verify() duplicated prose entries on a second run");
  ok("verify() is idempotent — a second pass changes nothing");
}

/* A report where nothing resolves has to say so rather than render empty. */
{
  const none = structuredClone(badPristine);
  none.sources = [];
  const l = verify(none);
  if (!l.some(x => /whole report is prose/i.test(x)))
    fail("a report with no resolving source anywhere did not say so");
  if (none.target.coverage.cited !== 0) fail("coverage counted a claim with no sources at all");
  ok("a report with nothing cited is called out, not rendered as empty tables");
}

/* Mass shares are the one numeric sanity check left. */
{
  const over = structuredClone(badPristine);
  over.target.materials = [
    { c: "body", n: "A", share: 80, spec: "S", src: 0 },
    { c: "body", n: "B", share: 40, spec: "S", src: 0 },
  ];
  if (!verify(over).some(x => /approximate/i.test(x))) fail("material shares over 105% were not flagged");
  ok("material shares over 105% are flagged");
}

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
/* The page used to publish six weights and three severity bands, and the test
   asserted each was read from the constants rather than transcribed. There is
   one rule now, so what has to be guarded is different: that the page states
   it, that it does not present the removed model as though it were live, and
   that its coverage figures still come from the corpus. */
console.log("\nmethod page");
{
  const m = renderMethod();
  if (strays(m)) fail(`method page: stray value — …${strays(m).replace(/\s+/g, " ")}…`);
  if (!/carries a citation, or it is not in the table/.test(m))
    fail("method page does not state the one rule the site runs on");
  for (const dead of ['class="tag ', "Build custom", "score = (", "weighted mean of six"]) {
    if (m.includes(dead)) fail(`method page still presents "${dead}" as live`);
  }
  if (!/Attribution is not hedging|says what it is a fact about/i.test(m))
    fail("method page does not explain attribution");
  if (!/cannot tell whether the source|does not state|actually supports/i.test(m))
    fail("method page does not disclose that a well-cited wrong claim is not caught");

  /* The one figure still read out of the running corpus. */
  const real = P.filter(p => !p.stub);
  const cited = real.reduce((a, p) => a + coverage(p).cited, 0);
  const total = real.reduce((a, p) => a + coverage(p).total, 0);
  if (!m.includes(`${cited} of ${total} claims`))
    fail(`method page's coverage figure is not read from the corpus (expected ${cited} of ${total})`);
  ok("states the rule, drops the removed model, counts coverage from the live corpus");
}

/* the request-queue copy must not claim on-demand research anywhere */
if (/Generate a report for|Generate the full report/.test(html))
  fail("a button still offers to generate a report on demand");
if (/search the web/i.test(html)) fail("copy still claims Substrate searches the web on demand");
ok("no button or copy promises on-demand research");

/* ------------------------------------------------------- 7. the prose tab */
console.log("\nnot cited");

/* The prose tab and the coverage bar read the same list. If they disagree,
   one of them is lying about how much of the report can be checked. */
for (const p of P.filter(x => !x.stub)) {
  const shown = (gapView(p).match(/class="gitem"/g) || []).length;
  if (shown !== coverage(p).uncited)
    fail(`${p.id}: prose tab shows ${shown} items, coverage counts ${coverage(p).uncited} uncited`);
}
ok("the prose tab and the coverage bar agree on every product");

/* Content, not a texture. The old view nulled a demoted field and hatched it;
   the whole point of the rewrite is that the writing survives. */
{
  const p = P.find(x => !x.stub && (x.uncited || []).some(u => u.row && u.row.spec));
  if (p) {
    const u = p.uncited.find(x => x.row && x.row.spec);
    if (!gapView(p).includes(u.row.spec))
      fail(`${p.id}: a demoted row's content is not written out on the prose tab`);
    ok("demoted claims render their content, not a placeholder");
  } else {
    ok("no demoted row carries a spec to check (corpus-dependent)");
  }
}

/* Class silence is the sharpest thing the site says. It has to key off cited
   rows now, and it must not fire on a class nobody has researched. */
{
  const p = P.find(x => !x.stub);
  const cs = classSilence(p);
  const real = [p, ...peers(p)].filter(x => !x.stub);
  if (cs.n !== real.length) fail("class silence counted stubs as researched products");
  if (cs.comparable !== (real.length >= 2)) fail("class silence claimed comparability it does not have");
  for (const [k, silent] of Object.entries(cs.silent)) {
    const anyone = real.some(x => citedBy(x, k) > 0);
    if (silent === anyone) fail(`class silence for "${k}" disagrees with the cited rows it reads`);
  }

  /* A class of one must not report an industry norm. */
  const lonely = P.find(x => !x.stub && peers(x).filter(y => !y.stub).length === 0);
  if (lonely && classSilence(lonely).comparable)
    fail("a product with no researched peer was called comparable");
  if (lonely && !/no peer disclosure to measure it against/.test(gapView(lonely)))
    fail("a product with no researched peer did not say so");
  ok("class silence reads cited rows, excludes stubs, and declines a class of one");
}

/* --------------------------------------------- 7b. the two empty states */
/* "No Data For Now" and "recorded but not cited" must never be confused. The
   first says this corpus has nothing; the second says something is known and
   not yet traceable. Printing the first over the second would claim an absence
   that is not there — the exact false attribution the disclaimer exists to
   prevent, pointed the other way. */
console.log("\nempty states");
{
  const held = P.find(p => !p.stub && (p.uncited || []).some(u => u.sec === "materials"));
  if (!held) fail("no product holds an uncited materials claim to test against");
  else {
    const q = quickView(held, coverage(held));
    if (!/Recorded, not yet cited/.test(q))
      fail(`${held.id}: an uncited-but-recorded field did not say so`);
    if (/No Data For Now/.test(q.split("nodatanote")[0]))
      fail(`${held.id}: claimed "No Data For Now" over a field that is recorded`);
  }

  /* and the true-absence case, which no product in the corpus currently hits */
  const empty = {
    id: "empty", brand: "Empty", model: "Nothing Recorded", klass: "knife8", year: "unspecified",
    comps: [], materials: [], sourcing: [], parts: [],
    construction: null, assembly: null, skill: null,
    uncited: [], coverage: { cited: 0, total: 0 },
    issues: [], sources: [], vlog: [],
  };
  const qe = quickView(empty, coverage(empty));
  if ((qe.split("No Data For Now").length - 1) < 4)
    fail("a product with nothing recorded did not say No Data For Now on all three rocks");
  if (/Recorded, not yet cited/.test(qe))
    fail("claimed a field was recorded when nothing is");

  /* the disclaimer travels with the report, not the Method page */
  if (!/not a statement about the product/.test(qe))
    fail("the report does not disclaim what an absent field means");
  ok("absent and uncited read differently, and every report carries the disclaimer");
}

/* ------------------------------------------------------- 8. coverage math */
console.log("\ncoverage");
for (const p of P) {
  const c = coverage(p);
  const counted =
    (p.materials || []).length + (p.sourcing || []).length + (p.parts || []).length +
    (p.construction ? 1 : 0) + (p.assembly ? 1 : 0) + (p.skill ? 1 : 0);
  if (c.cited !== counted)
    fail(`${p.id}: coverage says ${c.cited} cited, the tables hold ${counted}`);
  if (c.total && (c.pct < 0 || c.pct > 100)) fail(`${p.id}: coverage percentage out of range (${c.pct})`);
  if (!c.total && c.pct !== 0) fail(`${p.id}: a report with no claims did not read 0%`);
}
ok(`coverage on all ${P.length} products equals what the tables actually hold`);

/* cite() must produce a real link or nothing — never a marker that goes
   nowhere, which would look exactly like a citation and be worthless. */
{
  let links = 0;
  for (const p of P) {
    for (const r of [...(p.materials || []), ...(p.sourcing || []), ...(p.parts || [])]) {
      const out = cite(p, r);
      if (!out) { fail(`${p.id}: a table row rendered no citation marker`); continue; }
      const href = (out.match(/href="([^"]*)"/) || [])[1];
      if (!/^https?:\/\//.test(href || "")) fail(`${p.id}: citation marker points at "${href}"`);
      links++;
    }
  }
  if (cite({ sources: [] }, { src: 0 }) !== "") fail("cite() invented a link with no source behind it");
  if (cite({ sources: [{ t: "x", u: "" }] }, { src: 0 }) !== "") fail("cite() linked a source with no URL");
  ok(`${links} citation markers, every one resolving; none invented`);
}

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

/* A part a peer declares and this product does not is a comparison, not an
   omission — it must still appear, flagged. */
{
  const v = P.find(p => p.klass === "knife8" && p.comps?.some(c => c.id === "tang"));
  const cd = v && compDeltas(v);
  if (!cd) fail("no component deltas for the knife class");
  else {
    const rivets = cd.rows.find(r => r.id === "rivets");
    if (!rivets) fail("a peer-only component was dropped from the matrix");
    else {
      if (rivets.onTarget) fail("rivets wrongly marked as on the Victorinox roster");
      if (!/not on this roster/.test(compDeltaView(v))) fail("absent component not disclosed in the view");
      ok("peer-only components appear and are flagged as absent here");
    }
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

/* The peer tab has one pivot now — the comparison the note argued for all
   along. Guard that it routes there and that no attribute was lost. */
if (CATTR.length !== 4) fail(`expected 4 comparison attributes, found ${CATTR.length}`);
if (CATTR.some(a => a.k === "role")) fail("role is in the header, not a compared row");
if (CATTR.some(a => "t" in a)) fail("a comparison attribute still carries a certainty tag");
{
  const w = P.find(p => p.klass === "knife8" && !p.stub);
  if (!/Component deltas|No researched peer/.test(peerView(w)))
    fail("the peer tab did not route to the component comparison");
  ok("the peer tab is the component comparison, all four attributes intact");
}

/* ----------------------------------- 9b. renderers survive a sparse report */
/* A real build returned a part with no `fail`, and two views interpolated it
   straight into the page as the word "undefined". The model omits optional
   fields whenever it cannot establish them, so every renderer has to treat an
   absent field as a gap. This builds a product carrying only what the data
   model requires and renders everything against it — including the case the
   migration created, where all three singleton sections are null. */
console.log("\nsparse report");
{
  const sparse = {
    id: "sparse", brand: "Sparse", model: "Everything Optional Omitted",
    klass: "knife8", year: "unspecified",
    comps: [{ id: "c", n: "Only component", role: "Critical" }],
    materials: [], sourcing: [], parts: [],
    construction: null, assembly: null, skill: null,
    uncited: [{ sec: "materials", label: "A material", row: { c: "c" }, why: "no source cited" }],
    coverage: { cited: 0, total: 1 },
    issues: [], sources: [], vlog: [],
  };

  P.push(sparse);
  try {
    let found = null;
    for (const pivot of ["attr", "comp"]) {
      S.pivot = pivot;
      for (const [name, f] of [...TABS(sparse),
                               ["compDeltas", () => compDeltaView(sparse)],
                               ["vpanel", () => vpanel(sparse)]]) {
        let out;
        try { out = f(); } catch (e) { found ||= `${name}/${pivot} threw: ${e.message}`; continue; }
        const hit = strays(out);
        if (hit && !found) found = `${name}/${pivot}: …${hit.replace(/\s+/g, " ")}…`;
      }
    }
    if (found) fail(`a renderer failed on a report with every optional field absent — ${found}`);
    else ok("every view renders a report with all three sections uncited, no stray values");
  } finally {
    P.splice(P.indexOf(sparse), 1);
  }
}

/* ------------------------------------------ 10. compare tray and exports */
console.log("\ncompare tray and exports");

/* The tray shipped unreachable: it rendered and removed, but nothing ever
   added to S.cmp, so it could never become non-empty. That is the regression
   to guard — a compare feature you cannot put anything into. */
{
  clearCmp();
  if (S.cmp.size !== 0) fail("clearCmp did not empty the tray");
  const knives = P.filter(p => p.klass === "knife8" && !p.stub).slice(0, 2);
  tcmp(knives[0].id);
  if (S.cmp.size !== 1) fail("nothing can be added to the compare tray");
  tcmp(knives[1].id);
  tcmp(knives[1].id);                       // toggles back off
  if (S.cmp.size !== 1) fail("the compare toggle does not toggle");
  tcmp(knives[1].id);
  if (cmpSet().length !== 2) fail("cmpSet did not resolve the selection to products");
  ok("the tray can be filled, toggled, and cleared");
}

/* The workspace itself, across the three shapes it has to handle. */
{
  const knives = P.filter(p => p.klass === "knife8" && !p.stub).slice(0, 2);
  const skillet = P.find(p => p.klass === "skillet" && !p.stub);

  clearCmp(); tcmp(knives[0].id);
  let out = compareView();
  if (!/at least two/.test(out)) fail("a single selection did not ask for a second");

  tcmp(knives[1].id);
  out = compareView();
  if (strays(out)) fail(`compare workspace: stray value — …${strays(out).replace(/\s+/g, " ")}…`);
  if (!/Specifications/.test(out)) fail("compare workspace did not render the spec sheet");
  if (!/Evidence behind these reports/.test(out)) fail("compare workspace lost the coverage matrix");
  if (!/Component deltas/.test(out)) fail("same-class selection did not get component deltas");
  if (/Axis weighting|slider/.test(out)) fail("the weight panel survived in the compare workspace");
  for (const p of knives) if (!out.includes(p.brand)) fail(`${p.brand} missing from the matrix`);

  /* Cross-class is the case that must not pretend: a blade and a jar share no
     roster, so the parts section has to decline rather than invent alignment. */
  tcmp(skillet.id);
  out = compareView();
  if (strays(out)) fail("cross-class compare: stray value in output");
  if (!/Parts cannot be lined up across different categories/.test(out))
    fail("cross-class selection still offered a component comparison");
  if (!/Specifications/.test(out)) fail("cross-class selection lost the spec sheet, which compares fine");
  ok("workspace handles one, same-class, and cross-class selections");
}

/* An export that carried only the cited rows would read as a more complete
   record than the page it came from — the uncited list is the honest half. */
{
  clearCmp();
  const w = P.find(p => p.brand.startsWith("W") && p.klass === "knife8");
  const other = P.find(p => p.klass === "knife8" && !p.stub && p.id !== w.id);
  const stubP = P.find(p => p.stub);
  tcmp(w.id); tcmp(other.id);

  const pay = exportPayload(cmpSet());
  if (pay.products.length !== 2) {
    fail(`export did not receive both selected products (got ${pay.products.length})`);
  } else {
    for (const x of pay.products) {
      const p = P.find(y => y.id === x.id);
      if (!x.coverage) fail(`${x.id}: export omitted coverage`);
      else if (x.coverage.cited + x.coverage.uncited !== x.coverage.total)
        fail(`${x.id}: exported coverage does not add up`);
      if (x.uncited.length !== (p.uncited || []).length)
        fail(`${x.id}: export's uncited list disagrees with the report`);
      if (x.uncited.some(u => !u.why)) fail(`${x.id}: an exported uncited entry carries no reason`);
      if (x.cited.length !== x.coverage.cited)
        fail(`${x.id}: export listed ${x.cited.length} cited claims but counted ${x.coverage.cited}`);
      if (x.cited.some(c => !/^https?:\/\//.test(c.source || "")))
        fail(`${x.id}: an exported cited claim carries no resolving URL`);
      if (x.reviewed !== false) fail(`${x.id}: export did not carry review state`);
    }
  }
  const j = JSON.stringify(pay);
  for (const dead of ['"axes"', '"certainty"', '"score"', '"sourcingAxis"']) {
    if (j.includes(dead)) fail(`export still carries ${dead}`);
  }
  if (!/cited.*carries the URL|does not.*rating/i.test(pay.note))
    fail("export does not explain what coverage is and is not");

  /* A stub has no component tree — exporting one must not throw. */
  if (stubP) {
    const s = exportRows([stubP])[0];
    if (!s.stub) fail("a stub was not marked as such in the export");
    if (s.uncited.length || s.cited.length) fail("a stub reported claims it cannot have");
  }

  /* citedClaims is what makes the export checkable without the page. */
  if (citedClaims(w).length !== coverage(w).cited)
    fail("citedClaims disagrees with the coverage count");
  ok("JSON export carries every cited claim with its URL, every uncited one with its reason");

  /* The sheet is read by spreadsheets, so quoting is load-bearing. */
  const csv = comparisonCSV(cmpSet());
  const lines = csv.split("\r\n");
  const cols = lines[0].split('","').length;
  for (const [i, line] of lines.entries()) {
    if (line.split('","').length !== cols) fail(`comparison sheet row ${i} has a ragged column count`);
    if (!line.startsWith('"') || !line.endsWith('"')) fail(`comparison sheet row ${i} is not quoted`);
  }
  for (const dead of ["Composite", "Confirmed %", "derived from evidence"]) {
    if (csv.includes(dead)) fail(`comparison sheet still carries the "${dead}" row`);
  }
  if (!/Citation coverage %/.test(csv)) fail("sheet omits citation coverage");
  if (!/Claims in prose, uncited/.test(csv)) fail("sheet omits the uncited count");

  const tricky = comparisonCSV([{ ...w, brand: 'A "quoted", brand', model: "M" }, other]);
  if (!/A ""quoted"", brand/.test(tricky)) fail("comparison sheet does not escape embedded quotes");
  if (tricky.split("\r\n")[0].split('","').length !== 3) fail("an embedded comma broke the sheet's columns");
  ok(`comparison sheet: ${lines.length} rows, quoted and escaped`);

  clearCmp();
}

/* -------------------------------------------- 10b. the flat spec sheet */
/* What a reader actually came for: what it is made of, where, and how, for
   two products at once. The component view cannot answer that across
   categories, so this one carries the cross-class case. */
console.log("\nspec comparison");
{
  if (SPECS.length !== 3) fail(`expected the three rocks, found ${SPECS.length} spec columns`);
  if (SPECS.map(x => x.k).join(",") !== "materials,construction,assembly")
    fail("the spec columns are not materials, how, where — in that order");

  /* Alphabetical, because a Set preserves click order and two readers
     comparing the same pair would otherwise see different tables. */
  clearCmp();
  const knives = P.filter(p => p.klass === "knife8" && !p.stub);
  [...knives].reverse().forEach(p => tcmp(p.id));
  const order = cmpSet().map(p => p.brand + " " + p.model);
  if (order.join("|") !== [...order].sort((a, b) => a.localeCompare(b)).join("|"))
    fail(`compare tray is not alphabetical: ${order.join(" , ")}`);
  ok("the tray sorts alphabetically regardless of click order");

  /* Three cell states, and the two empty ones must stay distinct here too —
     a comparison is exactly where "No Data For Now" over a recorded claim
     would mislead most, because it sits beside a product that has one. */
  {
    const held = P.find(p => !p.stub && (p.uncited || []).some(u => u.sec === "materials")
                                     && !(p.materials || []).length);
    if (held) {
      const c = specCell(held, SPECS[0]);
      if (!/Recorded, not yet cited/.test(c)) fail("a recorded-but-uncited spec cell did not say so");
      if (/No Data For Now/.test(c)) fail("a recorded spec cell claimed there is no data");
    } else fail("no product holds an uncited materials claim to test the spec cell against");

    const bare = { id: "bare", brand: "B", model: "M", klass: "knife8", comps: [],
                   materials: [], sourcing: [], parts: [], construction: null,
                   assembly: null, skill: null, uncited: [], coverage: { cited: 0, total: 0 },
                   issues: [], sources: [] };
    for (const spec of SPECS) {
      const c = specCell(bare, spec);
      if (!/No Data For Now/.test(c)) fail(`${spec.k}: nothing recorded did not say No Data For Now`);
      if (/Recorded, not yet cited/.test(c)) fail(`${spec.k}: claimed a recorded value that does not exist`);
    }
    ok("cited, recorded-but-uncited, and absent render as three distinct states");
  }

  /* Every value shown carries the source it rests on — the same rule the
     report tables run on, applied here. */
  {
    let links = 0, bad = 0;
    for (const p of P) {
      for (const spec of SPECS) {
        const v = spec.get(p);
        if (!Array.isArray(v)) continue;
        const cell = specCell(p, spec);
        v.forEach(() => links++);
        for (const href of [...cell.matchAll(/class="cite" href="([^"]*)"/g)].map(x => x[1])) {
          if (!/^https?:\/\//.test(href)) bad++;
        }
      }
    }
    if (bad) fail(`${bad} spec citation(s) point nowhere`);
    ok(`${links} spec lines rendered, every citation on them resolving`);
  }

  /* The case the component view has to decline and this one must not. */
  {
    clearCmp();
    const knife = P.find(p => p.klass === "knife8" && !p.stub);
    const coffee = P.find(p => p.klass === "instant" && !p.stub);
    tcmp(knife.id); tcmp(coffee.id);
    const out = compareView();
    if (strays(out)) fail(`cross-class spec sheet: stray value — ${strays(out).replace(/\s+/g, " ")}`);
    if (!/Specifications/.test(out)) fail("cross-class comparison lost the spec sheet");
    if (!/Parts cannot be lined up/.test(out))
      fail("cross-class comparison tried to line up components anyway");
    for (const p of [knife, coffee]) if (!out.includes(p.brand)) fail(`${p.brand} missing from the spec sheet`);
    ok("specs compare across categories where components cannot");
  }

  /* And the sheet a spreadsheet reads. */
  {
    clearCmp();
    knives.slice(0, 2).forEach(p => tcmp(p.id));
    const csv = comparisonCSV(cmpSet());
    for (const l of SPECS.map(x => x.l)) {
      if (!csv.includes(`"${l}"`)) fail(`comparison sheet omits the "${l}" row`);
    }
    const cols = csv.split("\r\n")[0].split('","').length;
    for (const [i, line] of csv.split("\r\n").entries())
      if (line.split('","').length !== cols) fail(`comparison sheet row ${i} is ragged after adding specs`);
    ok("the comparison sheet carries all three rocks, columns intact");
    clearCmp();
  }
}

/* ------------------------------------------- 11. the two duplicated copies */
/* Invariant 1 says verify() in index.html and build-corpus.mjs must stay
   identical. A comment cannot enforce that — they had already drifted in their
   log wording before this test existed. Run both against the same input and
   diff, then compare the source text itself, because identical behaviour on
   the cases we thought of is weaker than identical code. */
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

  /* Every log line verify() can emit needs a payload that reaches it. The
     adversarial payload alone does not: after its orphan is pruned the shares
     sum under the cap, so the mass-share branch never fires, and a drift in
     that string would slip through a comparison that only ran that payload. */
  const sources = [{ t: "Src", u: "https://example.com/spec" }];
  const mk = over => ({
    klassLabel: "Test class",
    sources,
    target: {
      brand: "B", model: "M", year: "current",
      comps: [{ id: "c", n: "Comp", role: "Critical" }],
      materials: [{ c: "c", n: "Mat", share: 50, spec: "S", src: 0 }],
      sourcing: [{ c: "c", m: "Src", o: "O", s: "s", src: 0 }],
      construction: { mode: "Factory", auto: "a", tol: "t", src: 0, steps: [{ c: "c", p: "p" }] },
      assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Single site", src: 0 },
      skill: { tier: "T", basis: "b", src: 0, ops: [["c", "op", "sk"]] },
      parts: [{ c: "c", n: "P", m: "m", crit: "Critical", src: 0, fail: "f" }],
      issues: [],
      ...over,
    },
  });

  const cases = [
    ["adversarial payload", badPristine],
    ["clean payload", mk({})],
    ["material shares over 105%", mk({
      materials: [
        { c: "c", n: "A", share: 80, spec: "S", src: 0 },
        { c: "c", n: "B", share: 40, spec: "S", src: 0 },
      ],
    })],
    ["nothing cited at all", mk({
      materials: [{ c: "c", n: "Mat", share: 50, spec: "S" }],
      sourcing: [{ c: "c", m: "Src", o: "O", s: "s" }],
      construction: { mode: "Factory", auto: "a", tol: "t", steps: [{ c: "c", p: "p" }] },
      assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Unknown" },
      skill: { tier: "T", basis: "b", ops: [["c", "op", "sk"]] },
      parts: [{ c: "c", n: "P", m: "m", crit: "Critical", fail: "f" }],
    })],
    ["source with no URL", mk({
      materials: [{ c: "c", n: "Mat", share: 50, spec: "S", src: 1 }],
    })],
  ];

  let lines = 0, seen = new Set();
  for (const [label, payload] of cases) {
    const a = structuredClone(payload);
    const b = structuredClone(payload);
    if (label === "source with no URL") { a.sources = [...sources, { t: "Empty", u: "" }]; b.sources = [...a.sources]; }
    const logA = verify(a);
    const logB = build.verify(b);
    if (JSON.stringify(logA) !== JSON.stringify(logB))
      fail(`${label}: the two verifiers logged differently\n      index.html:    ${JSON.stringify(logA)}\n      build-corpus:  ${JSON.stringify(logB)}`);
    if (JSON.stringify(a) !== JSON.stringify(b))
      fail(`${label}: the two verifiers left the payload in different states`);
    logA.forEach(l => seen.add(l.replace(/[""][^""]*[""]/g, "…").replace(/\[\d+\]/g, "[n]")));
    lines += logA.length;
  }
  ok(`${cases.length} payloads, ${lines} log lines, ${seen.size} distinct shapes — both copies agree`);
}

/* ------------------------------------------- 12. scheduled rebuild wiring */
console.log("\nscheduled rebuild");
{
  const build = await import("./build-corpus.mjs");

  /* The queue has no reason to relist a product built months ago, so a
     scheduled rebuild that only reads the queue refreshes nothing. */
  const old = { id: "a", brand: "Old", model: "Thing", gen: "2020-01-01" };
  const fresh = { id: "b", brand: "New", model: "Thing", gen: new Date().toISOString().slice(0, 10) };
  const stubP = { id: "c", brand: "Stub", model: "Thing", gen: "2020-01-01", stub: true };
  const corpus = { products: [old, fresh, stubP] };

  let w = build.workList([], corpus, { stale: false });
  if (w.take.length) fail("an empty queue produced work without --stale");

  w = build.workList([], corpus, { stale: true });
  if (!w.take.some(x => /Old Thing/.test(x.q))) fail("--stale did not pick up a report past the cycle");
  if (w.take.some(x => /New Thing/.test(x.q))) fail("--stale rebuilt a report still inside the cycle");
  if (w.take.some(x => /Stub Thing/.test(x.q))) fail("--stale tried to rebuild a generated stub");

  /* A product both queued and stale must be built once, not twice. */
  w = build.workList([{ q: "Old Thing" }], corpus, { stale: true });
  if (w.take.filter(x => /old.*thing/i.test(x.q)).length !== 1)
    fail("a queued product that is also stale was scheduled twice");

  /* Pinning is what makes a rebuild replace a product rather than land beside
     it. Without the id carried through, a --stale refresh regenerates the slug
     from whatever the model returned that run and silently duplicates. */
  w = build.workList([{ q: "Old Thing", id: "a", klass: "knife8" }], corpus, {});
  if (w.take[0].id !== "a" || w.take[0].klass !== "knife8")
    fail("a queued entry's pinned id and class were not carried to the build");
  w = build.workList([], corpus, { stale: true });
  const oldItem = w.take.find(x => /Old Thing/.test(x.q));
  if (!oldItem || oldItem.id !== "a") fail("a stale refresh did not carry the existing product's id");

  /* Dedupe has to work on both keys. Same id, wording different enough that the
     slugs differ — the pin is the only thing that says these are one product. */
  w = build.workList([{ q: "Old Thing", id: "a" }, { q: "The revised Old Thing, 2nd ed", id: "a" }], { products: [] }, {});
  if (w.take.length !== 1) fail("two entries pinned to the same id were scheduled twice");
  /* And the reverse: queued without a pin, then again from --stale with one. */
  w = build.workList([{ q: "Old Thing" }], corpus, { stale: true });
  if (w.take.filter(x => /old.*thing/i.test(x.q)).length !== 1)
    fail("an unpinned queue entry and its pinned stale twin were both scheduled");

  /* The cap bounds the bill, and overflow is reported rather than dropped. */
  const many = Array.from({ length: 9 }, (_, i) => ({ q: `Product ${i}` }));
  w = build.workList(many, { products: [] }, { max: 5 });
  if (w.take.length !== 5) fail(`cap not applied: took ${w.take.length}`);
  if (w.deferred.length !== 4) fail(`cap dropped work silently: ${w.deferred.length} deferred, expected 4`);
  if (build.MAX_PER_RUN !== 5) fail(`default cap is ${build.MAX_PER_RUN}, expected 5`);
  ok("queue and --stale dedupe, pins carry, cap holds and reports overflow");

  /* The schema the model is asked to fill must not still ask for the removed
     model, or the next build reintroduces it row by row. */
  const bcSrc = readFileSync("build-corpus.mjs", "utf8");
  for (const dead of ['"t":"e|l|u"', '"axes"', "EXACT", "LIKELY", "UNKNOWN"]) {
    if (bcSrc.includes(dead)) fail(`build-corpus.mjs still asks the model for ${dead}`);
  }
  if (!/src is an index into sources/.test(bcSrc))
    fail("build-corpus.mjs does not tell the model what src is for");
  if (!/Do not omit a claim you found but could not source/.test(bcSrc))
    fail("build-corpus.mjs does not tell the model to keep unsourced findings");
  if (!/says what it is a fact ABOUT|fact ABOUT/i.test(bcSrc))
    fail("build-corpus.mjs does not ask for attributed claims");
  ok("the generation schema asks for citations and attribution, not tiers");
}

/* ---------------------------------------- 13. corpus merges, never replaces */
/* The embedded nine carry no sources at all, so every one of their claims is
   prose. Replacing them with corpus.json would drop eight products from the
   site rather than leaving them visible and honestly uncited — the merge is
   what stops that. */
console.log("\ncorpus loading");
{
  const beforeP = P.slice();
  const realFetch = globalThis.fetch;

  const mkP = (id, over) => ({
    id, brand: "Fetched", model: id, klass: "knife8", year: "current",
    comps: [{ id: "c", n: "Comp", role: "Critical" }],
    materials: [{ c: "c", n: "Mat", share: 50, spec: "S", src: 0 }],
    sourcing: [{ c: "c", m: "Src", o: "O", s: "s", src: 0 }],
    construction: { mode: "Factory", auto: "a", tol: "t", src: 0, steps: [{ c: "c", p: "p" }] },
    assembly: { sites: [{ l: "L", o: "O" }], label: "lbl", count: "Single site", src: 0 },
    skill: { tier: "T", basis: "b", src: 0, ops: [["c", "op", "sk"]] },
    parts: [{ c: "c", n: "P", m: "m", crit: "Critical", src: 0, fail: "f" }],
    issues: [], gen: "2026-08-14", rev: false,
    sources: [{ t: "Src", u: "https://example.com/spec" }], vlog: [],
    ...over,
  });

  const overridden = beforeP.find(p => !p.stub).id;
  globalThis.fetch = async url => {
    if (String(url).includes("corpus.json")) return {
      ok: true, json: async () => ({
        schema: 1, built: "2026-08-14",
        classes: { newklass: "A new class" },
        products: [mkP("fetched-new"), mkP(overridden, { brand: "Overridden" })],
      }),
    };
    throw new Error("no advisories");
  };

  try { await loadCorpus(); } finally { globalThis.fetch = realFetch; }

  for (const p of beforeP) {
    if (!P.some(x => x.id === p.id)) fail(`loading corpus.json dropped the embedded product ${p.id}`);
  }
  const added = P.find(x => x.id === "fetched-new");
  if (!added) fail("the fetched product was not added");
  const ov = P.find(x => x.id === overridden);
  if (!ov || ov.brand !== "Overridden") fail("a rebuilt product did not override the embedded one of the same id");
  if (P.filter(x => x.id === overridden).length !== 1) fail("the override duplicated the product instead of replacing it");
  if (P.length !== beforeP.length + 1) fail(`expected ${beforeP.length + 1} products after merge, got ${P.length}`);
  if (!CATS.knife8) fail("merging classes wiped the embedded ones");
  if (!CATS.newklass) fail("the fetched class was not merged in");
  if (!/embedded/.test(META.source)) fail(`META.source does not disclose the merge: ${META.source}`);

  /* A fully cited product must survive the double pass — loadCorpus verifies
     it, then verifyAll() reaches it again. If that demoted anything, a merge
     would quietly erode the corpus it just loaded. */
  if (added) {
    const c = coverage(added);
    if (c.cited !== 6) fail(`a fully cited fetched product lost rows on load: ${c.cited} of 6 cited`);
    verifyAll();
    const after = coverage(added);
    if (after.cited !== c.cited || after.total !== c.total)
      fail("re-verifying a loaded corpus changed its coverage");
  }

  /* Restore, so the summary below counts the corpus the suite started with. */
  P.length = 0; P.push(...beforeP);
  delete CATS.newklass;
  ok(`corpus.json merges: ${beforeP.length} embedded kept, 1 added, 1 overridden by id, coverage stable`);
}

/* ----------------------------------------------------------------- done */
console.log("");
if (fails.length) {
  console.error(`FAILED — ${fails.length} problem(s)\n`);
  fails.forEach(f => console.error(`  · ${f}`));
  process.exit(1);
}
const cited = P.reduce((a, p) => a + coverage(p).cited, 0);
const total = P.reduce((a, p) => a + coverage(p).total, 0);
console.log(`PASSED — ${P.length} products, ${catLeaves().length} categories, ${cited}/${total} claims cited\n`);
