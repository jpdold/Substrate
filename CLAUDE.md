# Substrate — working notes

Component-scoped composition reports for consumer products. What each part is
made of, how it was formed, where it came from, and how much of that is
actually confirmed.

Live at `https://jpdold.github.io/Substrate/`.

---

## The thesis, because it constrains everything else

Substrate records what consumer products are made of, part by part, and where
and how they were made. **It does not rate, score, rank or compare them.**

A report is a roster of components plus rows bound to those components. Every
row names the part it describes; nothing is averaged across the whole object.
That is the entire model, and the discipline that keeps it honest is negative:

**Nothing is filled in to look complete.** No value is interpolated from a
peer, a class average, or a plausible default. A field with nothing in it
renders as `No Data For Now`, and every report carries a line saying what that
means — *a fact about this catalogue, not about the product, and most often
nobody has looked.* That disclaimer is load-bearing. Without it an empty field
reads as "the manufacturer won't say", which is a claim we have not earned.

**Every fact says what it is a fact about.** A patent says what a company
patented, a label says what is declared, a spec sheet says what is specified, a
teardown says what was found in one unit. None says what the product *is*, in
the abstract. Write the narrow claim and let the reader draw the inference.

If a change would make a report look more complete without new data behind it,
that change is wrong even if it looks better. That principle predates every
rewrite here and has survived all of them.

---

## What has been removed, and why it is not coming back by accident

Three whole subsystems have been cut. Each was measured before it went, and
each note is here so nobody rebuilds it from first principles and repeats the
measurement.

