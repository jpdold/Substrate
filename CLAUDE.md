# Substrate — working notes

Component-scoped composition reports for consumer products. What each part is
made of, how it was formed, where it came from, and how much of that is
actually confirmed.

Live at `https://jpdold.github.io/Substrate/`.

---

## The thesis, because it constrains everything else

Most product comparison sites hide missing data. This one shows it. Every field
carries a certainty tag, and **UNKNOWN renders as a visible hatched gap, never
as an estimate**. A report with holes in it is the correct output when the holes
are real.

If a change would make a report look more complete without new evidence behind
it, that change is wrong even if it looks better. This is the one principle to
check a proposed change against.

---

## Layout

```
index.html          the entire site — no build step, no dependencies
build-corpus.mjs    Node script, runs on the maintainer's machine only
corpus.json         composition data. Not committed yet; site falls back to embedded
advisories.json     recalls and safety notices, refreshed independently
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

1. **`verify()` exists in two places** — `index.html` and `build-corpus.mjs` —
   and they must stay identical. It runs at build time and again in the browser
   on load. If they drift, the browser silently corrects a corpus that passed
   its own build, and nobody finds out. Change one, change both.

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
   generated product is pushed. Miss one and that product's score runs on the
   pass's judged sourcing number while every other product's runs on evidence,
   which makes the ranking incomparable without anything looking wrong.
   `deriveAxes()` recomputes from the rows and never from the axis it wrote, so
   calling it twice is safe.

9. **Stubs render.** Generated peers have no component tree. `quickView` and
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

The verifier catches *unsourced* claims mechanically. It cannot catch a real
source saying something wrong. That's why every report ships `rev: false` and
displays as "machine-built, source-checked only" until a person flips it.

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

**Delta matrix should pivot by component.** Right now deltas compare whole
objects. "Same alloy, different forming" is a component-level fact — comparing
the Wüsthof blade against the Victorinox blade is the comparison a reader wants,
and whole-object scoring blurs it.

**Compare tray and export are stubs.** Both `alert()`. The tray collects
selections correctly; the side-by-side workspace with user weighting isn't
built. Export should produce PDF, structured JSON, and a comparison sheet.

**Scheduled rebuild.** A GitHub Action running `build-corpus.mjs` monthly and
opening a PR rather than committing to main. The PR *is* the `rev: false` review
gate. Key goes in repo secrets.

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
