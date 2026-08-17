# Substrate — working notes

Component-scoped composition reports for consumer products. What each part is
made of, how it was formed, where it came from, and how much of that is
actually confirmed.

Live at `https://jpdold.github.io/Substrate/`.

---

## The thesis, because it constrains everything else

Substrate reports what consumer products are made of, part by part, and shows
where each fact came from.

**A claim in a table carries a citation, or it is not in the table.** No
confidence tier, no score, no estimate. A reader can follow any row to a source
and check it, and that is the whole promise.

**What isn't sourced is written as prose underneath — not hidden, not hatched.**
"Wüsthof does not publish its POM resin supplier" is a sentence, and often the
most interesting one on the page. Non-disclosure in consumer manufacturing is a
finding, not an error state, and it deserves better than a texture. Prose is
also where inference lives: reasoning that names what it reasons *from*, so a
reader can weigh it the way they weigh any writing.

Two kinds of content, then. A table trustworthy row by row, and prose that says
plainly what the table can't carry. Nothing in between, and nothing graded.

**Every row says what it is a fact about.** A patent says what a company
patented. A label says what is declared. A spec sheet says what is specified. A
teardown says what was found in one unit. None of them says what the product
*is*, in the abstract. So attribution is not hedging — it is the fact.
`Wüsthof patented a cold-forging method for blade blanks` and `this blade is
cold-forged` are different claims, and the patent supports only the first. Write
the first and the reader draws the inference themselves, which is the whole
arrangement: show the evidence, name its scope, let them decide.

This is also why the axes had to go. `58 HRC per the manufacturer's spec sheet`
is a fact with a subject. `Good steel` is a verdict with none.

If a change would make a report look more complete without new evidence behind
it, that change is wrong even if it looks better. That principle predates this
rewrite and survives it unchanged — it is still the one thing to check a
proposed change against.

---

## Why the tiers and the scores went

Both were measured before being cut, against `wusthof` — the only report that
has been through the pipeline end to end.

