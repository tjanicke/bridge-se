// Regression tests for the Bridge SE engines. Run from the repository root: node tests/run.cjs
// No packages needed. Each page's inline scripts run in a Node VM that stands in for `window`; scripts that need
// the page (document, layout) fail without a DOM and are skipped, which leaves the engines.
//
// The cases are the November 2026 independent audit cases, each with the value it should give and, where there is
// one, the independent check it came from. A failure prints the case, the value and the expected range.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), FIX = path.join(__dirname, 'fixtures');

function load(app, asModule) { // asModule: the page's engine exports through module.exports (Just Live Load)
  const html = fs.readFileSync(path.join(ROOT, 'site', app, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const ctx = { console: { log() {}, warn() {}, error() {} }, structuredClone, TextEncoder, TextDecoder, setTimeout, clearTimeout };
  if (asModule) ctx.module = { exports: {} };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const src of scripts) { if (/^\s*\{/.test(src) && !/function|=>/.test(src.slice(0, 200))) continue; try { vm.runInContext(src, ctx); } catch (e) { /* page script */ } }
  return ctx;
}
const fixture = f => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
// Concrete Line Girder saves its form; the page converts it to the engine input like this (engineModel in the page)
function clgEngineModel(m0) {
  const m = structuredClone(m0);
  if (m.pattern && m.pattern.custom) {
    const ctr = {}, end = {}, db = [];
    (m.pattern.rows || []).forEach(r => { const k = String(r.row).trim(); if (!k) return; if (+r.ctr > 0) ctr[k] = +r.ctr; if (m.kind !== 'deck' && +r.end > 0) end[k] = +r.end; if (+r.dbn > 0 && +r.dbL > 0) db.push({ row: k, n: +r.dbn, L: +r.dbL }); });
    m.pattern = m.kind === 'deck' ? { ctr } : { ctr, end, db };
  }
  if (m.kind === 'deck' && m.stirMode !== 'entered') delete m.stirrups;
  if (m.opts && m.opts.dc1Span === 'bearing') delete m.opts.dc1Span;
  if (!(m.lanes > 0)) delete m.lanes; if (!(m.edgeWidth > 0)) delete m.edgeWidth; if (m.lift && !(m.lift.Lc > 0)) delete m.lift;
  delete m.report; return m;
}

let pass = 0, fail = 0;
function near(name, v, want, tol, src) {
  const ok = Number.isFinite(v) && Math.abs(v - want) <= tol;
  ok ? pass++ : fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + (Number.isFinite(v) ? +v.toPrecision(6) : v) + (ok ? '' : '  (expected ' + want + ' ± ' + tol + ')') + (src ? '  [' + src + ']' : ''));
}
// a case that throws counts as a failure, and the other cases still run
function guard(name, fn) { try { fn(); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }
function is(name, v, want) { const ok = v === want; ok ? pass++ : fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + v + (ok ? '' : '  (expected ' + want + ')')); }

// ---------- Steel Line Girder ----------
guard('Steel Line Girder', () => {
  const S = load('steel-line-girder').LGCheck;
  // permit rating with a weak web at 1-3 ft: shear must govern the permit rating whatever the rating impact
  for (const im of [0, 20, 33]) {
    const m = fixture('slg-a1p.json'); m.live.permit = 'only'; m.live.permits.im = im;
    const W = m.sections.find(s => s.id === 'W'); m.sections.push(Object.assign({}, W, { id: 'WL', tw: 0.22 }));
    const r0 = m.ranges.find(r => r.sec === 'W' && +r.from === 0), to = +r0.to; r0.to = 1;
    m.ranges.push({ from: 1, to: 3, sec: 'WL' }, { from: 3, to, sec: 'W' }); m.ranges.sort((a, b) => a.from - b.from);
    const r = S.run(m);
    is('steel permit, weak web, IM ' + im + '%: governing permit check is shear', /hear/.test(r.permit.strength.what), true);
    if (im === 20) near('steel permit, weak web, IM 20%: shear RF', r.permit.strength.RFp, 0.02387, 0.0002, '(44.7891 − 1.25 × 33.8845)/(1.10 × 92.6666)');
  }
  // the A1 escorted permit itself: flexure and Service II as in MBE A1 (shear is not compared: the example substitutes 360.3 k)
  { const r = S.run(fixture('slg-a1p.json'));
    const pc = r.checks.filter(c => c.permit && c.lim === 'Strength II' && c.cat === 'flexure' && Number.isFinite(c.RFp));
    near('steel A1 permit, Strength II flexure RF', Math.min(...pc.map(c => c.RFp)), 2.01, 0.006, 'MBE A1');
    near('steel A1 permit, Service II RF', r.permit.service.RFp, 1.53, 0.006, 'MBE A1'); }
  // tub girder, NSBA Design Example 5
  { const r = S.run(fixture('slg-tub5.json')), P = r.secTable;
    const A = P.find(t => t.id === 'A').P, E = P.find(t => t.id === 'E').P;
    near('tub DE5 section 2-2, steel I', A.s.I, 267955, 30, 'NSBA DE5');
    near('tub DE5 section 2-2, short-term composite I', A.sn.I, 727074, 80, 'NSBA DE5');
    near('tub DE5 section 2-1, steel Sb', E.s.Sbot, 19918, 10, 'NSBA DE5');
    near('tub DE5 DF moment', r.tub.DF.M, 1.467, 0.001, 'NSBA DE5');
    near('tub DE5 DF fatigue', r.tub.DF.MF, 0.900, 0.001, 'NSBA DE5');
    is('tub DE5 within the method scope', r.tub.scope.ok, true);
    near('tub DE5 center span LL deflection, in.', (r.deflection || []).find(q => q.span === 2).delta, 2.267, 0.01, 'independent virtual work'); }
  // pedestrian mode: 90 psf load, eigenvalue frequency, vehicle placement, verdict scope
  { const ped = (sp, ped, df) => { const m = fixture('slg-rb2.json'); m.spans = sp; const Lt = sp.reduce((a, b) => a + b);
      m.ranges = [{ from: 0, to: Lt, sec: m.sections[0].id }]; m.bracing = { locs: '', Lb: 20 }; m.stiffeners = []; m.live.design = 'ped'; m.live.ped = ped; if (df) Object.assign(m.df, df); return m; };
    const r = S.run(ped([72], { width: 5, clear: 12, mpf: true })), p = r.pois.reduce((a, b) => (Math.abs(b.x - 36) < Math.abs(a.x - 36) ? b : a));
    near('pedestrian 72 ft simple span, 5 ft width: midspan moment, k-ft', p.LLpos, 291.6, 0.05, '0.45 × 72²/8');
    const P = r.secTable[0].P, EI = 29000 * P.sn.I / 144, w = r.vibration.Wg / 72;
    near('pedestrian 72 ft simple span: frequency, Hz', r.vibration.f, Math.PI / (2 * 72 * 72) * Math.sqrt(EI * 32.174 / w), 1e-4, 'π/2L² √(EIg/w)');
    const r4 = S.run(ped([70, 70, 70, 70], { width: 5, clear: 12, mpf: true })), w4 = r4.vibration.Wg / 280;
    near('pedestrian 4 × 70 ft: frequency equals the simple 70 ft span, Hz', r4.vibration.f, Math.PI / (2 * 70 * 70) * Math.sqrt(EI * 32.174 / w4), 1e-4, 'equal spans, exact');
    is('pedestrian: the verdict lists the checks not made', Array.isArray(r.pedOpen) && r.pedOpen.length === 4, true);
    let msg = ''; try { S.run(ped([72], { width: 5, clear: 7, mpf: true }, { girder: 'exterior' })); } catch (e) { msg = e.message; }
    is('pedestrian: H5 on a 7 ft clear deck, exterior girder, no factor entered: stops', /does not fit/.test(msg), true);
    is('pedestrian: same with the factor entered: runs', S.run(ped([72], { width: 5, clear: 7, mpf: true, dfVeh: 0.6 }, { girder: 'exterior' })).llc.ped.veh, 'H5'); }
  for (const [lbl, f] of [['skew +10', m => { m.df.skew = 10; }], ['skew −10', m => { m.df.skew = -10; }], ['roadway 50 ft (NL/Nb = 2)', m => { m.df.roadway = 50; }], ['partial top lateral bracing', m => { m.tub.lateral = 'partial'; }]]) {
    const m = fixture('slg-tub5.json'); f(m); is('tub ' + lbl + ': outside the method scope', S.run(m).tub.scope.ok, false);
  }
});

// ---------- Concrete Line Girder ----------
guard('Concrete Line Girder', () => {
  const P = load('concrete-line-girder').PPCHECK;
  // LFD Vci with the shear concurrent with Mmax: TxDOT A.1 with weak stirrups at 0.39-0.45L
  { const m = clgEngineModel(fixture('clg-tx41.json'));
    m.stirrups = [{ from: 0, to: 0.39, Av: 0.5, s: 22 }, { from: 0.39, to: 0.45, Av: 0.27, s: 22 }, { from: 0.45, to: 1, Av: 0.5, s: 22 }];
    const r = P.run(m), q = r.shear.reduce((a, b) => (Math.abs(b.x - 43.4332) < Math.abs(a.x - 43.4332) ? b : a));
    near('LFD Vci, modified TxDOT A.1 at 43.43 ft, ratio', q.ratio, 1.0235, 0.002, 'independent influence line');
    near('LFD Vci, modified TxDOT A.1, inventory shear RF', r.rating.summary.find(s => /hear/.test(s.lim)).inv.inv, 0.9693, 0.002, 'independent influence line'); }
  { const r = P.run(clgEngineModel(fixture('clg-tx41.json')));
    near('TxDOT A.1 inventory RF (unchanged by the Vci fix)', r.rating.inventory.inv, 0.9994, 0.0005, 'app value, governed by end shear'); }
  // LRFD simplified procedure: Vi from the HL-93 position that gives Mmax; simple span 120 ft
  { const m = clgEngineModel(fixture('clg-il63.json')); m.opts = Object.assign({}, m.opts, { shearMethod: 'simplified' });
    const r = P.run(m), at = x => r.shear.find(q => Math.abs(q.x - x) < 1e-6);
    near('LRFD simplified, 120 ft span at 36 ft, concurrent / envelope LL shear', at(36).simp.VLc / at(36).VLLp, 0.9559, 0.002, 'independent, axle positions at 0.01 ft');
    near('LRFD simplified, 120 ft span at 48 ft, concurrent / envelope LL shear', at(48).simp.VLc / at(48).VLLp, 0.7954, 0.002, 'independent, axle positions at 0.01 ft');
    is('LRFD simplified, 120 ft span at 48 ft: Vci governs', at(48).simp.Vci < at(48).simp.Vcw, true); }
  // simplified procedure, negative moment: the deck top is the tension face, Mcre = 0.20√f′c,deck · I/(n(hc − yb))
  { const m = clgEngineModel(fixture('clg-dg34.json')); m.opts = Object.assign({}, m.opts, { shearMethod: 'simplified' });
    const r = P.run(m), c = r.section.comp, q = r.shear.reduce((a, b) => (Math.abs(b.x - 151.28) < Math.abs(a.x - 151.28) ? b : a));
    is('LRFD simplified, 2-span dg34 at 151.28 ft: negative moment governs', q.useNeg, true);
    near('LRFD simplified, dg34 at 151.28 ft: Mcre at the deck top, k-ft', q.simp.Mcre, 0.2 * Math.sqrt(m.deck.fc) * c.I / (c.hc - c.yb) / c.n / 12, 0.5, 'hand calculation');
    near('LRFD simplified, dg34 at 151.28 ft: Mcre, k-ft', q.simp.Mcre, 1730, 2, 'app value'); }
  // pedestrian deflection: the largest deflection in the span, not only at midspan (40 + 120 ft)
  { const m = clgEngineModel(fixture('clg-dg34.json')); m.spans = [40, 120]; m.live = Object.assign({}, m.live, { design: 'ped', ped: { width: 8, clear: 12, mpf: true } });
    const r = P.run(m), d = r.deflection.find(q => q.span === 2);
    near('pedestrian 40 + 120 ft: location of the largest deflection, ft', d.x, 106, 1.3, 'independent: 5.9 ft past midspan');
    is('pedestrian: the verdict lists the checks not made', Array.isArray(r.pedOpen) && r.pedOpen.length === 3, true); }
  // less than the minimum stirrups: the simplified procedure does not apply; general procedure with 5.7.3.4.2-2
  { const m = clgEngineModel(fixture('clg-il63.json')); m.opts = Object.assign({}, m.opts, { shearMethod: 'simplified' });
    m.stirrups = [{ from: 0, to: 0.1, Av: 0.62, s: 6 }, { from: 0.1, to: 0.35, Av: 0.62, s: 12 }, { from: 0.35, to: 0.45, Av: 0.18, s: 18 }, { from: 0.45, to: 0.9, Av: 0.62, s: 12 }, { from: 0.9, to: 1, Av: 0.62, s: 6 }];
    const r = P.run(m), q = r.shear.find(q => Math.abs(q.x - 48) < 1e-6);
    is('below minimum stirrups at 48 ft (0.180 < 0.193 in.²): simplified procedure not used', q.method, 'general');
    near('below minimum stirrups: β = 4.8/(1 + 750εs) · 51/(39 + sxe)', q.beta, 4.8 / (1 + 750 * q.es) * 51 / (39 + q.sxe), 1e-9, '5.7.3.4.2-2');
    near('below minimum stirrups: sxe = dv (ag 0.75 in.), 12 to 80 in.', q.sxe, Math.min(Math.max(q.dv, 12), 80), 1e-9, '5.7.3.4.2-5');
    is('below minimum stirrups: shear rating below 1.0', r.rating.summary.find(s => /hear/.test(s.lim)).inv.inv < 1, true); }
});

// ---------- Concrete Slab Bridge ----------
guard('Concrete Slab Bridge', () => {
  const S = load('concrete-slab-bridge').SlabCheck, F = S.flexure(1.58, 8.5, 4, 100, 12);
  near('slab Grade 100, compression controlled: φMn, k-ft/ft', F.Mr, 60.611, 0.01, 'strain compatibility');
  near('slab Grade 100: steel stress, ksi', F.fs, 91.125, 0.01, 'strain compatibility');
  near('slab Grade 100: φ', F.phi, 0.75, 1e-9, 'εt 0.00314 < εcl 0.004');
  const G = S.flexure(0.62, 8.5, 4, 60, 12);
  near('slab Grade 60, tension controlled: φ', G.phi, 0.9, 1e-9);
});

// ---------- Just Live Load ----------
guard('Just Live Load', () => {
  const E = load('just-live-load', true).module.exports;
  for (const neglect of [true, false]) {
    const r = E.analyze({ spans: [70, 70], segments: [{ len: 140, E: 29000, I1: 50000, I2: '' }], divisions: 10, segPts: false, extraPts: '68.25',
      options: { step: 0.25, varInc: 1, neglectDesign: neglect, neglectPermit: false, hl93: { on: true, im: 33, lane: 0.64, dual: 'spec', fatigue: true, imFat: 15, dfM: 1, dfV: 1 }, hs: { on: false }, legal: { on: false }, permits: [] } });
    const f = r.families.find(q => q.id === 'fat'), k = r.model.resp.findIndex(q => JSON.stringify(q).includes('68.25'));
    near('fatigue moment range at 68.25 ft, 70-70 ft, axle neglect ' + (neglect ? 'on' : 'off'), f.max[k] - f.min[k], 408.98, 0.05, 'independent two-span influence line');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
