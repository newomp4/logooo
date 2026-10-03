# logooo

Symmetric logo marks from circles, sparks and grids. Press space, get a mark, copy it as SVG or PNG.

![logooo](docs/screenshot.png)

Every mark is built from plain geometry (circles, four-node squircles, concave sparks, grid cells), repeated under a symmetry group (C2, D2, D4, Dn) and combined with boolean ops: union, subtract and XOR, where overlaps cancel out. The output is a single clean vector path.

## Styles

| Style | What it makes |
| --- | --- |
| Bloom | Scalloped frames of overlapping circles with a shaped opening and an optional dot |
| Lattice | Circle grids where overlaps cancel (XOR) or get punched through |
| Orbit | Circles around a center: crescents, bitten moons, chains, rosettes, swirls |
| Petal | Almond leaves or teardrops fanned around a center, straight or twisted |
| Spark | Concave four-point stars, alone, in clusters, or cut out of a solid |
| Spoke | Asterisks and suns built from rounded or tapered bars |
| Badge | Rounded stars and seals, plain or with an opening |
| Ring | Circle and squircle bands with shaped holes, dots, inner rings and slots |
| Stripe | Solid shapes sliced into bands, or striped only below the horizon |
| Split | Shapes cut through the middle with the halves slid apart, or quartered |
| Tiles | Bauhaus-style grids of squares, quarter discs, halves, leaves and triangles |
| Pixel | Mirror-symmetric bitmaps as sharp blocks, soft blocks or dots |
| Field | Halftone dot fields with radial or diagonal falloff |

### Quality checks

Before a mark is shown it has to pass two checks, or it's rerolled:

- **Geometry:** no slivers, no specks, balanced ink coverage, intact symmetry (a failed boolean op breaks it), and nothing as plain as a lone disc or square.
- **Legibility** (`src/gen/legibility.js`): the mark is rasterized at 64px, the way it would appear as an app icon, and scored on ink thinner than ~5% of its size, gaps narrower than that, specks, how many separate pieces and holes the eye would count, and small satellites floating away from the main body. Busy marks score high and get dropped.

## Use

```sh
npm install
npm run dev
```

| Key | Action |
| --- | --- |
| `space` / `n` | New mark |
| `←` `→` | Browse the open tab (History or Saved) |
| `f` | Save / unsave the current mark |
| `c` | Copy SVG |
| `p` | Copy PNG (1024px, transparent) |
| `l` | Copy a link to the mark |
| `s` | Download SVG |

- **Ink** sets the export colour (black or white).
- **History** keeps the last 240 marks; **Saved** keeps the ones you star. Both live in localStorage.
- **Links:** the URL hash holds the seed, so a link like `/#petal.k3j9x2` always rebuilds the same mark.
- **Previews:** under the stage the mark is shown as light, dark and colour app icons, and at 32px and 16px.

## Layout

```
src/
  gen/
    rng.js        seeded PRNG
    geom.js       primitives, symmetry groups, booleans, clean-up and checks
    legibility.js icon-size raster check for over-detailed marks
    families.js   the thirteen styles
    index.js      generate(seed, family)
  export.js       SVG / PNG / clipboard
  palette.js      mesh gradients for the colour icon
  main.js         UI
scripts/
  sheet.js        node scripts/sheet.js [family|all] [count] [out.html], a contact sheet for tuning
```

Built with [paper.js](http://paperjs.org) for the path booleans and [Vite](https://vite.dev).
