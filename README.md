# logooo

Symmetric logo marks from circles, sparks and grids. Press space, get a mark, copy it as SVG or PNG.

![logooo](docs/screenshot.png)

Every mark is built from plain geometry (circles, four-node squircles, concave sparks, grid cells), repeated under a symmetry group (C2, D2, D4, Dn) and combined with boolean ops: union, subtract and XOR, where overlaps cancel out. The output is a single clean vector path.

## Styles

| Style | What it makes |
| --- | --- |
| Bloom | Scalloped frames of overlapping circles with a shaped opening and an optional dot |
| Lattice | Circle grids where overlaps cancel (XOR) or get punched through, including scales and columns |
| Orbit | Circles around a center: crescents, bitten moons, chains, rosettes, swirls |
| Spark | Concave four-point stars, alone, in clusters, or cut out of a solid |
| Ring | Circle and squircle bands with shaped holes, dots, inner rings and slots |
| Pixel | Mirror-symmetric bitmaps as sharp blocks, soft blocks or dots |
| Field | Halftone dot fields with radial or diagonal falloff |
| Tiles | Bauhaus-style grids of squares, quarter discs, halves, leaves and triangles |

Each result is checked before it's shown. Marks with slivers, specks, lopsided ink coverage, or broken symmetry (a failed boolean op) are rerolled.

## Use

```sh
npm install
npm run dev
```

| Key | Action |
| --- | --- |
| `space` / `n` | New mark |
| `←` `→` | Browse history |
| `c` | Copy SVG |
| `p` | Copy PNG (1024px, transparent) |
| `s` | Save SVG |

- **Ink** sets the export colour (black or white).
- **History** is kept in localStorage (last 240 marks).
- **Links:** the URL hash holds the seed, so a link like `/#bloom.k3j9x2` always rebuilds the same mark.

## Layout

```
src/
  gen/
    rng.js        seeded PRNG
    geom.js       primitives, symmetry groups, booleans, clean-up and checks
    families.js   the eight styles
    index.js      generate(seed, family)
  export.js       SVG / PNG / clipboard
  palette.js      mesh gradients for the colour icon
  main.js         UI
scripts/
  sheet.js        node scripts/sheet.js [family|all] [count] [out.html], a contact sheet for tuning
```

Built with [paper.js](http://paperjs.org) for the path booleans and [Vite](https://vite.dev).
