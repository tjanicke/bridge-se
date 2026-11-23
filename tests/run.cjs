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
  // concurrent shear uses the permanent-load factors of the maximum-moment combination (DC1 opposes the pier moment: 0.90)
  { const m = clgEngineModel(fixture('clg-dg34.json')); m.opts = Object.assign({}, m.opts, { shearMethod: 'simplified' }); m.stirrups = [{ from: 0, to: 1, Av: 0.52, s: 12 }];
    const r = P.run(m), q = r.shear.reduce((a, b) => (Math.abs(b.x - 151.28) < Math.abs(a.x - 151.28) ? b : a));
    const g = (M, gx, gn) => (Math.sign(M) === -1 ? gx : gn), hand = Math.abs(g(q.MDC1, 1.25, 0.9) * q.VDC1 + g(q.MDC2, 1.25, 0.9) * q.VDC2 + g(q.MDW, 1.5, 0.65) * q.VDW + 1.75 * q.simp.VLc);
    near('LRFD simplified, dg34 pier, 0.52 in.² at 12 in.: Vu,M with the moment-combination factors, k', q.simp.VuM, Math.min(hand, q.Vu), 0.01, 'hand combination');
    near('LRFD simplified, dg34 pier, 0.52 in.² at 12 in.: shear ratio', q.ratio, 1.025, 0.002, 'GPT round 4');
    near('LRFD simplified, dg34 pier, 0.52 in.² at 12 in.: local inventory shear RF', r.rating.rows.filter(x => /hear/.test(x.lim) && Math.abs(x.x - q.x) < 1e-6)[0].inv, 0.946, 0.002, 'GPT round 4'); }
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

