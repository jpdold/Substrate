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

## Search

**Relevance, not exclusion.** The tree used to gate: a query naming a category
returned that subtree and nothing else, so "kitchen knife" could not reach a
camping knife however useful that might be. That rule was dropped on request
2026-08-22. Every term a product matches now adds weight, and a product
matching *all* the terms outranks one matching some — so "kitchen knife" leads
with chef's knives and still shows the outdoor ones underneath.

`scoreOf(p, q)` returns 0 for no match, and the number orders everything else.
Weighted fields, most specific first:

| weight | field |
|---|---|
| 1000 / 400 | identifier, exact / contained |
| 10 | brand and model |
| 6 | category text, **including its synonyms and ancestors** |
| 4 | identifier scheme and value as text |
| 3 | component names |
| 2 | materials and specs |
| 1 | everything else on the report |

Matching every term multiplies by 3, which is what keeps a complete match from
interleaving with partial ones.

**The category field must use `CAT_TEXT`, not `catCrumb`.** `CAT_TEXT` carries
the node's synonyms and its ancestors' names; the breadcrumb carries neither.
"camping" appears in no breadcrumb — it is a synonym on `fixed` — so a camping
knife scored *below* a chef's knife on "camping knife" until this was fixed,
purely because "Knife" is in the chef's knife's model name.

**A term must start a word.** Bare substring matching found "pan" inside
"Com-pan-ion", so a camp knife ranked against "frying pan". A prefix somebody
types still reaches ("knif" → "knife"); the middle of an unrelated word does
not.

**Terms of one character are dropped**, because a single letter lands in
nearly any body of text. A query made only of them scores every product
equally rather than blanking the page — that is what the first keystroke of
incremental typing should do.

**Identifiers win outright.** A UPC is not a description of a thing, it *is*
the thing, so an exact match short-circuits ranking entirely at 1000 and
returns that product alone. `idNorm()` strips everything but letters and
digits, or "0 12345 67890 5" never finds "012345678905". Identifiers live on
`p.ids = [{scheme, value}]`.

**No product in the corpus carries an identifier yet.** The nine embedded
records have none and inventing one would be fabricating the most checkable
field on the page. They arrive with hand-entered items — the add-item form
writes `ids` in the same shape.

---

## Categories

`CATS` is a flat adjacency list — `id: {n, p, syn, d}` — and **a leaf id is a
product's `klass`**, so a product's class *is* its category. One concept, not
two kept in step by hand.

The tree no longer filters, but it is still what makes a query mean anything:
"kitchen" appears on no knife record, only on the category's ancestors, and
"camping" only on a synonym. It contributes weight now rather than a gate.

**A broken `p` pointer silently truncates every path below it** and every
search term derived from one, which is why `test.mjs` walks every parent
before anything else.

**Categories exist independently of the corpus, and an empty one is a
feature.** `emptyMatches()` reports a category the query named that holds
nothing, and the list renders it as *Nothing filed here yet*. "camping knife"
now returns products too, but the empty category is still worth saying: it is
the difference between "we have none of those" and "there is no such thing".
Don't tidy the unpopulated categories away.

`CAT_TEXT` is a built index, rebuilt by `reindexCats()`. Anything that adds a
category must call it, or the new category is unreachable by search while
looking perfectly fine on the page.

---

## Adding an item

The `+` in the header opens `renderAdd()`. It records what an item **is**;
composition comes after and is not in this form.

**Item type is asked first, and the rest of the form follows from it.** Nothing
below step 1 renders until it is answered, because too much depends on it:

| decided by type | how |
|---|---|
| category list | `ITEM_TYPES[k].cats` |
| identifier schemes | `identList(k)` — chemical for raw, trade for everything else |
| default party role | `TYPE_PARTY[k]` |
| whether a party is required at all | `PARTY_OPTIONAL` |
| origin wording | "sourced" for raw, "made or sourced" otherwise |

**"Manufacturer" is wrong for most of the catalogue.** Ore has a producer,
scrap has a processor, and a licensed brand on a box is a licensor rather than
the maker. So the party is a role from `PARTIES` plus a name, the role defaults
from the type, and the name field relabels to match.

**A raw material often has no named party at all**, so `PARTY_OPTIONAL` covers
`raw` and `secondary`. Demanding one there produces an invented answer, which
is the failure this whole project is arranged against.

**Identifiers are a list, not a field.** One object routinely carries a GTIN on
the box and an SKU in a retailer's system. Written as `ids:[{scheme,value}]` —
the same shape products use — so a draft is searchable by barcode the moment it
becomes a record.