**The axes were not measuring anything.** Five of the six are the generating
pass's judgment, and they came back `material 80, construction 90, assembly 90,
skill 80, superstructure 85` — a ten-point spread, all of it at the top. The
sixth, `sourcing`, is the one that was changed to compute from evidence. It came
back **38**. One axis got grounded and immediately halved. Scores clustering at
80–90 are a model being agreeable in the shape of an assessment, and five of
them were shipping as if they meant something.

**The middle tier carried the most and justified the least.** Of fifteen tagged
claims: seven EXACT, six LIKELY, two UNKNOWN. LIKELY was 40% of the report, and
there is no good answer to what a reader does with "likely" — either a fact can
be traced or it can't. The tier was hedging with a colour attached.

**UNKNOWN was rare, and its content was the best on the page.** Two fields in
fifteen, so the hatched gap — the site's entire visual signature — fired 13% of
the time. One of the two read `Manufacturer does not disclose POM resin
supplier`. That is a real finding about how the knife trade works, and rendering
it as a hatch pattern buried it.

The tiers were doing one job worth keeping: forcing the generating pass to
distinguish what it found from what it assumed. That job now belongs to the
citation itself. A row without a resolving source does not reach the table, so
the pass cannot smuggle an assumption in by picking a softer tag.

---

## What the code still does

**Nothing below this line has been changed yet.** `index.html`,
`build-corpus.mjs` and `test.mjs` all still implement the three-tier model, and
the nine reports on disk are tagged `e`/`l`/`u` throughout. Read every section
that follows as a description of what currently runs, not of what is intended:

- **Data model** — `t` is still on every row
- **Invariants 1, 6, 7, 8, 11** — all downstream of the tiers, via
  `deriveAxes()`, the `SEV` bands, class silence, and the certainty fields in
  exports
- **The verifier** — the `e → l → u` cascade *is* the tier machinery
- **Derived axes** — the whole section goes when the axes go
- **Conventions** — "the only saturated colours are the three certainty tags"

Migrating the data is mechanical: `e` and `l` rows with a resolving `src` become
cited rows, everything else becomes prose. Migrating the renderers is the real
work. Two of the four questions below are settled; two remain.

**Settled — `t` is dropped entirely.** A resolving `src` is what admits a row to
the table, so the citation *is* the tag, and a parallel field could only drift
away from it — the same failure as invariant 1, which took two rounds of hollow
tests to catch. The cost, accepted: the generating pass loses a place to record
its own confidence before the verifier sees it. If that turns out to matter, the
answer is a better source, not a softer tag.

**Settled — absence is attributed too.** Neither "does not disclose" nor "no
source found" is right, because both describe the searcher rather than the
source. Write what was checked: *not stated on the packaging*, *not in the
manufacturer's published spec sheet*. That claims nothing about the
manufacturer's intent, and it tells the reader where looking further would start.

**What replaces the Gap Report and class silence?** They were the sharpest
things here and both compute off `u`. "No product in this class discloses X" is
a genuine finding and should survive in some form, but it needs a new
input — probably which fields have no cited row across the class's researched
products.

**What happens to delta severity?** `SEV.dq` weighted data-quality differences
between products at 22. With no tiers there is no data-quality axis, so either
that band goes or it is redefined against citation coverage.

---

## Layout

```
index.html          the entire site — no build step, no dependencies
build-corpus.mjs    Node script; runs locally or in the rebuild workflow
queue.json          tracked. What to research next; the scheduled run reads it
corpus.json         machine-built reports, MERGED over the embedded corpus
advisories.json     recalls and safety notices, refreshed independently
.github/workflows/  monthly rebuild, opens a PR — never writes to main
```

`index.html` is deliberately one file with no imports, no npm, no bundler. Keep
it that way. It must run opened directly off disk.

---

## Data model

A product is a component roster plus rows bound to those components.

```js
{
  id, brand, model, klass, year,
  axes: {material, sourcing, construction, assembly, skill, superstructure},  // 0-100
  comps:        [{id, n, role}],                    // the spine
  materials:    [{c, n, share, spec, t}],           // c -> comps[].id
  sourcing:     [{c, m, o, s, t, note}],
  construction: {mode, t, auto, tol, steps:[{c, p}]},
  skill:        {tier, t, basis, ops:[[c, operation, skill]]},
  parts:        [{c, n, m, crit, t, fail}],
  gen, rev, sources, vlog
}
```

`t` is the certainty tag: `"e"` EXACT, `"l"` LIKELY, `"u"` UNKNOWN.

**Every `c` must resolve to a declared `comps[].id`.** An orphan row is
unreadable — the reader cannot tell what part it describes. The verifier drops
orphans and `test.mjs` fails on them.

The report renders two ways from the same data: **by attribute** (materials,
sourcing, construction… each row chipped with its component) and **by
component** (one panel per part, everything about that part together). Both
pivots must work for every product. Adding a field means handling it in both.

---

## Invariants

These have all been violated once already during development. In rough order of
how much damage they cause:

1. **`verify()` and `deriveAxes()` exist in two places** — `index.html` and
   `build-corpus.mjs` — and must stay identical. They run at build time and
   again in the browser on load. If they drift, the browser silently corrects a
   corpus that passed its own build, and nobody finds out. Change one, change
   both.

   `test.mjs` now imports both copies and diffs them, so this is enforced
   rather than remembered — which is why `build-corpus.mjs` guards its main
   flow behind `import.meta.url === pathToFileURL(process.argv[1]).href`. Keep
   that guard: an import that hits the top-level API-key check would call
   `process.exit` and take the whole suite down with it.

   The comparison runs four payloads because branch coverage is the real
   failure mode here — the wording of the mass-share and nothing-confirmed
   lines had drifted, and a comparison that ran only the adversarial payload
   passed anyway, since that payload reaches neither branch. `test.mjs` asserts
   every branch is reached; do not delete that check to make a payload edit
   pass.

2. **A class needs at least two peers.** `deltas()` reduces over the peer array
   and throws on an empty one. Any new functional class ships with a minimum of
   three products, or two if one is a stub.

3. **No API key in `index.html`, ever.** The site has no network dependency
   beyond two local JSON files. `build-corpus.mjs` reads the key from
   `ANTHROPIC_API_KEY` and runs on the maintainer's machine. This is what makes
   the repo safe to keep public.

4. **No `localStorage`, `sessionStorage`, or any browser storage.** The request
   queue lives in memory and exports as a JSON download. Don't "improve" it into
   persistence.

5. **Search is accent-insensitive** via `norm()` (NFD + diacritic strip).
   "nescafe" must find "Nescafé". Any new searchable field goes through `norm()`.

6. **The Method page never transcribes a number.** `renderMethod()` reads the
   weights from `DEFAULT_W`, the delta bands from `SEV`, and the review cycle
   from `META`. Typing one of those values into the copy lets the page keep
   documenting a rule the code stopped following — the same drift failure as
   invariant 1, but pointed at the reader. `test.mjs` asserts the rendered page
   matches the constants.

7. **Stubs are not evidence of class silence.** `classSilence()` decides whether
   a gap is an industry norm or this manufacturer's choice by asking whether any
   product in the class confirms that kind of field. Generated peers are `stub`
   with no component tree, so counting them makes every class look silent and
   turns every disclosure failure into "an industry norm" — the exact opposite
   of the finding. Filter `!x.stub` first, and if fewer than two researched
   products remain, say the gaps are unclassified rather than guessing.

8. **`deriveAll()` runs on every path that admits a product** — at startup, in
   `loadCorpus()` after the corpus is swapped, and in `ingest()` after a
   generated product is pushed. `build-corpus.mjs` derives too, in
   `toProducts()`, so `corpus.json` carries the same sourcing figure the site
   displays and the review PR is reviewing the number that ships. Miss one and
   that product's score runs on the pass's judged sourcing number while every
   other product's runs on evidence, which makes the ranking incomparable
   without anything looking wrong. `deriveAxes()` recomputes from the rows and
   never from the axis it wrote, so calling it twice — once at build, once on
   load — is safe and preserves the pass's original in `srcAdj.model`.

9. **Component ids are the join key across a class, and comparison happens on
   the attribute key, not the raw string.** `compDeltas()` matches parts between
   products by `comps[].id` — every class currently shares them (`blade`,
   `edge`, `handle`; `body`, `surface`, `season`). A new product that invents
   its own ids still renders, it just silently compares against nothing, so
   reuse the class's existing ids. And compare the *name* separately from the
   *spec*: all three knives are X50CrMoV15, and a raw string comparison calls
   them different because one is 58 HRC and another 56 — losing the finding the
   view exists for.

10. **The build request is pinned on both sides, and `test.mjs` asserts it.**
    `build-corpus.mjs` runs `claude-sonnet-5` with `max_tokens` at 16000 — and
    that number is bounded in *both* directions. This model thinks by default
    and `max_tokens` caps thinking plus response text together, so a lower value
    truncates the report mid-JSON; the call is not streamed, so a higher one
    risks an HTTP timeout. Moving it means switching to a streaming request.

    Three related rules: state `thinking` explicitly rather than inheriting it
    (the previous model defaulted it off, so an unstated default silently
    changes behaviour with the model); never declare `code_execution` alongside
    `web_search_20260209`, which already runs it internally for filtering; and
    leave the `pause_turn` continuation in place — a stalled server-tool loop
    otherwise returns a partial report that parses as "no JSON object in
    response".

11. **An export carries the absence, not just the values.** `exportRows()` ships
    `missing`, `inferred`, `certainty`, `sourcingAxis` (the pass's original
    alongside the derived figure), `verifierAdjustments`, and `reviewed`. A
    payload of values alone would read as a far more complete record than the
    page it came from, which is the one thing the thesis forbids — and unlike
    the page, a CSV in a spreadsheet has no hatched gap to make absence visible.
    The comparison sheet labels every axis `derived from evidence` or
    `pass judgment, unverified` for the same reason.

    PDF export is `window.print()` against a print stylesheet, not a library.
    Invariant 3 rules out a bundler, so the browser's own print-to-PDF is the
    only honest route; the stylesheet repaints to ink-on-paper rather than
    printing a dark UI.

12. **`corpus.json` merges over the embedded corpus — it never replaces it.**
    `loadCorpus()` verifies each fetched product, then upserts it into `P` by id.
    This is not a style choice: the embedded nine carry no `sources`, no `src`
    indices and no `why`, so putting them through `verify()` nulls every field
    they have — measured at 104 adjustments, all nine to 0% confirmed. The old
    `P.length=0` would therefore have blanked the live site the moment a
    `corpus.json` landed. A rebuilt product overrides the embedded one of the
    same id, which is how a machine-built report can correct a seeded one.

    `build-corpus.mjs` will not write `corpus.json` unless something was
    actually built, for the same reason — a no-op `--stale` run would otherwise
    create an empty corpus.

13. **A rebuild of an existing product must pin its `id` and `klass`.** Both are
    otherwise derived from whatever brand, model and class-label strings the
    generating pass returned *that run* — so re-researching `wusthof` yields
    `wusthof-classic-8in-cook-s-knife` in a brand-new class, and the merge adds
    it beside the original instead of replacing it, severed from its own peers.
    That makes `--stale` silently duplicating rather than refreshing, which is
    what it did when first written.

    A queue entry pins with `{"q": …, "id": …, "klass": …}`; `--stale` carries
    both from the product it is refreshing. A pinned class also suppresses the
    two generated stub peers, since that class already has researched ones and
    stubs would drag its class-silence reduction toward "nobody discloses this".
    Dedupe keys on the id *and* the slug — a product can arrive queued unpinned
    and again from `--stale` pinned, and keying on either alone pays for the
    same research twice.

14. **Stubs render.** Generated peers have no component tree. `quickView` and
   `fullView` both short-circuit on `p.stub`. Anything new that walks
   `p.materials[0]` or `p.parts[1]` needs a length guard — that exact bug has
   been fixed twice.

---

## The verifier

Model output is untrusted. Before anything renders:

- `t: "e"` whose `src` index doesn't resolve to a working `https://` URL → `"l"`
- `t: "l"` with no `why` (inference chain) → `"u"`
- anything landing on `"u"` has its value nulled, so it renders as a gap
- rows referencing an undeclared component are dropped
- material shares summing over 105% get flagged
- a report with no `"e"` field anywhere gets called out explicitly