// ---------- Steel 2D Grillage (framing) ----------
guard('Steel 2D Grillage', () => {
  const G = load('steel-2d-grillage').G2D;
  // NSBA Steel Bridge Design Handbook, Design Example 4 (2025): 160-210-160 ft on R = 700 ft at the centerline, four girders
  // at 11 ft, radial supports, cross-frames at 20 ft (end spans) and 19.09 ft (center span) along the centerline
  const E4 = { mode: 'concentric', concentric: { R: 700, turn: 'L', nG: 4, spacing: 11, spans: [160, 210, 160], skews: [0, 0, 0, 0], ext: 1, crossframes: { spacing: 20 } } };
  const F = G.build(E4), g1 = F.girders.find(g => g.id === 'G1'), g4 = F.girders.find(g => g.id === 'G4');
  is('E4 framing: no errors', F.errors.length, 0);
  near('E4 G1 (inside) end span, ft', g1.spans[0].L, 160 * 683.5 / 700, 0.01, 'arc length; E4 Table 1: 156.23');
  near('E4 G1 center span, ft', g1.spans[1].L, 210 * 683.5 / 700, 0.01, 'E4 Table 1: 205.05');
  near('E4 G4 (outside) center span, ft', g4.spans[1].L, 214.95, 0.01, 'E4 Article 4.3');
  near('E4 G4 radius, ft', g4.spans[1].R, 716.5, 0.05, '700 + 1.5 × 11');
  const perBay = [1, 2, 3].map(b => F.crossframes.filter(x => x.bay === b && x.tag === 'intermediate').length);
  is('E4 intermediate cross-frames per bay (7 + 10 + 7 from 8, 11, 8 panels)', perBay.join(','), '24,24,24');
  is('E4 support cross-frames', F.crossframes.filter(x => x.tag === 'support').length, 12);
  near('E4 cross-frames radial: largest angle from normal, deg', Math.max(...F.crossframes.map(x => Math.max(Math.abs(x.angA), Math.abs(x.angB)))), 0, 0.01);
  near('E4 bearings radial: largest skew, deg', Math.max(...F.girders.flatMap(g => g.brg.map(b => Math.abs(b.skew)))), 0, 0.01);
  near('E4 G4 largest unbraced length, ft', g4.LbMax, 163.77 / 8, 0.02, 'end span / 8 panels');
  // DXF out (inches) and back in: same spans and cross-frames
  const F2 = G.build(G.dxfToModel(G.readDXF(G.toDXF(F, { units: 'in' })), { 'G2D-GIRDER': 'girder', 'G2D-SUPPORT': 'support', 'G2D-XFRAME': 'crossframe' }, {}));
  near('DXF round trip: largest span difference, ft', Math.max(...F2.girders.flatMap((g, i) => g.spans.map((s, j) => Math.abs(s.L - F.girders[i].spans[j].L)))), 0, 0.001);
  is('DXF round trip: cross-frames', F2.crossframes.length, F.crossframes.length);
  // 60° skew, straight: bearings read 60°, cross-frames normal to the girders and staggered, unbraced length within the spacing
  const S = G.build({ mode: 'concentric', concentric: { R: 0, nG: 4, spacing: 10, spans: [120, 120], skews: [60, 60, 60], ext: 1, crossframes: { spacing: 20 } } });
  near('60° skew: bearing skew, deg', S.girders[0].brg[1].skew, 60, 1e-6);
  near('60° skew: cross-frames normal to girders, deg', Math.max(...S.crossframes.filter(x => x.tag === 'intermediate').map(x => Math.abs(x.angA))), 0, 0.01, 'AASHTO 6.7.4.2');
  is('60° skew: unbraced lengths within 20 ft', Math.max(...S.girders.map(g => g.LbMax)) <= 20 + 1e-6, true);
  // a 4-span curved unit from an MDX girder system run (geometry only): G1 inside at R = 3128.25 ft, 4 girders at 12.5 ft,
  // radial supports, cross-frames at MDX's brace spacings along G1. MDX's grid reports these girder span lengths
  const k = 3147 / 3128.25, BR = [10, 20, 25, 25, 20, 20, 15, 15, 28.4968, 15, 15, 20, 20, 20, 20, 20, 20, 15, 15, 29.4455, 15, 15, 20, 21, 25, 25, 21, 20, 15, 15, 27.8929, 15, 15, 20, 25, 25, 22, 20];
  const M4 = G.build({ mode: 'concentric', concentric: { R: 3147, turn: 'L', nG: 4, spacing: 12.5, spans: [163.4968, 209.4455, 219.8929, 166.9693].map(v => v * k), skews: [0, 0, 0, 0, 0], ext: 1, crossframes: { atRef: { girder: 'G1', spacing: BR } } } });
  const mdxSpans = { G1: [163.497, 209.445, 219.893, 166.969], G2: [164.150, 210.282, 220.772, 167.636], G3: [164.803, 211.119, 221.650, 168.303], G4: [165.457, 211.956, 222.529, 168.971] };
  near('MDX system run: largest girder span difference from MDX, ft', Math.max(...M4.girders.flatMap(g => g.spans.map((s, j) => Math.abs(s.L - mdxSpans[g.id][j])))), 0, 0.002, 'GSA.OUT Girder Span Lengths');
  is('MDX system run: cross-frames per bay (38 at the brace spacings + 5 on supports)', [1, 2, 3].map(b => M4.crossframes.filter(x => x.bay === b).length).join(), '43,43,43');
  is('MDX system run: G1 brace points, ft', M4.crossframes.filter(x => x.bay === 1 && x.tag === 'intermediate').slice(0, 9).map(x => +(x.uA - 1).toFixed(2)).join(), '10,30,55,80,100,120,135,150,178.5');
  near('MDX system run: G4 largest unbraced length, ft', M4.girders[3].LbMax, 25 * 3165.75 / 3128.25, 0.01, '25 ft on G1, radial');
  // widening with an interior partial-length girder: G1-G3 parallel, G5 and G6 fan out, and G4 starts on diaphragm D1
  // (spanning G3 to G5) where that bay reaches 12 ft, then runs continuous over the pier
  const W = G.build({ mode: 'alignment', ext: 1, alignment: { sta0: 1000, x0: 0, y0: 0, dir0: 0, elements: [{ type: 'line', L: 300 }] },
    girders: [{ id: 'G1', offsets: [[1000, -18]] }, { id: 'G2', offsets: [[1000, -9]] }, { id: 'G3', offsets: [[1000, 0]] }, { id: 'G4', offsets: [[1100, 6], [1300, 9]], startOn: 'D1' }, { id: 'G5', offsets: [[1000, 9], [1300, 18]] }, { id: 'G6', offsets: [[1000, 18], [1300, 27]] }],
    supports: [{ id: 'Abut 1', sta: 1000, skew: 0, kind: 'abutment' }, { id: 'Pier 1', sta: 1150, skew: 0 }, { id: 'Abut 2', sta: 1300, skew: 0, kind: 'abutment' }],
    diaphragms: [{ id: 'D1', sta: 1100, skew: 0, from: 'G3', to: 'G5' }], crossframes: { spacing: 20 } });
  const g4w = W.girders.find(g => g.id === 'G4'), xs = (a, b, tag) => W.crossframes.filter(x => x.gA === a && x.gB === b && x.tag === tag).map(x => +(x.pA[0] + 1000).toFixed(2));
  is('partial girder: no errors', W.errors.length, 0);
  is('partial girder: G4 starts on D1', g4w.startKind + ' ' + g4w.startOn, 'member D1');
  near('partial girder: G4 first span, D1 to Pier 1, ft', g4w.spans[0].L, Math.hypot(50, 0.75), 0.01, 'offset 6 to 6.75 ft over 50 ft');
  is('partial girder: D1 frames G3-G4 and G4-G5', W.members.map(m => m.gA + '-' + m.gB).join(), 'G3-G4,G4-G5');
  is('partial girder: G3-G5 bay braced ahead of D1', xs('G3', 'G5', 'intermediate').join(), '1018.75,1037.5,1056.25,1075,1093.75');
  is('partial girder: G4 bays on the same panel lines as G1-G2', xs('G4', 'G5', 'intermediate').join(), xs('G1', 'G2', 'intermediate').filter(v => v > 1100).join());
  is('partial girder: G3-G5 support cross-frame at Abut 1', W.crossframes.filter(x => x.gA === 'G3' && x.gB === 'G5' && x.tag === 'support').length, 1);
});