**`Unknown` is a scheme, not an absence**, and the distinction is the ethos of
the site in miniature: an empty list means *nobody has looked*, while a row
reading `Unknown` means *somebody looked and nothing is marked*. It saves as
`identifierNote` rather than as a fake identifier.

**Changing type prunes identifiers the new type cannot use** — an ISBN cannot
survive a switch to raw materials — but keeps the ones still valid. It clears
the category outright, since no category is shared between types.

**Only the type change re-renders.** Every other field writes straight through
with `setF()`. Re-rendering on a keystroke moves the caret to the end of the
box, which makes the form unusable and is easy to reintroduce.

**Drafts live in memory and leave as a JSON download** — invariant 4, the same
route the request queue uses. The image rides along as a data URI, hence the
600KB ceiling with a real error rather than a silent truncation.

**`titleCase()` normalises cities on blur, not on keystroke**, so it never
fights the person typing. The particles are the fiddly part — the first
implementation got three wrong — and seventeen forms are asserted in
`test.mjs`: `Port-au-Prince`, `Stratford-upon-Avon`, `O'Fallon`,
`'s-Hertogenbosch`, `Aix-en-Provence`, `Frankfurt am Main`. It is idempotent,
because blur fires again every time the field is revisited.

---

## Items into the catalogue

An entered item and a product are different shapes. The item is classified by
trade — what kind of thing it is, who stands behind it. The product is filed by
use, under a `CATS` leaf, with a component roster. `itemToProduct()` is the
join, `adoptItem()` puts it in `P`, and `saveDraft()` calls it so an added item
is searchable immediately rather than only after an export.

**The trade tree lands in `CATS` as its own branch, marked `trade:true`.**
`Consumer product › Electronics` sits beside `Kitchen › Cutlery › Chef's knife`
and neither nests inside the other. That is the honest arrangement: a
hand-entered item is classified by what it **is**, a curated report is filed by
what it is **for**, and forcing either into the other invents a fact. Nodes are
prefixed `it-` so a trade category can never collide with a curated one.

**An adopted item carries no composition, and says so.** `comps`, `materials`,
`sourcing` and `parts` are empty; `construction` and `skill` are null. Every
section reads *No Data For Now* and the provenance panel says *Entered by hand
— nothing recorded yet about what it is made of*. Do not populate those from
the form: somebody recorded what the thing is, and nobody has taken it apart.

**Origin maps to `assembly`**, because that is the field the report surfaces as
"Production footprint". It is the one composition slot an entered item can fill
honestly.

**`itemId()` is derived from party and name**, so re-importing an export
updates the record in place instead of doubling it. `adoptItem()` upserts, and
`test.mjs` asserts that adopting the same item twice leaves `P` the same
length.

**`dropDraft()` removes the product too.** They were separate lists for one
commit and immediately disagreed.

**`importItems()` accepts `{items:[…]}` or a bare array**, validates each entry
for a name, a known type and a category, adopts what passes and reports what it
skipped by name. A file that is not JSON says so rather than failing silently.

## Editing an entry

`openEdit(id)` reads a product back into the item-shaped form via
`formFromProduct()`, and `saveDraft()` branches on `S.editing`. Two things it
must not do, and both would fail silently:

**It must not change the id.** An id derives from party and name, so correcting
a spelling would otherwise strand the old record and create a second beside it.
The edit branch patches `P` in place and never re-derives.

**It must not touch composition.** A curated report carries a component roster
this form cannot express, so the edit branch writes only identity fields —
brand, model, party, description, ids, image — and leaves `materials`,
`sourcing`, `construction`, `skill` and `parts` exactly as they were.

A product filed in the use tree keeps its category. `formFromProduct()` sets
`keepKlass` and the form renders it read-only rather than asking for a trade
type, because those are different questions and neither answers the other. Only
a trade-filed entry can be reclassified from here.

The site line is only rewritten when this form owns it — an entered item, or a
product with no assembly at all. Otherwise a curated report loses its assembly
sites, label and count to a single city string on an unrelated edit.

---

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
  ids:          [{scheme, value}],                  // UPC, EAN, CAS, SKU…
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

   The index is `searchFields()`. Any new field a reader might search on has
   to be added there with a weight, or it is invisible — and the weight is the
   whole design, so read *Search* above before adding one.

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

**Text has to clear 4.5:1 on `--bg`, and it is worth measuring rather than
eyeballing.** `--fg-3` shipped at 4.18:1 and carries nearly all the small type
on the page — eyebrows, meta lines, sub labels, help text — so the whole site
read faint without any single element looking wrong. `--unknown` renders the
`No Data For Now` marker, which is the one thing a reader most needs to be able
to read, and it was worse. Both were darkened against a computed ratio. The
smallest type was 9px; nothing below 10.5px survives now.

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
