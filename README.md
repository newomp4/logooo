# logooo

Geometric logo marks, symmetric by default. Press space, get a mark, copy it as SVG or PNG.

![logooo](docs/screenshot.png)

Every mark is built the way you'd build it in Illustrator: exact circles, ellipses, rounded rectangles, polygons, arcs and round-capped strokes, combined with boolean ops (union, subtract, intersect, and XOR, where overlaps cancel out). Softness comes from true tangent-arc fillets on corners (`src/gen/shapes.js`), like Illustrator's live corners. Nothing is traced, so the output is a clean vector path with only as many points as the shape needs.

## Styles

Most styles grow from a **reference recipe**: one of the logos this was modelled on, written down as primitives in slots (`src/gen/blend.js`):

- **piece:** the shape being repeated (an oval, a leaning or chamfered slab, a half or quarter disc, rounded blocks, a kite, a bent stroke)
- **layout:** how the copies sit (a ring, bars through the middle, a 180° pair, a row, four mirrored corners), and whether overlaps merge or cancel out
- **container:** an outer shape the pieces are cut out of, or that is the ink itself
- **cut:** a slit that opens into a star, diamond or lens; a stepped or S-curved channel; a centre opening; a round trim
- **core:** a dot, diamond or star in an empty middle
- **round:** one corner radius for the whole mark

Each recipe also says how far its numbers may move. A new mark is a recipe with some of its numbers re-rolled inside those ranges, or two recipes crossed: a slot moves across from another recipe (an asterisk carved out of a squircle, a Z block cut from a circle), and when both use the same kind of part their numbers are blended. So marks land on and between the references, not far from them. Pieces only go in layouts they read well in: lopsided pieces never go in a ring, where turned copies make pinwheels.

| Style | What it makes |
| --- | --- |
| Split | A circle, squircle, hexagon or pill split down the middle, the split opening into a concave star, diamond or lens |
| Channel | A rounded square or circle with a stepped or S-curved channel through it |
| Zed | Two leaning or chamfered slabs overlapping into a Z |
| Halves | Two disc segments joined along their flat sides into an S |
| Quarters | Quarter discs or quarter rings in four corners, every other one turned outward |
| Quads | Rounded blocks (L, step, tee, zig) mirrored into four corners |
| Arches | Tall ovals whose overlaps cancel out, split into an M over a W |
| Ovals | Big ovals with thin gaps, reading as one round body |
| Beads | A ring of small ovals or dashes |
| Kites | A polygon cut into slightly turned kites |
| Asterisk | Thick bars through the middle, round-ended or trimmed by a circle |
| Window | A solid shape with a star or lens window and a dot inside |
| Strokes | A bent stroke and its 180° turn |
| Bloom | Circles on a grid or ring melted into a scalloped frame (the circle-grid look) |
| Cloud | Circles bunched and filleted into a soft body, filled or outlined, sometimes with eyes |

Two candidates are grown for each mark and one of those scoring close to the best is picked at random (`appeal()` in `legibility.js`). The score rewards balanced ink, real negative space and a few strong pieces.

### Symmetric only

On by default: every mark has mirror and/or rotational symmetry. Switch it off and some marks come out slightly off balance instead: a cut moved off the middle, or one piece a little smaller. Their visual centre of mass still has to sit near the middle of the mark.

### Quality checks

Before a mark is shown it has to pass two checks, or it's rerolled:

- **Geometry:** no slivers, no specks, balanced ink coverage, intact symmetry (a failed boolean op breaks it), and not too flat. It also rejects things that read as accidents: a nest of convex shapes around one centre (a disc, a plain ring, a target), a plain blob with a nick out of it, a grid of plain boxes, two or three plain pieces, bare dots, and leftover boolean slivers.
- **Never:** a plain plus or X, a figure-8, or a hooked cross in either direction. Every mark's silhouette is compared against those templates and rejected if it's close (the hooked cross only for marks that turn in steps of 90° without mirroring).
- **Even:** no knobs, hooks or tails, meaning little protrusions off a bigger body, measured as the ink a 7%-wide opening removes.
- **Clean corners:** marks can't keep a sharp corner or a seam bump. Hair-thin edges that booleans leave where curves meet are merged before filleting, so they can't pin a corner sharp.
- **Close together:** if any piece sits further than about a fifth of the mark's size from its nearest neighbour, the mark is rejected.
- **Legibility** (`src/gen/legibility.js`): the mark is rasterized at 64px, the way it would appear as an app icon, and scored on ink thinner than ~5% of its size, gaps narrower than that, specks, how many separate pieces and holes the eye would count, and small satellites floating away from the main body. Busy marks score high and get dropped.

### Fewer repeats

Every mark gets a 32×32 silhouette fingerprint. A new mark that overlaps one of your last 40 by 80% or more is swapped for a fresher one, and the styles of your last six marks are picked much less often.

## Use

```sh
npm install
npm run dev
```

| Key | Action |
| --- | --- |
| `space` / `n` | New mark |
| `←` `→` | Browse the open tab (History or Saved) |
| `v` | Find 8 variations of the current mark |
| `f` | Save / unsave the current mark |
| `x` | Not for me: hide this mark and anything that looks like it |
| `c` | Copy SVG |
| `p` | Copy PNG (1024px, transparent) |
| `l` | Copy a link to the mark |
| `s` | Download SVG |

- **Ink** sets the export colour (black or white).
- **History** keeps the last 240 marks; **Saved** keeps the ones you star. Both live in localStorage.
- **Links:** the URL hash holds the style and seed, so a link like `/#split.k3j9x2` always rebuilds the same mark (`.x` on the end means asymmetric marks were allowed).
- **Previews:** inside the main card the mark is shown as light, dark and flat-colour app icons, and at 32px and 16px. Click an icon to put the big mark on that background.
- **Hidden:** marks you hide (✕) are remembered by silhouette; anything 72% alike or more is skipped from then on. "Show again" resets it.
- **Taste:** styles you star come up more often and styles you hide come up less (up to 3× either way). It's per style, so links still rebuild the same mark.

## Layout

```
src/
  gen/
    rng.js        seeded PRNG
    geom.js       primitives, layouts, booleans, clean-up and checks
    shapes.js     exact strokes, arcs, wedges and live-corner fillets
    legibility.js icon-size raster check, symmetry detection, balance, plainness, fingerprints
    blend.js      the reference recipes, and re-rolling and crossing them
    families.js   the styles (recipes plus bloom and cloud) and their weights
    index.js      generate(seed, family)
  export.js       SVG / PNG / clipboard
  palette.js      flat colour pairs for the colour icon
  main.js         UI
scripts/
  sheet.js        [LOOSE=1] node scripts/sheet.js [family|all] [count] [out.html], a contact sheet for tuning
  anchors.js      node scripts/anchors.js [out.html] [variants], each recipe as written and varied, with why rejects failed
```

Built with [paper.js](http://paperjs.org) for the path booleans and [Vite](https://vite.dev).
