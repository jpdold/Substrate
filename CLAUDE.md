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

## What the code does now

The migration is done. `index.html`, `build-corpus.mjs`, `test.mjs`,
`corpus.json` and the nine embedded reports all run the citation rule; nothing
in the repo still implements the tiers or the axes. What follows describes what
runs.

**Both open questions from the rewrite are settled, by building them.**

*Class silence keys off cited rows.* `classSilence()` asks whether any
researched product in the class has a cited row in a section, rather than
whether any product has an `"e"` in it. The finding survives intact — "no
product in this class has a cited sourcing claim" is the same sentence it always
was — and it now rests on something a reader can check.

*Delta severity is gone rather than redefined.* `SEV.dq` weighted data-quality
differences between products at 22 points. With no axes there are no points, and
banding a coverage difference as "disqualifying at this tier" would be the old
mistake in new units — a verdict about a product derived from a fact about its
paperwork. Products are compared component by component now, which is what the
delta bands were a poor proxy for.

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
  materials:    [{c, n, share, spec, src}],         // c -> comps[].id
  sourcing:     [{c, m, o, s, src, note}],
  construction: {mode, src, auto, tol, steps:[{c, p}]} | null,
  assembly:     {sites:[{l, o}], label, count, src} | null,
  skill:        {tier, src, basis, ops:[[c, operation, skill]]} | null,
  parts:        [{c, n, m, crit, src, fail}],
  uncited:      [{sec, label, row, why}],           // written by verify()
  coverage:     {cited, total},                     // written by verify()
  gen, rev, sources, vlog
}
```

`src` is an index into `sources[]`. **It is the only thing that puts a row in a
table.** There is no certainty field and no score: a row either carries a
citation that resolves or it is not a row, and a parallel confidence field
could only drift away from the citation — the same failure as invariant 1.

`uncited` and `coverage` are not authored, they are computed. `verify()` writes
both, and it is the only thing that should. Anything that hand-sets `coverage`
is asserting a number nobody derived.

**The three singleton sections can be `null`.** `construction`, `assembly` and
`skill` are single objects rather than arrays, so a demotion has nowhere to
remove a row *to* — the slot is nulled and the content moves to `uncited`.
Every consumer needs `p.construction?.mode`, not `p.construction.mode`. This is
the most common way to break a renderer now; `test.mjs` renders a fixture with
all three null for exactly that reason.

**Every `c` must resolve to a declared `comps[].id`.** An orphan row is
unreadable — the reader cannot tell what part it describes — so it is dropped
outright rather than moved to prose, and dropped *before* the citation gate
runs. Pruning second let an orphan ride into the prose inside a demoted parent,
which is a bug that shipped for one commit.

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

   The behavioural comparison runs five payloads because branch coverage is the
   real failure mode here — the wording of the mass-share and nothing-cited
   lines had drifted, and a comparison that ran only the adversarial payload
   passed anyway, since that payload reaches neither branch. `test.mjs` asserts
   every branch is reached; do not delete that check to make a payload edit
   pass.

2. **A class needs at least two peers.** Component comparison and class
   silence both need something to compare against, and `classSilence()`
   declines to classify a gap at all when fewer than two *researched* products
   remain — so a class of one silently loses the sharpest finding on the site.
   Any new functional class ships with a minimum of three products, or two if
   one is a stub.

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

   A demoted claim stays in the text index. Indexing only the cited tables
   would make a product harder to find the less its maker disclosed, which is
   backwards; `proseText()` walks the uncited rows for this reason.

6. **The Method page never transcribes a number.** There is very little left
   for it to get wrong — one rule instead of six weights and three severity
   bands — but `renderMethod()` still counts its coverage figures out of the
   live corpus and reads the review cycle from `META`. Typing either into the
   copy lets the page keep documenting a rule the code stopped following: the
   same drift failure as invariant 1, pointed at the reader. `test.mjs` asserts
   the rendered figure matches the corpus, and that the page does not present
   the removed model as though it were live.

7. **Stubs are not evidence of class silence.** `classSilence()` decides
   whether a gap is an industry norm or this report's own by asking whether any
   researched product in the class has a **cited row** in that section
   (`citedBy()`). Generated peers are `stub` with no component tree, so
   counting them makes every class look silent and turns every disclosure
   failure into "an industry norm" — the exact opposite of the finding. Filter
   `!x.stub` first, and if fewer than two researched products remain, say so
   rather than guessing.

8. **`verifyAll()` runs on every path that admits a product** — at startup, in
   `loadCorpus()` after a corpus is merged, and in `ingest()` after a
   generated product is pushed. Miss one and that product renders its uncited
   claims as though they were cited, with no `coverage` and no `uncited` list,
   which is the single failure the whole site exists to prevent.

   `verify()` is idempotent — it recomputes from the rows, and a demoted
   singleton is already `null` on a second pass — so running it at build and
   again on load is safe. `test.mjs` asserts that directly rather than trusting
   it, and also asserts a fully cited product survives the double pass without
   losing rows.

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

11. **An export carries the absence, not just the values.** `exportRows()`
    ships `coverage`, `cited` (every table claim with the URL it rests on, via
    `citedClaims()`), `uncited` (every demoted claim with the reason),
    `verifierAdjustments` and `reviewed`. A payload of values alone would read
    as a far more complete record than the page it came from, which is the one
    thing the thesis forbids — and a CSV in a spreadsheet has no prose tab to
    carry the other half. The `cited` list is also what makes an export
    checkable without the page: every claim, and the link behind it.

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

Model output is untrusted. Before anything renders, one rule decides everything:

- a row whose `src` resolves to a working `https://` URL stays in its table
- **every other row moves to `uncited`, keeping its content and gaining a reason**
- singleton sections null their slot when they demote, so no renderer can read
  an unsourced object as though it had passed