Every adjustment lands in `vlog` and shows on the report. The downgrade cascade
(`e → l → u`) logs one line, not two.

**`verify()` cannot tell whether a citation resolves.** It regexes the URL, and
that is all it can do — it runs in the browser too, and a page cannot fetch
another site to check. The first real build produced an EXACT claim citing a
404 and the verifier passed it, reporting zero adjustments. Liveness is now
checked in `checkSources()` at build time, where fetching is possible: 404 and
410 blank the source's `u` so the ordinary cascade downgrades everything citing
it, while a 403 is a site blocking bots rather than a dead page and is recorded
but left alone. A network failure is never treated as a dead link.

Keep the Method page honest about this. It previously said an EXACT claim holds
"only while its source index points at a working URL" and would be "downgraded
on the next load" — neither was true, and overstating the check is precisely
the failure the site exists to expose.

The verifier catches *unsourced* claims mechanically. It cannot catch a real
source saying something wrong, and no automated check can — a live URL says
nothing about whether the page supports the claim. The first build cited a
retailer listing and a forum thread behind EXACT tags; both resolve. That is
why every report ships `rev: false` and displays as "machine-built,
source-checked only" until a person flips it.

---

## Derived axes

Five of the six axes are the generating pass's judgment. **Sourcing is not** —
it is computed from the report's own sourcing rows:

