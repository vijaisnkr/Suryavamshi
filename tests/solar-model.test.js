/**
 * Calculator model checks. Run: node --test tests/solar-model.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const model = require(path.join(root, 'js', 'solar-model.js'));

function loadConfig() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8'), ctx);
  return ctx.window.SOORYAVAMSHI_CONFIG.calculator;
}

const cfg = loadConfig();

function est(input) {
  return model.estimate(Object.assign({ asOf: '2026-10-26' }, input), cfg);
}

test('3 kWp and 5 kWp generation at yield 5', () => {
  const three = model.generation(3, 5, { days: 30, year: 2026 });
  const five = model.generation(5, 5, { days: 30, year: 2026 });
  assert.equal(three.dailyKwh, 15);
  assert.equal(three.monthlyKwh, 450);
  assert.equal(five.dailyKwh, 25);
  assert.equal(five.monthlyKwh, 750);
  assert.equal(three.annualKwh, 15 * 365);
  assert.equal(five.annualKwh, 25 * 365);
  assert.equal(model.monthLengths(2026).reduce((s, d) => s + d, 0), 365);
});

test('bill bands: 450, 3800, 6000 and above 6000', () => {
  const a = est({ monthlyBill: 450, unitsAreMeasured: false, residential: true });
  const b = est({ monthlyBill: 3800, unitsAreMeasured: false, residential: true });
  const c = est({ monthlyBill: 6000, unitsAreMeasured: false, residential: true });
  const d = est({ monthlyBill: 8000, unitsAreMeasured: false, residential: true });
  assert.equal(a.ok, true);
  assert.equal(a.fixedPackageKw, 3);
  assert.equal(a.region, 'Kerala');
  assert.equal(a.preliminaryUnits, true);
  assert.match(a.warnings.join(' '), /does not map exactly to units/);
  assert.equal(b.fixedPackageKw, 3);
  assert.equal(c.fixedPackageKw, 5);
  assert.equal(d.fixedPackageKw, null);
  assert.equal(d.siteAssessment, true);
  assert.notEqual(Math.round(d.dcKwp), 3);
  assert.notEqual(Math.round(d.dcKwp), 5);
  assert.ok(d.dcKwp > 3 && d.dcKwp < 8);
});

test('units entered directly are not treated as a rupee-bill guess', () => {
  const r = est({ monthlyUnits: 400, unitsAreMeasured: true, residential: true });
  assert.equal(r.ok, true);
  assert.equal(r.fixedPackageKw, 3);
  assert.equal(r.preliminaryUnits, false);
  assert.equal(r.monthlyUnits, 400);
  assert.equal(r.currentBillSource, 'schedule');
  assert.ok(r.currentBillInr > 3000 && r.currentBillInr < 4000);
});

test('daytime use, night import and a near balance do not use consumption minus generation', () => {
  const day = est({ monthlyUnits: 900, unitsAreMeasured: true, usagePattern: 'day', residential: true });
  const night = est({ monthlyUnits: 900, unitsAreMeasured: true, usagePattern: 'night', residential: true });
  assert.ok(night.flow.importKwh > day.flow.importKwh);
  assert.ok(night.flow.exportKwh > day.flow.exportKwh);
  assert.ok(night.postSolarBillInr > day.postSolarBillInr);
  assert.ok(night.flow.exportKwh > 200 && night.flow.importKwh > 200);
  const naive = night.monthlyUnits - night.generation.monthlyKwh;
  assert.notEqual(Math.round(night.settlement.billedUnitsKwh), Math.round(naive));
  const flat = night.generation.monthlyKwh * 7.2;
  assert.notEqual(Math.round(night.monthlySavingsInr), Math.round(flat));

  const even = est({ monthlyUnits: 800, unitsAreMeasured: true, usagePattern: 'day', residential: true });
  assert.ok(Math.abs(even.flow.importKwh - even.flow.exportKwh) < 80);
  assert.ok(even.flow.importKwh > 0 && even.flow.exportKwh > 0);
});

test('subsidy is residential and capped, and net cost is hidden when ineligible', () => {
  const home = est({ monthlyUnits: 400, unitsAreMeasured: true, residential: true });
  const shop = est({ monthlyUnits: 400, unitsAreMeasured: true, residential: false });
  assert.equal(home.subsidy.amountInr, 78000);
  assert.equal(home.showNetCost, true);
  assert.equal(home.netCostInr, home.grossCostInr - 78000);
  assert.ok(home.subsidy.eligibleKw <= 3);
  assert.ok(home.subsidy.systemKw > home.subsidy.eligibleKw);
  assert.equal(shop.subsidy.amountInr, 0);
  assert.equal(shop.showNetCost, false);
  assert.equal(shop.netCostInr, null);
  const sub = cfg.assumptions.subsidy;
  assert.equal(model.subsidyFor(1, true, sub).amountInr, 30000);
  assert.equal(model.subsidyFor(2, true, sub).amountInr, 60000);
  assert.equal(model.subsidyFor(5, true, sub).amountInr, 78000);
  assert.equal(model.subsidyFor(1.5, true, sub).amountInr, 45000);
});

test('cash, loan, zero interest and a normal EMI', () => {
  const cash = est({ monthlyUnits: 400, unitsAreMeasured: true, payment: 'cash' });
  assert.equal(cash.loan.emiInr, 0);
  assert.equal(cash.combinedMonthlyOutflowInr, cash.postSolarBillInr);

  const loan = est({
    monthlyUnits: 400,
    unitsAreMeasured: true,
    payment: 'loan',
    schemeId: 'sbi',
    projectCost: 200000,
    downPayment: 20000,
    annualRate: 6,
    tenureMonths: 114,
    moratoriumMonths: 0
  });
  const expected = model.emi(180000, 6, 114);
  assert.ok(Math.abs(loan.loan.emiInr - expected) < 0.01);
  assert.equal(loan.loan.floating, true);
  assert.ok(Math.abs(loan.combinedMonthlyOutflowInr - (loan.loan.emiInr + loan.postSolarBillInr)) < 0.01);
  const subtracted = loan.loan.emiInr + loan.postSolarBillInr - loan.monthlySavingsInr;
  assert.notEqual(Math.round(loan.combinedMonthlyOutflowInr), Math.round(subtracted));

  const free = est({
    monthlyUnits: 400,
    unitsAreMeasured: true,
    payment: 'loan',
    schemeId: 'custom',
    projectCost: 120000,
    downPayment: 0,
    annualRate: 0,
    tenureMonths: 12,
    moratoriumMonths: 0
  });
  assert.equal(free.loan.emiInr, 10000);
  assert.equal(free.loan.totalInterestInr, 0);
});

test('missing tariff and a stale loan rate are disclosed', () => {
  const bare = JSON.parse(JSON.stringify(cfg));
  bare.assumptions.tariff.slabs = [];
  const missing = model.estimate({ monthlyBill: 3500, unitsAreMeasured: false, asOf: '2026-10-26' }, bare);
  assert.equal(missing.ok, true);
  assert.equal(missing.fixedPackageKw, 3);
  assert.equal(missing.monthlySavingsInr, null);
  assert.match(missing.warnings.join(' '), /tariff schedule is missing/);

  const high = model.estimate({ monthlyBill: 9000, unitsAreMeasured: false, asOf: '2026-10-26' }, bare);
  assert.equal(high.ok, false);

  const staleCfg = JSON.parse(JSON.stringify(cfg));
  staleCfg.assumptions.loans.sbi.lastVerified = '2024-01-01';
  const stale = model.estimate({
    monthlyUnits: 400,
    unitsAreMeasured: true,
    payment: 'loan',
    schemeId: 'sbi',
    projectCost: 180000,
    downPayment: 18000,
    asOf: '2026-10-26'
  }, staleCfg);
  assert.equal(stale.loan.rateNeedsReview, true);
  assert.match(stale.warnings.join(' '), /last checked on 2024-01-01/);
  assert.equal(stale.loan.annualRatePercent, 6);
  const bigger = est({
    monthlyUnits: 400,
    unitsAreMeasured: true,
    payment: 'loan',
    schemeId: 'sbi',
    projectCost: 300000,
    downPayment: 30000
  });
  assert.equal(bigger.loan.annualRatePercent, 8.15);

  const range = est({
    monthlyUnits: 400,
    unitsAreMeasured: true,
    payment: 'loan',
    schemeId: 'central',
    projectCost: 350000,
    downPayment: 70000
  });
  assert.equal(range.loan.missingRate, true);
  assert.equal(range.loan.emiInr, null);
  assert.ok(range.loan.range[0] === 8.2 && range.loan.range[1] === 9.75);
});

test('a two-month bill is normalised to a month and savings use that month', () => {
  const two = est({ monthlyBill: 7600, periodMonths: 2, unitsAreMeasured: false });
  const one = est({ monthlyBill: 3800, periodMonths: 1, unitsAreMeasured: false });
  assert.equal(two.periodMonths, 2);
  assert.match(two.periodLabel, /Two-month/);
  assert.equal(two.fixedPackageKw, 3);
  assert.equal(two.monthlyBillEntered, 3800);
  assert.equal(two.fixedPackageKw, one.fixedPackageKw);
  assert.ok(Math.abs(two.postSolarBillInr - one.postSolarBillInr) < 1);
  assert.equal(two.annualSavingsInr, two.monthlySavingsInr * 12);
  assert.ok(two.monthlySavingsInr < 7600);
});

test('panels, DC capacity, inverter and generation use one system', () => {
  const r = est({ monthlyBill: 3800, unitsAreMeasured: false });
  assert.equal(r.fixedPackageKw, 3);
  assert.equal(r.panelCount, 6);
  assert.equal(r.panelWattage, 550);
  assert.equal(r.dcKwp, 3.3);
  assert.equal(r.nominalKw, 3);
  assert.equal(r.generation.dailyKwh, 15);
  assert.equal(r.generation.monthlyKwh, 450);
  assert.equal(r.generation.monthlyKwh * 2, 900);
  assert.equal(r.moduleGeneration.dailyKwh, 3.3 * 5);
  assert.equal(r.moduleGeneration.monthlyKwh, 495);
  assert.equal(r.inverter.kw, 3.3);
  assert.ok(r.inverter.ratio >= 1 && r.inverter.ratio <= 1.25);
  assert.equal(r.inverter.phase, 'single phase');
  assert.equal(r.roofSqFt, 330);
  const five = est({ monthlyBill: 6000, unitsAreMeasured: false });
  assert.equal(five.panelCount, 10);
  assert.equal(five.dcKwp, 5.5);
  assert.equal(five.nominalKw, 5);
  assert.equal(five.generation.dailyKwh, 25);
  assert.equal(five.generation.monthlyKwh, 750);
  assert.equal(five.generation.monthlyKwh * 2, 1500);
  assert.equal(five.inverter.kw, 5);
  assert.equal(five.inverter.phase, 'three phase');
  assert.ok(five.inverter.ratio >= 1 && five.inverter.ratio <= 1.25);
});

test('bills above Rs 6,000 round to a package step and the inverter tracks the array', () => {
  const high = est({ monthlyBill: 8000, unitsAreMeasured: false, residential: true });
  assert.equal(high.ok, true);
  assert.equal(high.fixedPackageKw, null);
  assert.equal(high.siteAssessment, true);
  assert.equal(high.nominalKw, 6);
  assert.equal(high.capacityLabel, '6 kW');
  assert.equal(high.dcKwp, 6.05);
  assert.equal(high.inverter.kw, 6);
  assert.equal(high.inverter.phase, 'three phase');
  assert.ok(high.inverter.ratio >= 1 && high.inverter.ratio <= 1.25);
  assert.ok(high.inverter.kw < 8);
});

test('a 3 kW month of 450 units with 225 units used can net the energy and fixed charge to zero', () => {
  const sample = est({ monthlyBill: 3800, unitsAreMeasured: false, residential: true });
  const half = sample.workedExample.half;
  const sixty = sample.workedExample.sixty;
  assert.equal(half.illustrative, true);
  assert.equal(half.generationKwh, 450);
  assert.equal(half.twoMonthGenerationKwh, 900);
  assert.equal(half.consumptionKwh, 225);
  assert.equal(half.energyInr, 0);
  assert.ok(half.fixedInr > 0);
  assert.ok(half.fitCreditInr + 0.01 >= half.fixedInr);
  assert.ok(half.billInr < 1);
  assert.equal(half.couldBeZero, true);
  assert.equal(half.excludesDuty, true);
  assert.match(half.detail, /Illustrative only/);
  assert.match(half.detail, /could be zero or near zero/);
  assert.match(half.detail, /not a guarantee/);
  assert.match(half.detail, /duty/i);
  assert.equal(sixty.consumptionKwh, 270);
  assert.equal(sixty.share, 0.6);
  assert.match(sixty.detail, /Illustrative only/);
  assert.equal(/free electricity/i.test(half.detail + sixty.detail), false);
});

test('the 60% rows are labelled illustrative and do not replace the main flows', () => {
  const r = est({ monthlyUnits: 600, unitsAreMeasured: true, usagePattern: 'night' });
  assert.equal(r.illustrative60.length, 4);
  const names = r.illustrative60.map(row => row.name);
  assert.ok(names.some(n => /self-consumed/.test(n)));
  assert.ok(names.some(n => /exported/.test(n)));
  assert.ok(names.some(n => /60% of generation/.test(n)));
  assert.ok(names.some(n => /near zero/.test(n)));
  r.illustrative60.forEach(row => {
    assert.equal(row.illustrative, true);
    assert.match(row.detail, /Illustrative only/);
  });
  assert.notEqual(r.illustrative60[0].selfConsumptionKwh, r.flow.selfConsumptionKwh);
  const blob = JSON.stringify(r.wording) + r.notes.join(' ') + r.warnings.join(' ');
  assert.equal(/free electricity/i.test(blob), false);
  assert.match(r.wording.caveat, /KSEB billing rules/);
});

test('empty, zero and nonsense inputs are rejected', () => {
  assert.equal(est({}).ok, false);
  assert.equal(est({ monthlyBill: 0 }).ok, false);
  assert.equal(est({ monthlyUnits: -5, unitsAreMeasured: true }).ok, false);
  assert.equal(est({ monthlyBill: 'abc' }).ok, false);
  const odd = est({ monthlyBill: 3800, yieldKwh: 12 });
  assert.equal(odd.yieldKwh, 6);
  assert.equal(odd.yieldClamped, true);
});

test('SBI and Central Bank presets keep the checked dates', () => {
  const sbi = cfg.assumptions.loans.sbi;
  const central = cfg.assumptions.loans.central;
  assert.equal(sbi.lastVerified, '2026-10-26');
  assert.equal(sbi.slabs[0].annualRatePercent, 6);
  assert.equal(sbi.slabs[1].annualRatePercent, 8.15);
  assert.equal(sbi.floating, true);
  assert.equal(sbi.marginPercent, 10);
  assert.equal(sbi.processingFeeInr, 0);
  assert.equal(sbi.maxAmountInr, 600000);
  assert.equal(central.slabs[0].annualRatePercent, 5.75);
  assert.equal(central.slabs[0].marginPercent, 10);
  assert.equal(central.slabs[1].marginPercent, 20);
  assert.equal(central.slabs[1].annualRatePercent, null);
  assert.equal(cfg.assumptions.subsidy.capInr, 78000);
  assert.equal(cfg.assumptions.yield.default, 5);
  assert.equal(cfg.region, 'Kerala');
  assert.equal(cfg.states.length, 1);
  assert.equal(cfg.states[0].name, 'Kerala');
});