- rows referencing an undeclared component are dropped outright, before the
  citation gate — an orphan is unreadable in prose too
- a source with no resolvable URL is named once, on its own, because otherwise
  every row citing it fails for no visible reason
- material shares summing over 105% get flagged
- a report where nothing resolves gets called out explicitly

Nothing is deleted and nothing is nulled in place. The old cascade blanked the
fields of anything it downgraded, which destroyed the most interesting content
on the page — one of the two `UNKNOWN` fields on the only pipeline-built report
read `Manufacturer does not disclose POM resin supplier`, and it rendered as a
hatch pattern. Relocating instead of destroying is also what makes it safe to
run the verifier over the hand-written embedded corpus, which is why there is
now one code path and no privileged data.

`verify()` is idempotent. `loadCorpus()` and `verifyAll()` can both reach the
same product, and `test.mjs` asserts a second pass changes neither coverage nor
the prose list.

Every adjustment lands in `vlog` and shows on the report.

**`verify()` cannot tell whether a citation resolves.** It regexes the URL, and
that is all it can do — it runs in the browser too, and a page cannot fetch
another site to check. The first real build produced a claim citing a 404 and
the verifier passed it, reporting zero adjustments. Liveness is checked in
`checkSources()` at build time, where fetching is possible: 404 and 410 blank
the source's `u` (keeping it as `deadUrl`) so the ordinary verifier demotes
everything citing it, while a 403 is a site blocking bots rather than a dead
page and is recorded but left alone. A network failure is never treated as a
dead link.

That mechanism is working and is worth recognising when it fires. On `wusthof`,
source `[0]` — *WÜSTHOF Production (Official)* — carries `u: ""`,
`deadUrl: "https://www.wusthof.com/en-al/production"` and `httpStatus: 404`. It
is the citation behind both the steel sourcing row and `Made in Solingen,
Germany`, so two of that report's three demotions trace to it. Wüsthof took the
page down; the pipeline caught it. Do not "fix" this by restoring the URL.

The verifier catches *uncited* claims mechanically. It cannot catch a real
source saying something wrong, and no automated check can — a live URL says
nothing about whether the page supports the claim. This is why the generation
prompt now insists on attribution (a patent says what was patented, not what a
product is), and why every report ships `rev: false` and displays as
"machine-built, source-checked only" until a person flips it.

---

## Citation coverage

The only number the site computes:

```
coverage = cited claims / all claims × 100
```

It is a fact about the report, not a verdict on the product. A thoroughly
documented cheap object reads 100%, which is correct. Ranking by coverage ranks
how well a manufacturer discloses, and that is the only ranking here.