// ---------- Steel 2D Grillage: grid solver (phase 2) ----------
guard('Steel 2D Grillage solver', () => {
  const G = load('steel-2d-grillage').G2D;
  const sec = G.plate({ D: 60, tw: 0.5, bt: 16, tt: 1, bb: 18, tb: 1.25 });
  // two straight girders, two equal 100 ft spans, 2 k/ft on each: a continuous beam each (3wL/8, 10wL/8, -wL^2/8, 9wL^2/128)
  const F2 = G.build({ mode: 'concentric', concentric: { R: 0, nG: 2, spacing: 10, spans: [100, 100], skews: [0, 0, 0], ext: 0, crossframes: { spacing: 20 } } });
  const r2 = G.solve(G.model(F2, { props: () => sec, brace: { I: 1000, J: 5, e: 0 }, warping: true, h: 5 }), 'nc', { line: () => 2 });
  is('grid: two-span reactions, kip', r2.reac.filter(x => x.g === 'G1').map(x => +x.R.toFixed(3)).join(), '75,250,75');
  near('grid: pier moment, kip-ft', G.at(r2, 'G1', 100).M, -2500, 0.01, '-wL^2/8');
  near('grid: moment at 0.375 L, kip-ft', G.at(r2, 'G1', 37.5).M, 1406.25, 0.01, '9wL^2/128');
  // curved girder, R = 300 ft, 150 ft arc, w = 0 and twist = 0 at both ends, 2 k/ft (St. Venant): midspan moment and end torque
  // from an independent flexibility solution on the circle: 5775.3 kip-ft and 961.6 kip-ft
  const Fc = G.build({ mode: 'concentric', concentric: { R: 305, turn: 'L', nG: 2, spacing: 10, spans: [150 * 305 / 300], skews: [0, 0], ext: 0, crossframes: { auto: false } } });
  const rc = G.solve(G.model(Fc, { props: () => sec, brace: { I: 1, J: 1, e: 0 }, warping: false, h: 1, twistAtBearings: true }), 'nc', { line: () => 2 });
  near('grid: curved girder midspan moment, kip-ft', G.at(rc, 'G1', 75).M, 5775.3, 2, 'flexibility solution 5775.3');
  near('grid: curved girder end torque, kip-ft', Math.abs(G.at(rc, 'G1', 0.01).T), 961.6, 1.5, 'flexibility solution 961.6');
  // warping torsion: fork-supported girder, 50 kip-ft torque at midspan: twist T/(2GJ)[L/2 - tanh(pL/2)/p], bimoment T tanh(pL/2)/(2p)
  const Fw = G.build({ mode: 'concentric', concentric: { R: 0, nG: 2, spacing: 10, spans: [100], skews: [0, 0], ext: 0, crossframes: { auto: false } } });
  const mw = G.model(Fw, { props: () => sec, brace: { I: 1, J: 1, e: 0 }, warping: true, h: 5, twistAtBearings: true });
  const nd = mw.nodeAt('G1', 50), rw = G.solve(mw, 't', { moments: [{ node: nd, Mx: 50 }] });
  const GJ = 11200 * 144 * sec.J / 20736, ECw = 29000 * 144 * sec.Cw / 2985984, pp = Math.sqrt(GJ / ECw);
  near('grid: warping torsion, midspan twist, rad', rw.d[nd.dof + 1], 50 / (2 * GJ) * (50 - Math.tanh(pp * 50) / pp), 1e-5, 'closed form');
  near('grid: warping torsion, midspan bimoment, kip-ft^2', Math.abs(rw.gRes.find(e => e.g === 'G1' && Math.abs(e.ub - 50) < 1e-6).B2), 50 * Math.tanh(pp * 50) / (2 * pp), 0.1, 'closed form');
  // cross-frame truss condensation: rigid-body modes carry no force; very stiff diagonals bend as the chord couple
  const T = G.truss(12.5, { type: 'X', h: 68, e: 6, top: { A: 8.44 }, bot: { A: 8.44 }, diag: { A: 8.44 } });
  const mv = (K, v) => Math.max(...K.map(r => Math.abs(r.reduce((s, x, j) => s + x * v[j], 0))));
  near('truss: rigid translation and rotation, largest force', Math.max(mv(T.K4, [1, 0, 1, 0]), mv(T.K4, [0, 1e-3, -12.5e-3, 1e-3])), 0, 1e-8);
  const Tr = G.truss(12.5, { type: 'X', h: 68, e: 0, top: { A: 8.44 }, bot: { A: 8.44 }, diag: { A: 1e6 } }), k = Tr.K4, det = k[2][2] * k[3][3] - k[2][3] ** 2;
  near('truss: stiff diagonals bend as the chord couple, in^4', 12.5 / (29000 * 144 * (k[2][2] / det)) * 20736, 8.44 * 68 * 68 / 2, 1, 'A h^2 / 2');
});