**Six 0–100 quality axes and a weighted composite.** Five were the generating
model's own judgment and came back `material 80, construction 90, assembly 90,
skill 80, superstructure 85` — a ten-point spread, all of it at the top. The
sixth was changed to compute from evidence and immediately came back **38**.
Scores clustering at the top are a model being agreeable in the shape of an
assessment. Do not build a new number on top of whatever data exists; it lands
back in the same place.

**Three certainty tiers — EXACT, LIKELY, UNKNOWN.** Of fifteen tagged claims on
the one report built end to end: seven, six, two. LIKELY carried 40% of the
report and answered nothing — either a fact can be traced or it cannot. UNKNOWN
fired 13% of the time and its content was the best writing on the page; one of
the two read *Manufacturer does not disclose POM resin supplier*, and the site
rendered it as a hatch pattern.

**Comparison.** Peer deltas, the component matrix, the compare tray, the spec
sheet and the comparison CSV. Removed on request 2026-08-22 as scope the
project does not need.

**Citations, deferred rather than rejected.** The citation gate, coverage,
source lists, the cited/uncited split and the prose channel all went on
2026-08-22. The intent is to rebuild the model later rather than patch the old
one. Until then the site presents unsourced data as fact, which is why the
Method page says so in as many words and every report's provenance panel
carries *Sources are not published yet*. **Do not quietly drop those.**

---

## What the code does now

`index.html` is the whole site. `build-corpus.mjs` generates reports into
`corpus.json`, which merges over the embedded corpus. `test.mjs` boots the
page and exercises everything.

Focus, as of 2026-08-22: **structure, data entry, and presentation.** Corpus
breadth and external data sources are deliberately shelved — there is no free
API giving materials composition for durable goods, and the EU Digital Product
Passport is a compliance and customs instrument, not a data feed.

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

## Categories

`CATS` is a flat adjacency list — `id: {n, p, syn, d}` — and **a leaf id is a
product's `klass`**, so a product's class *is* its category. One concept, not
two kept in step by hand.

The problem it solves: *"kitchen knife" must return kitchen knives and not
camping knives.* Substring search over product text cannot do that, because
every one of them contains the word "knife" — and "kitchen knife" appears in
none of them. So a query resolves against the tree first, and the products come
from the matching node's subtree.

**One matching rule:** a node matches when *every word of the query* appears in
its own name, its synonyms, or the names of its ancestors. That is the whole
algorithm, and it is enough:

| query | reaches | because |
|---|---|---|
| `kitchen knife` | `knife8`, `paring`, `bread` | chain is Kitchen › Cutlery › … |
| `camping knife` | `fixed` | `syn` carries "camping"; chain is Outdoor › Knives |
| `knife` | both branches | genuinely ambiguous — grouped, not guessed |
| `wusthof` | nothing | falls through to product-text search |

The ancestors are what make a query specific. The word "kitchen" appears on no
knife node; it is inherited. **So a broken `p` pointer silently truncates every
path below it and every search term derived from one** — which is why
`test.mjs` walks every parent before anything else.

A node whose own descendant also matched is dropped, or one query reports the
same answer at two depths.

**Categories exist independently of the corpus, and an empty one is a feature.**
`emptyMatches()` reports a category the query named that holds nothing, and the
list renders it as *Nothing filed here yet* with a Request button. That is the
right answer to "camping knife" — the category is real, we have nothing in it —
and it is better than silence, and far better than returning chef's knives.
Don't "clean up" the unpopulated categories.

`CAT_TEXT` is a built index, rebuilt by `reindexCats()`. Anything that adds a
category — `ingest()`, `loadCorpus()` — must call it, or the new category is
unreachable by search while looking perfectly fine on the page.

---

## Data model

A product is a component roster plus rows bound to those components.

```js
{
  id, brand, model, klass, year,          // klass IS a CATS leaf id

  comps:        [{id, n, role}],                    // the spine
  materials:    [{c, n, share, spec}],              // c -> comps[].id
  sourcing:     [{c, m, o, s, note}],
  construction: {mode, auto, tol, steps:[{c, p}]} | null,
  assembly:     {sites:[{l, o}], label, count} | null,
  skill:        {tier, basis, ops:[[c, operation, skill]]} | null,
  parts:        [{c, n, m, crit, fail}],
  gen, rev, vlog
}
```

**There is no evidence field.** No `src`, no `t`, no score. A row holds what
was recorded and nothing about how much to trust it. When citations return they
get a new model rather than the old one.

**The three singleton sections can be `null`** when nothing was recorded for
them. Every consumer needs `p.construction?.mode`, not `p.construction.mode`.
This is the most common way to break a renderer — it is what killed the live
page once, in `renderRail()`'s facet counters — and `test.mjs` renders a
fixture with all three null for exactly that reason.

**Every `c` must resolve to a declared `comps[].id`.** An orphan row is
unreadable — the reader cannot tell what part it describes — so `verify()`
drops it and `test.mjs` fails on one.

The report renders two ways from the same data: **by attribute** (materials,
sourcing, construction… each row chipped with its component) and **by
component** (one panel per part, everything about that part together). Both
pivots must work for every product. Adding a field means handling it in both.

---

## Invariants

These have all been violated once already during development. In rough order of
how much damage they cause:

1. **`verify()` exists in two places** — `index.html` and
   `build-corpus.mjs` — and must stay identical. It runs at build time and
   again in the browser on load. If the two drift, the browser silently
   corrects a corpus that passed its own build, and nobody finds out.

   Do not retype it. The copy in `build-corpus.mjs` is lifted out of
   `index.html` verbatim, and `test.mjs` diffs the two **source texts** as
   well as their behaviour — identical output on the cases we thought of is
   weaker than identical code, and these two had already drifted in their log
   wording once. That is also why `build-corpus.mjs` guards its main flow
   behind `import.meta.url === pathToFileURL(process.argv[1]).href`. Keep that
   guard: an import that hits the top-level API-key check would call
   `process.exit` and take the whole suite down with it.

   The behavioural check runs a payload per branch, because reaching every
   log line is the real failure mode: the wording of the mass-share line had
   drifted once, and a check that ran only the orphan payload passed anyway
   since that payload never reaches it.

2. **A category with one product in it says very little.** Nothing breaks, but
   the facet counts and any future class-level finding need a population to
   mean anything. Aim for three products before a category is worth showing
   off.

3. **No API key in `index.html`, ever.** The site has no network dependency
   beyond two local JSON files. `build-corpus.mjs` reads the key from
   `ANTHROPIC_API_KEY` and runs on the maintainer's machine. This is what makes
   the repo safe to keep public.

4. **No `localStorage`, `sessionStorage`, or any browser storage.** The request
   queue lives in memory and exports as a JSON download. Don't "improve" it into
   persistence.

5. **Search is accent-insensitive** via `norm()` (NFD + diacritic strip).
   "nescafe" must find "Nescafé". Any new searchable field goes through `norm()`.

   **Category resolution comes first, product text second, and the fallback is
   load-bearing.** If `catMatch()` returns nothing, `matches()` drops through to
   the text index — that is what keeps brand search ("wusthof") and prose search
   ("solingen") working. Remove the fallback and every query that is not a
   category name returns zero results.

   The index reads the product's own rows — materials, specs, processes, sites,
   components. Any new field a reader might search on has to be added there or
   it is invisible.

6. **The Method page never transcribes a number or a category.** It counts
   products out of the live corpus and prints the category table straight from
   `CATS`. Typing either into the copy lets the page document something the
   code stopped doing — the same drift failure as invariant 1, pointed at the
   reader. `test.mjs` asserts every live category appears on the rendered
   page.

7. **Stubs are not products.** A `stub` is a record with a name and no data.
   They existed only to give the comparison view something to line up against,
   and `build-corpus.mjs` no longer generates them. Any count, facet or
   class-level finding must filter `!x.stub` first: counting them makes a
   category look populated when nobody has researched anything in it.

8. **`verifyAll()` runs on every path that admits a product** — at startup, in
   `loadCorpus()` after a corpus is merged, and in `ingest()` after a generated
   product is pushed. Miss one and that product keeps its orphan rows, which
   render as claims about a part that does not exist on the roster.

   `verify()` is idempotent, so running it at build and again on load is safe.
   `test.mjs` asserts that directly rather than trusting it.

9. **Reuse a class's existing component ids.** Every class currently shares
   them (`blade`, `edge`, `handle`; `body`, `surface`, `season`). Nothing
   joins on them today, but they are the natural key for anything that ever
   looks across a category, and a product that invents its own is invisible to
   that the moment it is written.

   A related distinction, learned the expensive way and worth keeping: the
   *name* of a material and its *spec* are different fields for a reason. All
   three knives are X50CrMoV15; comparing raw strings calls them different
   because one is 58 HRC and another 56, and loses the fact that the alloy is
   identical.

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

11. **An export says what it does not carry.** `exportRows()` ships the full
    component roster and every recorded row, plus `reviewed` and
    `verifierAdjustments`, and `exportPayload()` carries a `note` stating that
    an absent field was not recorded and that sources are not published. A
    spreadsheet has no disclaimer line of its own, so the payload has to carry
    one — otherwise a blank cell reads as a finding.

    PDF export is `window.print()` against a print stylesheet, not a library.
    Invariant 3 rules out a bundler, so the browser's own print-to-PDF is the
    only honest route; the stylesheet repaints to ink-on-paper rather than
    printing a dark UI.

12. **`corpus.json` merges over the embedded corpus — it never replaces it.**
    `loadCorpus()` verifies each fetched product, then upserts it into `P` by
    id. The old `P.length=0` would drop eight products from the site the moment
    a one-product `corpus.json` landed. A rebuilt product overrides the
    embedded one of the same id, which is how a machine-built report corrects a
    seeded one — `wusthof` is the live example, and the only reason any table
    on the site has rows in it.

    The reason this invariant was originally written no longer applies, and the
    change is worth understanding rather than reverting: `verify()` used to
    null the fields of anything it downgraded, so running it over the embedded
    nine erased them. It relocates now, so they survive it — visible, honest,
    and at 0% coverage.

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
    stubs would drag its class-silence reduction toward "nobody cites this".
    Dedupe keys on the id *and* the slug — a product can arrive queued unpinned
    and again from `--stale` pinned, and keying on either alone pays for the
    same research twice.

14. **Stubs render.** Generated peers have no component tree. `quickView` and
   `fullView` both short-circuit on `p.stub`. Anything new that walks
   `p.materials[0]` or `p.parts[1]` needs a length guard — that exact bug has
   been fixed twice.

---

## The verifier

Two checks, and neither was ever about evidence:

- a row bound to an undeclared component is **dropped** — it cannot be read
  wherever it lands
- material shares summing over 105% are **flagged** — the numbers on the page
  contradict each other

That is all that is left. It runs at build time and again in the browser on
load, it is idempotent, and it no longer moves, nulls or relocates anything.

---

## Open work

**Citations need a new model.** Deferred, not abandoned. The old one is
described above under what was removed; read that before designing the next
one, particularly the part about a well-cited wrong claim being the failure
nothing mechanical catches.

**Class silence was cut with the citation machinery and is worth rebuilding.**
`classSilence()` answered *"no product in this class records where it is
made"*, distinguishing an industry norm from one manufacturer's gap. It keyed
off cited rows; the same finding computes just as well off data presence, and
it was the sharpest thing the site said.

**Corpus breadth.** Nine products across three populated categories. Six more
categories exist with nothing filed under them, which is deliberate — see
*Categories*.

**Data entry has no path yet.** `build-corpus.mjs` generates reports with a
paid model. There is no way to hand-author a product, which is what the current
focus actually needs.

**Sidebar facets list leaves flat** rather than as the tree that now exists.

**The unbranded skillet (`import`)** failed on a transient `fetch failed` and
was never built; it needs one retry.

**Before the first rebuild PR is merged**, set `ANTHROPIC_API_KEY` in Settings →
Secrets and variables → Actions, and run the workflow once by hand
(`workflow_dispatch`) with `max: 1`.

---

## Testing

```
node test.mjs
```

Extracts the script block from `index.html`, stubs the DOM, and runs every
renderer across every product in both pivots. Then runs the verifier against a
deliberately confabulated payload — a row citing a source index that does not
exist, one citing a source with no URL, one citing nothing, and rows bound to
undeclared components — and asserts each is handled correctly.

Load-bearing checks worth knowing about before editing:

- **Section 0 boots the whole script block** in a `vm` context and drives every
  view. It exists because the suite once loaded only the DOM-free half and
  passed fifty-two checks over a page that was dead on arrival.
- **It scans the rendered markup for every `on*=` attribute** and checks each
  named function exists, rather than testing a list typed from memory.
- **It greps the whole file for removed vocabulary** — the tiers, comparison,
  citations. The hero, legend and footer are static HTML that no renderer
  touches, and they described the tiers for four commits after the code
  stopped implementing them.
- **`verify()` is character-identical in both files.** The suite diffs the two
  source texts, not only their behaviour on the cases we thought of.
- **Every product carries data.** With no gate left, a product rendering
  nothing is a data problem, and that is the failure worth catching while the
  corpus is grown by hand.

Run it after any change to the data model or the renderers. It has caught every
regression so far, including two in the migration that produced it.

---

## Conventions

**Colour is nearly absent, and that is the design.** One saturated colour,
teal, used for the wordmark, links and the active tab. Nothing on a report is
coloured to grade it, because nothing on a report is graded. Don't add an
accent colour for emphasis, and don't reintroduce a warm one — amber went with
the middle tier and would imply a middle state exists.

**The ground is drafting paper.** A milky blue-green with a dotted 72px grid —
0.75in, since CSS pins an inch to 96px. It has to be built from radial
gradients: a `linear-gradient` fills the whole perpendicular axis of its tile,
so any attempt at a dashed rule comes out as a solid band. Cards carry an
opaque `--bg-2`, so the grid reads in the margins rather than under the text.

**Copy is plain and active.** Buttons say what happens. Errors say what went
wrong and what to do. No filler, sentence case, no exclamation marks. Empty
states are an invitation to act, not an apology.

**Prose over headers in explanation.** The report itself is dense and tabular;
the writing around it isn't.

**Components are physical parts** — blade, handle, jar, induction seal — not
qualities or categories. If you can't point at it on the object, it isn't a
component.
