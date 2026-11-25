# Bridge SE

Free, open-source bridge structural engineering check tools that run in your browser.
Live at **[bridge-se.open-dot.org](https://bridge-se.open-dot.org/)**, part of [Open DOT](https://open-dot.org/).

| Module | What it does |
|---|---|
| [Just Live Load](https://bridge-se.open-dot.org/just-live-load/) | Moment, shear and reaction envelopes for continuous beams: HL-93, HS loading, AASHTO routine commercial trucks, permits |
| [Steel Line Girder](https://bridge-se.open-dot.org/steel-line-girder/) | Continuous steel I-girder and straight tub girder analysis, live-load envelopes and selected AASHTO LRFD checks |
| [Steel 2D Grillage](https://bridge-se.open-dot.org/steel-2d-grillage/) | Grid analysis of curved, skewed and flared steel I-girder bridges, with cross-frame design forces, AASHTO LRFD 10th edition girder checks and CSiBridge verification models (preview) |
| [Concrete Line Girder](https://bridge-se.open-dot.org/concrete-line-girder/) | IDOT precast prestressed I, bulb-T, IL and deck beams, and Iowa DOT BTB–BTE bulb tees with the Iowa BDM 5.4 policies: strength, service, shear and load rating (LRFD/LRFR, or Standard Specs 2002 LFD/LFR) |
| [Concrete Slab Bridge](https://bridge-se.open-dot.org/concrete-slab-bridge/) | Continuous concrete slab bridges: equivalent-strip analysis, design checks and HL-93 load rating |
| [Concrete Box Culvert](https://bridge-se.open-dot.org/concrete-box-culvert/) | Cast-in-place and precast box culverts, single and multi-cell, with HL-93 load rating |
| [Just Lap Splices](https://bridge-se.open-dot.org/just-lap-splices/) | Reinforcing-bar development and lap splice lengths across AASHTO LRFD editions |

## How it works

Each module is a single self-contained HTML file, with all of its calculation code in plain
JavaScript inside the page. There is no server-side code, build step or database.
Calculations run in the browser, and inputs are saved only in the browser's local storage.
Each module's **Method and assumptions** section lists its assumptions, limits and the code
articles it follows.

## Repository layout

```
site/                      Exactly what is served at bridge-se.open-dot.org
  index.html               Hub page
  about/                   About Bridge SE
  <module>/index.html      One folder per module
  assets/                  Logo and icons
  robots.txt, sitemap.xml
tests/run.cjs              Engine regression tests: node tests/run.cjs (no packages)
tests/fixtures/            Saved inputs for the tests
scripts/check-secrets.sh   Local check for keys, passwords and licensed files
.github/workflows/         Automatic secret scan and engine tests on every push
```

## Run it locally

Open any `site/<module>/index.html` in a browser, or serve the folder:

```
cd site
python3 -m http.server 8000
# then open http://localhost:8000/
```

The page header and footer load the logo from `/assets/` and a font from Google Fonts, so a
local copy looks plainest when opened directly as a file. The calculations work either way.

## Tests

```
node tests/run.cjs
```

Runs the calculation engines headlessly against published benchmarks (NSBA Design Example 5, MBE A1,
TxDOT 0-4751-1 Example A.1) and the independent audit cases, and exits non-zero on any failure. Run it before
pushing; GitHub runs it on every push as well.

## Engineering use and limits

These tools are aids for checking, study and preliminary work. They are not a substitute for
professional engineering judgment, and they do not seal, certify or approve a design or rating.
Verify every result independently. You are responsible for confirming that a tool, its
assumptions and its code edition apply to your structure and your agency's requirements.

The modules cite AASHTO, ASTM and Illinois DOT publications by article number but do not
reproduce copyrighted specification text. Licensed reference documents must never be committed
to this repository. Bridge SE is independent and is not affiliated with or endorsed by any
agency or employer.

## Reporting a problem

Open an [issue](https://github.com/tjanicke/bridge-se/issues) with the module, your inputs (or
the saved model file) and the result you expected, or email admin@open-dot.org.

## Keeping secrets out

This repository is public. Before each push:

```
bash scripts/check-secrets.sh
```

To run it automatically on every commit:

```
ln -s ../../scripts/check-secrets.sh .git/hooks/pre-commit
```

GitHub also scans every push (`.github/workflows/secret-scan.yml`), and GitHub push protection
blocks known key formats on public repositories. If a secret is ever pushed, **change the
secret first**. Removing the commit is not enough once it has been public.

## License

[MIT](LICENSE). Use, change and share freely, including commercially; keep the copyright and
license notice. Provided "as is", without warranty.

## Deployment

The live site updates automatically from the `main` branch of this repository, usually within
five minutes of a push.