// ---------- Steel 2D Grillage: cross-frame forces (phase 3) ----------
guard('Steel 2D Grillage cross-frames', () => {
  const G = load('steel-2d-grillage').G2D;
  const F = G.build({ mode: 'concentric', concentric: { R: 0, nG: 4, spacing: 10, spans: [120, 120], skews: [60, 60, 60], ext: 1, crossframes: { spacing: 20 } } });
  const A = { sections: [{ girders: '', rows: [{ L: 0, D: 54, tw: 0.5, bt: 16, tt: 1, bb: 18, tb: 1.5 }] }], deck: { ts: 8, wear: 0.5, haunch: 3.5, hw: 16, fc: 4, wc: 0.15, ohL: 3.5, ohR: 3.5, sip: 15, strips: true },
    loads: { steelExtra: 5, xfWeight: 0.8, dc2: [{ name: 'L', w: 0.4, to: 'left', at: 0.75 }, { name: 'R', w: 0.4, to: 'right', at: 0.75 }], dw: 25, dwEdge: 1.5 },
    crossframe: { model: 'truss', type: 'X', endType: 'X', h: 40, e: 0, zb: 1, top: { A: 4 }, bot: { A: 4 }, diag: { A: 4 }, Rnc: 0.65, Rc: 0.75, topChord: true, deckTie: true }, options: { warping: true, h: 2.5 } };
  const R = G.analyze(F, A), c = G.consistency(R);
  is('60° skew analysis: no errors', R.errs.length, 0);
  near('consistency: member forces reproduce the frame end forces (relative)', c.res / c.ref, 0, 1e-9, 'truss forces back onto the girders');
  const tot = st => R.res[st].reac.reduce((s, x) => s + x.R, 0);
  near('equilibrium: DC2 reactions = parapet load, kip', tot('dc2'), 0.8 * F.girders[0].L * 0 + 0.8 * (F.girders[0].L + F.girders[3].L) / 2, 0.5, '0.4 k/ft on each edge girder line');
  const C = G.refinements(F, A, R), ff = C.variants.map(v => G.frameForces(v.R, ['dc2'], C.cf));
  const mx = (f, k) => Math.max(...f.map(x => x[k]));
  is('deck tie: without it, chords carry more (composite stage)', mx(ff[2], 'c') > 1.3 * mx(ff[0], 'c'), true);
  is('deck tie: without it, diagonals carry less (composite stage)', mx(ff[2], 'd') < 0.85 * mx(ff[0], 'd'), true);
  is('stiffness factors: stiffer frames attract more force', mx(ff[1], 'd') > mx(ff[0], 'd'), true);
});