```
sourcing = ( EXACT + 0.5·LIKELY ) / sourcing rows × 100
```

Sourcing is the only axis where disclosure and the property being scored are
the same thing: traceability nobody discloses is not traceability. The pass had
been scoring it above what disclosure supports on seven of nine products, by as
much as 41 points.

**Do not extend this to the other five.** It was measured, and the note that
used to live here — that certainty density "already measures nearly the same
thing" — is wrong. Sourcing was in fact the *worst*-tracking axis of the six
(mean absolute difference 25.2). Two separate reasons block the rest:

- **material, superstructure** — multi-row, so they would grade smoothly, but
  disclosure ≠ quality. A thoroughly documented cheap steel is still a cheap
  steel; deriving these would score paperwork and call it quality.
- **construction, assembly, skill** — one tagged field each, so a derived score
  could only ever be 0, 50, or 100. Too coarse to rank with. (Skill's r=0.96
  against density is an artifact of that coarseness, not a good fit.)

The pass's original number is kept in `p.srcAdj` and shown on the report
wherever it differs, so a published number is never revised in silence.

## Open work

**Five axis scores are still judgment.** Sourcing is derived (see below); the
other five remain the generating pass's unverified opinion. There is no
arithmetic fix for them — see the reasoning in *Derived axes* before trying
one. Closing this properly means source-checking the axes themselves, not
computing them from disclosure.