**Do not build a quality score on top of it.** That is what the six axes were,
and they were measured before being cut: five were the generating pass's own
judgment and came back `material 80, construction 90, assembly 90, skill 80,
superstructure 85` — a ten-point spread, all of it at the top. The sixth was
changed to compute from evidence and immediately came back 38. Any number that
grades the object rather than the evidence lands back in that failure.

## Open work

**Eight of the nine embedded reports cite nothing, and read as pure prose.**
This is the honest state, not a bug: they were written by hand and have never
been through the pipeline, so under the citation rule none of their claims can
sit in a table. They render at 0% coverage with everything under *Not cited*,
and they stay visible rather than being retired — hiding them would misrepresent
how much the site has actually checked. Only `wusthof`, overlaid from
`corpus.json`, has citations, and it reads 12 of 15.

Closing this means researching them through the pipeline, which is deliberate
rather than retro-fitting citations onto the existing text: asking a model to
find a source for a claim already written invites motivated retrieval — it will
find something plausible for whatever it is handed — while researching the
product and reporting only what it can confirm does not. **Expect coverage to
come in well under 100%.** A rebuild that cites nearly everything is the
suspicious outcome, not the good one.

**All nine are queued in `queue.json`, pinned to their existing ids and
classes.** Run `node build-corpus.mjs --max=1` first and read one report before
spending on the rest.

**`corpus/eight-reports` is still unmerged, and its objection has now
dissolved.** Those eight were held back because the pass omitted the certainty
tag on `construction`, `assembly` and `skill` on seven of eight, which poisoned
the class-silence reduction — instant coffee reported construction and assembly
as class-wide silent when the tags were simply missing. There are no tags now,
and class silence reads cited rows, so a missing tag cannot manufacture a false
finding. **The branch still should not be merged as-is**: those reports carry
the old schema (`t` fields, `axes`, no `uncited`), so they would need migrating
through `verify()` on load — which would work, but would produce eight reports
built against a prompt that no longer asks for attribution. Rebuilding is
cheaper than auditing. One report also came back with material shares totalling
397%, which the verifier can only flag.

**The unbranded skillet (`import`) failed on a transient `fetch failed`** and
was never built at all; it needs one retry.

**`corpus.json`'s `vlog` still carries old-model wording** — lines like
"was tagged EXACT without a working source — now UNKNOWN" describe machinery
that no longer exists. It is stale build output, harmless, and replaced on the
next rebuild. Do not hand-edit it.

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
renderer across every product in both pivots. Then runs the verifier against a
deliberately confabulated payload — a row citing a source index that does not
exist, one citing a source with no URL, one citing nothing, and rows bound to
undeclared components — and asserts each is handled correctly.

Load-bearing checks worth knowing about before editing:

- **No uncited row may reach a table.** The thesis as an assertion. It also
  reports when it swept zero rows, because on an all-prose corpus a silent pass
  would mean nothing was tested.
- **`verify()` is character-identical in both files.** The suite diffs the two
  source texts, not only their behaviour on the cases we thought of.
- **The prose tab and the coverage bar agree per product.** If they diverge, one
  is lying about how much of the report can be checked.
- **`cite()` never renders a marker that goes nowhere.** A dead marker looks
  exactly like a citation and is worth less than none.
- **A demoted claim stays searchable.** Indexing only cited tables would make a
  product harder to find the less its maker disclosed, which is backwards.

Run it after any change to the data model or the renderers. It has caught every
regression so far, including two in the migration that produced it.

---

## Conventions

**Colour is semantic, not decorative.** One saturated colour, teal, and it
means one thing: **this is cited.** It is the citation marker, the filled part
of the coverage bar, and nothing else. Anything coloured tells the reader
something about evidence. Don't add an accent colour for emphasis.

Amber is deliberately gone with LIKELY. There is no middle state to colour any
more, and reintroducing a warm accent would imply one exists.

**Copy is plain and active.** Buttons say what happens. Errors say what went
wrong and what to do. No filler, sentence case, no exclamation marks. Empty
states are an invitation to act, not an apology.

**Prose over headers in explanation.** The report itself is dense and tabular;
the writing around it isn't.

**Components are physical parts** — blade, handle, jar, induction seal — not
qualities or categories. If you can't point at it on the object, it isn't a
component.