// ---------- Steel 2D Grillage: live load by influence surfaces (phase 4) ----------
// NSBA Steel Bridge Design Handbook, Design Example 4 (2025): Figure 3 plates, Section 3 and 5 loads; HL-93 with its
// centrifugal wheel factors (1.212 outside, 0.788 inside, and without). Its Tables 5-8 come from a 3D model of an earlier
// set of plates, so the check is a few percent, not exact
guard('Steel 2D Grillage live load', () => {
  const G = load('steel-2d-grillage').G2D;
  const F = G.build({ mode: 'concentric', concentric: { R: 700, turn: 'L', nG: 4, spacing: 11, spans: [160, 210, 160], skews: [0, 0, 0, 0], ext: 1, crossframes: { spacing: 20 } } });
  const A = { sections: [{"girders":"G1","on":"","rows":[{"L":114,"D":84,"tw":0.5625,"bt":16,"tt":1,"bb":16,"tb":1},{"L":24.73,"D":84,"tw":0.625,"bt":21,"tt":1.25,"bb":21,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":21,"tt":2.5,"bb":21,"tb":3},{"L":23.27,"D":84,"tw":0.625,"bt":21,"tt":1.25,"bb":21,"tb":1.5},{"L":123.51,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":18,"tb":1},{"L":23.27,"D":84,"tw":0.625,"bt":21,"tt":1.25,"bb":21,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":21,"tt":2.5,"bb":21,"tb":3},{"L":24.73,"D":84,"tw":0.625,"bt":21,"tt":1.25,"bb":21,"tb":1.5},{"L":113,"D":84,"tw":0.5625,"bt":16,"tt":1,"bb":16,"tb":1}]},{"girders":"G2","on":"","rows":[{"L":116.1,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":18,"tb":1},{"L":25.14,"D":84,"tw":0.625,"bt":18,"tt":1.25,"bb":19,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":18,"tt":2.5,"bb":19,"tb":3},{"L":24.16,"D":84,"tw":0.625,"bt":18,"tt":1.25,"bb":19,"tb":1.5},{"L":125.04,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":18,"tb":1},{"L":24.16,"D":84,"tw":0.625,"bt":18,"tt":1.25,"bb":19,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":18,"tt":2.5,"bb":19,"tb":3},{"L":25.14,"D":84,"tw":0.625,"bt":18,"tt":1.25,"bb":19,"tb":1.5},{"L":115.1,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":18,"tb":1}]},{"girders":"G3","on":"","rows":[{"L":117.9,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":18,"tb":1},{"L":25.86,"D":84,"tw":0.625,"bt":20,"tt":1.25,"bb":21,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":20,"tt":2.5,"bb":21,"tb":3},{"L":24.84,"D":84,"tw":0.625,"bt":20,"tt":1.25,"bb":21,"tb":1.5},{"L":126.96,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":20,"tb":1},{"L":24.84,"D":84,"tw":0.625,"bt":20,"tt":1.25,"bb":21,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":20,"tt":2.5,"bb":21,"tb":3},{"L":25.86,"D":84,"tw":0.625,"bt":20,"tt":1.25,"bb":21,"tb":1.5},{"L":116.9,"D":84,"tw":0.5625,"bt":18,"tt":1,"bb":18,"tb":1}]},{"girders":"G4","on":"","rows":[{"L":34,"D":84,"tw":0.5625,"bt":20,"tt":1,"bb":21,"tb":1},{"L":85.7,"D":84,"tw":0.5625,"bt":20,"tt":1,"bb":21,"tb":1.625},{"L":26.57,"D":84,"tw":0.625,"bt":28,"tt":1.25,"bb":27,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":28,"tt":2.5,"bb":27,"tb":3},{"L":25.43,"D":84,"tw":0.625,"bt":28,"tt":1.25,"bb":27,"tb":1.5},{"L":129.09,"D":84,"tw":0.5625,"bt":20,"tt":1,"bb":21,"tb":1.5},{"L":25.43,"D":84,"tw":0.625,"bt":28,"tt":1.25,"bb":27,"tb":1.5},{"L":36,"D":84,"tw":0.625,"bt":28,"tt":2.5,"bb":27,"tb":3},{"L":26.57,"D":84,"tw":0.625,"bt":28,"tt":1.25,"bb":27,"tb":1.5},{"L":85.7,"D":84,"tw":0.5625,"bt":20,"tt":1,"bb":21,"tb":1.625},{"L":33,"D":84,"tw":0.5625,"bt":20,"tt":1,"bb":21,"tb":1}]}],
    deck: { ts: 9, wear: 0.5, haunch: 4, hw: 20, fc: 4, wc: 0.150, ohL: 3.75, ohR: 3.75, sip: 15, n: 7.56, strips: true },
    loads: { steelExtra: 7, xfWeight: 0, dc2: [{ name: 'L', w: 0.495, to: 'left', at: 0.6 }, { name: 'R', w: 0.495, to: 'right', at: 0.6 }], dw: 30, dwEdge: 1.5 },
    crossframe: { model: 'truss', type: 'X', endType: 'Kinv', h: 85, e: 0, zb: 0.75, top: { A: 5 }, bot: { A: 5 }, diag: { A: 5 }, Rnc: 1, Rc: 1, topChord: true, deckTie: true }, options: { warping: true, h: 2.5 } };
  const R = G.analyze(F, A), L = G.liveLoad(R, { wheels: [{ fL: 1, fR: 1 }, { fL: 0.788, fR: 1.212 }] });
  is('E4 live load: roadway and design lanes', L.W.toFixed(1) + ' ft, ' + L.NL, '37.5 ft, 3');
  const M = (g, i) => L.out.filter(r => r.kind === 'M' && r.g === g)[i];
  near('E4 G4 LL+I positive moment, span 1 point 4, kip-ft', M('G4', 4).max, 5134, 0.04 * 5134, 'E4 Table 8: 5134');
  near('E4 G1 LL+I positive moment, span 1 point 4, kip-ft', M('G1', 4).max, 3249, 0.06 * 3249, 'E4 Table 5: 3249');
  near('E4 G2 LL+I positive moment, span 2 point 5, kip-ft', M('G2', 15).max, 2668, 0.04 * 2668, 'E4 Table 6: 2668');
  near('E4 G4 fatigue positive moment, span 1 point 4, kip-ft', M('G4', 4).fatMax, 1611, 0.04 * 1611, 'E4 Table 8: 1611');
  near('E4 G3 fatigue negative moment, pier 1, kip-ft', M('G3', 10).fatMin, -732, 0.06 * 732, 'E4 Table 7: -732');
  const rx = L.out.filter(r => r.kind === 'R');
  near('E4 live load: reactions symmetric about span 2 (G4 abutments), kip', rx.find(r => r.g === 'G4' && r.support === 'Abut 1').max - rx.find(r => r.g === 'G4' && r.support === 'Abut 2').max, 0, 1);
  near('E4 G1 LL+I end shear, kip', L.out.filter(r => r.kind === 'V' && r.g === 'G1')[0].max, 109, 0.06 * 109, 'E4 Table 1: 109');

  // phase 5: G4 through the Steel Line Girder check engine, with the grid's forces. Example 4 checks G4 by its own 3D
  // analysis (stiffeners at 82 in., (ADTT)SL 1,000), so the ratios agree to a few hundredths, not exactly
  const ctx = load('steel-2d-grillage'), LG = ctx.LGCheck, gm = G.girderModel(R, L, 'G4', { adtt: 1000, lanes: 1, do: 82 });
  is('checks: the grillage page carries the Steel Line Girder engine unchanged', (() => {
    const blk = f => [...fs.readFileSync(path.join(ROOT, 'site', f, 'index.html'), 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.includes('root.LGCheck = api'));
    const a = blk('steel-line-girder'), b = blk('steel-2d-grillage'); return a.length === 1 && b.length === 1 && a[0] === b[0]; })(), true);
  is('checks: E4 G4 is curved (6.10.6.2.2)', gm.m.options.curved, true);
  const r = LG.run(gm.m), S1 = gm.m.spans[0], top = (f) => r.checks.filter(f).reduce((a, c) => (!a || c.ratio > a.ratio ? c : a), null);
  const pos = top(c => c.lim === 'Strength I' && c.what === 'Positive moment, bottom flange (+LL)' && c.x > 0.3 * S1 && c.x < 0.5 * S1);
  is('checks: E4 G4-1 positive flexure is noncompact (fbu + fℓ/3 ≤ RhFyt)', /fbu \+ fℓ\/3/.test(pos.note), true);
  near('checks: E4 G4-1 Strength I bottom flange ratio', pos.ratio, 0.953, 0.07, 'E4 8.1: 0.953');
  const fat = top(c => c.lim === 'Fatigue I' && c.what === 'Cross-frame connection plate weld toe, bottom flange' && c.x > 0.3 * S1 && c.x < 0.6 * S1);
  is('checks: fatigue at the connection plate includes lateral bending', /with lateral bending/.test(fat.note), true);
  near('checks: E4 G4-1 Fatigue I connection plate ratio', fat.ratio, 0.990, 0.07, 'E4 8.1: 1.75(5.86 + 0.93)/12.0 = 0.990');
  const neg = top(c => c.lim === 'Strength I' && /^Negative moment, bottom flange/.test(c.what) && Math.abs(c.x - S1) < 0.6);
  near('checks: E4 G4-2 Strength I bottom flange ratio at the pier', neg.ratio, 0.92, 0.12, 'E4 8.2: 0.92 to 0.95');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
