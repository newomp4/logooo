# logooo

Geometric logo marks, symmetric by default. Press space, get a mark, copy it as SVG or PNG.

![logooo](docs/screenshot.png)

Marks are built two ways:

- **Booleans:** plain geometry (circles, squircles, concave sparks, grid cells) repeated under a symmetry group (C2, D2, D4, Dn) and combined with paper.js union, subtract and XOR, where overlaps cancel out.
- **Signed distance fields** (`src/gen/sdf.js`): every shape is a "distance to edge" function. Smooth unions give filleted, gooey joins and smooth cuts give soft corners, and the field is traced into a path with marching squares.

Either way the output is a single vector path.

## Styles

The main styles are compositional: each picks from a small vocabulary (containers, cuts, slabs, pieces) and combines a few at random, so they land on new marks rather than recreating a reference. Their symmetry is measured after the fact.

| Style | What it makes |
| --- | --- |
| Carve | A circle, squircle, polygon, pill or soft blob with negative space cut in: a slit that opens into a diamond, star or lens; a bent channel; an S cut; an inner opening of a different shape |
| Pair | A slab (leaning, rounded, maybe hooked or with a block on it) and its 180° turn, interlocking into an S or Z |
| Tetro | A rounded pixel piece mirrored into four quadrants around a gap |
| Cloud | Lumps melted onto a body, filled or outlined, sometimes with eyes |
| Block | Slabs stacked on a coarse grid with fillets and an arch cut |
| Soft | Lobed curves, melted balls, mirrored characters, lopsided dumbbells |
| Stroke | Monoline strokes with round caps: bent pairs, gooey asterisks, chasing arcs, turbines, splats |
| Dash, Arch, Petal, Spoke, Sector, Split | Rings of ellipses, split overlapping ovals, leaves, asterisks, cut rings and polygons, slid halves |
| Badge, Ring, Bloom, Orbit, Stripe, Glyph, Lattice, Tiles, Spark, Pixel, Field | Older styles, kept as occasional accents |
| Fan | Tapered rays that shrink as they sweep around (asymmetric mode only) |

### Symmetric only

On by default: every mark has mirror and/or rotational symmetry. Switch it off to also get asymmetric marks (fans, splats) that are balanced instead. Their visual centre of mass has to sit near the middle of the mark.

### Quality checks

Before a mark is shown it has to pass two checks, or it's rerolled:

- **Geometry:** no slivers, no specks, balanced ink coverage, intact symmetry (a failed boolean op breaks it), not too flat, and not too plain: a nest of convex shapes around one centre (a disc, a plain ring, a target) is rejected.
- **Legibility** (`src/gen/legibility.js`): the mark is rasterized at 64px, the way it would appear as an app icon, and scored on ink thinner than ~5% of its size, gaps narrower than that, specks, how many separate pieces and holes the eye would count, and small satellites floating away from the main body. Busy marks score high and get dropped.

### Fewer repeats

Every mark gets a 32×32 silhouette fingerprint. A new mark that overlaps one of your last 40 by 80% or more is swapped for a fresher one, and styles you've just seen are picked less often. Traced outlines are refitted with as few curves as the shape needs, so exported SVGs stay clean.

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
- **Links:** the URL hash holds the style and seed, so a link like `/#petal.k3j9x2` always rebuilds the same mark (`.x` on the end means asymmetric marks were allowed).
- **Previews:** inside the main card the mark is shown as light, dark and flat-colour app icons, and at 32px and 16px. Click an icon to put the big mark on that background.
- **Hidden:** marks you hide (✕) are remembered by silhouette; anything 72% alike or more is skipped from then on. "Show again" resets it.

## Layout

```
src/
  gen/
    rng.js        seeded PRNG
    geom.js       primitives, symmetry groups, booleans, contour tracing, clean-up and checks
    sdf.js        signed-distance shapes and operations
    legibility.js icon-size raster check, symmetry detection, balance, plainness, fingerprints
    compose.js    compositional styles (carve, pair, block, tetro, cloud)
    families.js   the other styles and the weights
    index.js      generate(seed, family)
  export.js       SVG / PNG / clipboard
  palette.js      flat colour pairs for the colour icon
  main.js         UI
scripts/
  sheet.js        [LOOSE=1] node scripts/sheet.js [family|all] [count] [out.html], a contact sheet for tuning
```

Built with [paper.js](http://paperjs.org) for the path booleans and [Vite](https://vite.dev).