**The embedded nine claim EXACT without citations.** Not one of the products in
`index.html` carries a `sources` array, a `src` index, or a `why`. They were
written by hand and have never been through the verifier, which only ever runs
on `corpus.json`. So the site displays EXACT tags on claims with no link behind
them, while the Method page tells the reader an EXACT claim "carries a link that
resolves" — the site does not currently meet the rule it exists to enforce.

This is measured, not suspected: running the nine through `verify()` produces
104 adjustments and takes every one of them to 0% confirmed, because a source
that does not exist cannot resolve. Do not attempt to fix it by adding a blanket
`why` to make them pass as LIKELY — a generic string is not an inference chain,
and buying a pass from the verifier with one is exactly the move the thesis
forbids.

**Where this stands.** Wüsthof is researched, reviewed and published — it is the
only product on the live site with citations, and the only one whose provenance
panel renders. The other eight were built on branch `corpus/eight-reports` but
are **not** merged, for the reason below. The unbranded skillet (`import`) failed
on a transient `fetch failed` and was never built at all; it needs one retry.

*Do not merge that branch as it stands.* Those reports were built before the
schema note required a certainty tag on `construction`, `assembly` and `skill` —
the three fields that are single objects rather than array rows — and the pass
omitted it on seven of eight, costing twelve claims. That is safe in itself, but
it poisons the class-silence reduction: instant coffee now reports construction
and assembly as class-wide silent when in truth the tags were simply missing.
Publishing that states something false about an industry, which is worse than
stating nothing. The prompt is fixed; re-run the seven and the finding becomes
trustworthy. One report also came back with material shares totalling 397%,
which the verifier can only flag — that rule is now in the schema note too.

**All nine are queued in `queue.json`, pinned to their existing ids and
classes.** Run `node build-corpus.mjs --max=1` first and read one report before
spending on the rest. Researching them through the pipeline is deliberate rather
than retro-fitting citations onto the existing text: asking a model to find a
source for a claim already written invites motivated retrieval — it will find
something plausible for whatever it is handed — while researching the product
and reporting only what it can confirm does not. Expect certainty to *fall*.
Claims that survive as EXACT will be genuinely cited; the rest should land as
LIKELY with a real inference chain, or as gaps. A rebuild that leaves the
confirmed percentages roughly where they are is the suspicious outcome, not the
good one.

**Before the first rebuild PR is merged**, set `ANTHROPIC_API_KEY` in Settings →
Secrets and variables → Actions, and run the workflow once by hand
(`workflow_dispatch`) with `max: 1` to watch a real build end to end before
letting the schedule spend anything unattended.

---

## Testing

```
node test.mjs
```

Extracts the script block from `index.html`, stubs the DOM, and runs every
renderer across every product in both pivots. Also runs the verifier against a
deliberately confabulated payload — bad source index, missing inference basis,
invalid tag, orphan rows — and asserts it catches all of them.

Run it after any change to the data model or the renderers. It has caught every
regression so far.

---

## Conventions

**Colour is semantic, not decorative.** The only saturated colours on the page
are the three certainty tags — teal EXACT, amber LIKELY, dim slate UNKNOWN.
Anything coloured tells the reader something about evidence. Don't add an accent
colour for emphasis.

**Copy is plain and active.** Buttons say what happens. Errors say what went
wrong and what to do. No filler, sentence case, no exclamation marks. Empty
states are an invitation to act, not an apology.

**Prose over headers in explanation.** The report itself is dense and tabular;
the writing around it isn't.

**Components are physical parts** — blade, handle, jar, induction seal — not
qualities or categories. If you can't point at it on the object, it isn't a
component.
