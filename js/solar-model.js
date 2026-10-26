/**
 * Suryavamshi solar estimate — pure calculation, no DOM.
 * Default case: Kerala, KSEB, grid-connected net metering, no battery.
 * All changeable numbers come from SOORYAVAMSHI_CONFIG.calculator.assumptions.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SolarModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var n = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return n;
  }

  function roundTo(n, dp) {
    var f = Math.pow(10, dp);
    return Math.round(n * f) / f;
  }

  function isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  function monthLengths(year) {
    return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  }

  function daysBetween(iso, asOf) {
    if (!iso || !asOf) return null;
    var a = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
    var b = Date.parse(String(asOf).slice(0, 10) + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  function isStale(iso, asOf, maxAgeDays) {
    var d = daysBetween(iso, asOf);
    if (d == null) return true;
    return d > maxAgeDays;
  }

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function assumptionsOf(config) {
    if (config && config.assumptions) return config.assumptions;
    if (config && config.calculator && config.calculator.assumptions) return config.calculator.assumptions;
    var g = typeof globalThis !== 'undefined' ? globalThis.SOORYAVAMSHI_CONFIG : null;
    if (g && g.calculator && g.calculator.assumptions) return g.calculator.assumptions;
    return null;
  }

  /**
   * daily kWh = kWp × yield. monthly = daily × days. annual = sum of calendar months.
   */
  function generation(kwp, yieldKwh, opts) {
    var daily = kwp * yieldKwh;
    var days = opts && isNum(opts.days) ? opts.days : 30;
    var year = opts && opts.year ? opts.year : 2026;
    var months = monthLengths(year);
    var annual = 0;
    for (var i = 0; i < months.length; i++) annual += daily * months[i];
    return {
      dailyKwh: daily,
      monthDays: days,
      monthlyKwh: daily * days,
      annualKwh: annual,
      year: year,
      monthLengths: months
    };
  }

  function scheduleBill(units, phase, tariff) {
    if (!tariff || !Array.isArray(tariff.slabs) || !tariff.slabs.length) {
      return { ok: false, incomplete: true, energyInr: null, fixedInr: null, totalInr: null };
    }
    if (!isNum(units) || units < 0) return { ok: false, invalid: true };
    if (units === 0) {
      return { ok: true, energyInr: 0, fixedInr: 0, totalInr: 0, telescopic: false, slabLabel: '0', excludesDuty: true };
    }
    var slabs = tariff.slabs;
    var slab = slabs[slabs.length - 1];
    for (var i = 0; i < slabs.length; i++) {
      if (units <= slabs[i].upTo) { slab = slabs[i]; break; }
    }
    var fixed = phase === 'three' ? slab.fixedThree : slab.fixedSingle;
    var energy = 0;
    if (slab.telescopic) {
      var prev = 0;
      var left = units;
      for (var j = 0; j < slabs.length; j++) {
        if (!slabs[j].telescopic) break;
        var width = slabs[j].upTo - prev;
        var take = Math.min(left, width);
        energy += take * slabs[j].energy;
        left -= take;
        prev = slabs[j].upTo;
        if (left <= 1e-9) break;
      }
    } else {
      energy = units * slab.energy;
    }
    return {
      ok: true,
      incomplete: false,
      energyInr: energy,
      fixedInr: fixed,
      totalInr: energy + fixed,
      telescopic: !!slab.telescopic,
      slabLabel: slab.label || String(slab.upTo),
      excludesDuty: tariff.dutyIncluded === false
    };
  }

  function invertBill(bill, phase, tariff) {
    var sched = scheduleBill(1, phase, tariff);
    if (!sched.ok) return { ok: false, incomplete: !!sched.incomplete };
    if (!isNum(bill) || bill <= 0) return { ok: false, invalid: true };
    var best = null;
    for (var u = 0; u <= 25000; u++) {
      var s = scheduleBill(u, phase, tariff);
      var gap = Math.abs(s.totalInr - bill);
      if (!best || gap < best.gap - 1e-6 || (Math.abs(gap - best.gap) <= 1e-6 && u < best.units)) {
        best = { units: u, scheduleBill: s.totalInr, gap: gap };
      }
    }
    return {
      ok: true,
      units: best.units,
      scheduleBill: best.scheduleBill,
      gap: best.gap,
      preliminary: true
    };
  }

  function flows(consumptionKwh, generationKwh, daytimeFraction) {
    var fraction = Math.min(1, Math.max(0, daytimeFraction));
    var daytimeLoad = consumptionKwh * fraction;
    var selfUse = Math.min(generationKwh, daytimeLoad);
    var exp = generationKwh - selfUse;
    var imp = consumptionKwh - selfUse;
    return {
      daytimeFraction: fraction,
      daytimeLoadKwh: daytimeLoad,
      selfConsumptionKwh: selfUse,
      exportKwh: exp,
      importKwh: imp,
      solarImportKwh: daytimeLoad - selfUse,
      nightImportKwh: consumptionKwh - daytimeLoad
    };
  }

  /**
   * Same-zone solar netting, then bank surplus solar export against night import.
   * Domestic factor is 1.0 up to 2 kW. Above that, off-peak take-back uses 0.85
   * (peak and off-peak are not metered separately here; night use is treated as off-peak).
   */
  function settle(flow, dcKwp, rules) {
    var upTo = rules.factorIsOneUpToKw;
    var flat = dcKwp <= upTo + 1e-9;
    var bankFactor = rules.solarExportFactorDomestic;
    var takeback = flat ? 1 : rules.offPeakTakebackDomestic;
    var banked = flow.exportKwh * bankFactor;
    var night = flow.nightImportKwh;
    var eligible = banked * takeback;
    var nightCovered = Math.min(night, eligible);
    var bankedUsed = takeback > 0 ? nightCovered / takeback : 0;
    var surplus = Math.max(0, banked - bankedUsed);
    var billed = flow.solarImportKwh + Math.max(0, night - nightCovered);
    return {
      flatFactor: flat,
      bankFactor: bankFactor,
      takebackFactor: takeback,
      bankedKwh: banked,
      nightCoveredKwh: nightCovered,
      surplusBankedKwh: surplus,
      billedUnitsKwh: billed,
      physicalNetImportKwh: flow.importKwh - flow.exportKwh
    };
  }

  function gridSupport(dcKwp, nightCoveredKwh, rules) {
    if (dcKwp <= rules.gridSupportExemptUpToKw + 1e-9) {
      return { inr: 0, exempt: true, units: 0 };
    }
    var units = Math.max(0, nightCoveredKwh);
    var first = Math.min(units, rules.gridSupportFirstUnits);
    var rest = Math.max(0, units - rules.gridSupportFirstUnits);
    return {
      inr: first * rules.gridSupportFirstInr + rest * rules.gridSupportRestInr,
      exempt: false,
      units: units
    };
  }

  function postSolarCharges(grossUnits, settlement, phase, tariff, rules) {
    var fixedPart = scheduleBill(grossUnits, phase, tariff);
    var energyPart = scheduleBill(settlement.billedUnitsKwh, phase, tariff);
    if (!fixedPart.ok || !energyPart.ok) {
      return { ok: false, incomplete: true };
    }
    var surplus = settlement.surplusBankedKwh;
    var fit = rules.newProsumerSolarFitInr;
    var monetisedUnits = 0;
    var fitCredit = 0;
    if (isNum(fit) && fit > 0 && surplus > 0 && fixedPart.fixedInr > 0) {
      monetisedUnits = Math.min(surplus, fixedPart.fixedInr / fit);
      fitCredit = monetisedUnits * fit;
      surplus -= monetisedUnits;
    }
    var bankingUnits = surplus * (rules.monthlyBankingCharge || 0);
    var carried = Math.max(0, surplus - bankingUnits);
    var gsc = gridSupport(settlement.dcKwp, settlement.nightCoveredKwh, rules);
    var total = Math.max(0, energyPart.energyInr + fixedPart.fixedInr - fitCredit) + gsc.inr;
    return {
      ok: true,
      incomplete: false,
      energyInr: energyPart.energyInr,
      fixedInr: fixedPart.fixedInr,
      fitCreditInr: fitCredit,
      monetisedUnits: monetisedUnits,
      fitRate: fit,
      bankingUnits: bankingUnits,
      carriedKwh: carried,
      gridSupportInr: gsc.inr,
      gridSupportExempt: gsc.exempt,
      totalInr: total,
      excludesDuty: true,
      veryLow: total < 1
    };
  }

  function panelsForTarget(targetKw, watt) {
    var count = Math.max(1, Math.ceil((targetKw * 1000) / watt - 1e-6));
    return { panelCount: count, dcKwp: count * watt / 1000 };
  }

  function applyCaps(count, watt, limits) {
    var notes = [];
    var site = false;
    var start = count;
    if (isNum(limits.roofSqFt) && limits.roofSqFt >= 0 && limits.spaceSqFtPerKw > 0) {
      var maxKw = limits.roofSqFt / limits.spaceSqFtPerKw;
      while (count > 0 && (count * watt / 1000) > maxKw + 1e-9) count--;
      if (count < start) {
        notes.push('The shade-free roof area you entered limits the array.');
        site = true;
      }
    }
    var afterRoof = count;
    if (isNum(limits.sanctionedKw) && limits.sanctionedKw >= 0) {
      while (count > 0 && (count * watt / 1000) > limits.sanctionedKw + 1e-9) count--;
      if (count < afterRoof) {
        notes.push('KSERC Regulation 6.6: plant capacity should not exceed the sanctioned or connected load.');
        site = true;
      }
    }
    var afterLoad = count;
    if (isNum(limits.maxKw)) {
      while (count > 0 && (count * watt / 1000) > limits.maxKw + 1e-9) count--;
      if (count < afterLoad) {
        notes.push('Domestic net metering in the 2025 KSERC regulations is for 1 kW to 20 kW.');
        site = true;
      }
    }
    return { panelCount: count, dcKwp: count * watt / 1000, notes: notes, site: site, blocked: count === 0 };
  }

  var INVERTER_SIZES_KW = [3, 3.3, 5, 6, 8, 10, 12, 15, 20];

  /**
   * AC rating stays inside a DC/AC ratio of about 1.0 to 1.25
   * (array kWp divided by inverter kW). Prefer the largest standard size
   * that is not bigger than the array. Above 5 kW DC the connection is
   * three phase; up to 5 kW DC it stays single phase.
   */
  function inverterFor(dcKwp) {
    var inBand = [];
    var i;
    for (i = 0; i < INVERTER_SIZES_KW.length; i++) {
      var size = INVERTER_SIZES_KW[i];
      var ratioTry = dcKwp / size;
      if (ratioTry >= 1 - 1e-9 && ratioTry <= 1.25 + 1e-6) inBand.push(size);
    }
    var kw;
    if (inBand.length) {
      kw = inBand[inBand.length - 1];
    } else {
      kw = INVERTER_SIZES_KW[INVERTER_SIZES_KW.length - 1];
      for (i = 0; i < INVERTER_SIZES_KW.length; i++) {
        if (dcKwp / INVERTER_SIZES_KW[i] <= 1.25 + 1e-6) { kw = INVERTER_SIZES_KW[i]; break; }
      }
    }
    var ratio = dcKwp / kw;
    var three = dcKwp > 5 + 1e-9;
    return {
      kw: kw,
      text: (kw % 1 ? kw.toFixed(1) : String(kw)) + ' kW',
      phase: three ? 'three phase' : 'single phase',
      ratio: roundTo(ratio, 2)
    };
  }

  function packageSteps(a) {
    return (a && a.sales && a.sales.packageStepsKw) || [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
  }

  function nearestPackageKw(raw, a) {
    var steps = packageSteps(a);
    var best = steps[0];
    var bestDist = Math.abs(raw - best);
    for (var i = 1; i < steps.length; i++) {
      var dist = Math.abs(raw - steps[i]);
      if (dist < bestDist - 1e-9) { best = steps[i]; bestDist = dist; }
    }
    return best;
  }

  function subsidyFor(dcKwp, residential, sub) {
    var out = {
      residential: !!residential,
      eligible: false,
      amountInr: 0,
      eligibleKw: 0,
      systemKw: dcKwp,
      capInr: sub.capInr,
      assumptions: 'Central CFA only. A registered vendor, a residential connection, inspection and commissioning are all required. Payment comes after commissioning, into the bank or loan account. It is not deducted on the day of this estimate.'
    };
    if (!residential) {
      out.reason = 'The central CFA is for residential consumers. It is not applied automatically to a commercial or other ineligible connection.';
      return out;
    }
    if (!(dcKwp > 0)) return out;
    var first = Math.min(dcKwp, sub.firstBandKw) * sub.firstBandInrPerKw;
    var secondKw = Math.max(0, Math.min(dcKwp, sub.secondBandKw) - sub.firstBandKw);
    var second = secondKw * sub.secondBandInrPerKw;
    out.eligible = true;
    out.amountInr = Math.min(sub.capInr, first + second);
    out.eligibleKw = Math.min(dcKwp, sub.secondBandKw);
    out.reason = 'Subject to eligibility. Shown separately from the system cost. Not guaranteed and not immediate.';
    return out;
  }

  function emi(principal, annualRatePercent, months) {
    if (!isNum(principal) || !isNum(months) || months <= 0) return null;
    if (principal <= 0) return 0;
    var r = annualRatePercent / 100 / 12;
    if (!isNum(annualRatePercent) || annualRatePercent === 0 || Math.abs(r) < 1e-12) return principal / months;
    var pow = Math.pow(1 + r, months);
    return principal * r * pow / (pow - 1);
  }

  function loanScheme(a, id) {
    if (!a || !a.loans) return null;
    return a.loans[id] || null;
  }

  function schemeRate(scheme, loanAmount) {
    if (!scheme || !scheme.slabs) return { rate: null, needsEntry: true, marginPercent: null, slab: null };
    var slab = scheme.slabs[scheme.slabs.length - 1];
    for (var i = 0; i < scheme.slabs.length; i++) {
      if (loanAmount <= scheme.slabs[i].maxInr + 1e-6) { slab = scheme.slabs[i]; break; }
    }
    var margin = isNum(slab.marginPercent) ? slab.marginPercent : scheme.marginPercent;
    if (!isNum(slab.annualRatePercent)) {
      return {
        rate: null,
        needsEntry: true,
        marginPercent: margin,
        slab: slab,
        range: isNum(slab.rateMin) ? [slab.rateMin, slab.rateMax] : null
      };
    }
    return { rate: slab.annualRatePercent, needsEntry: false, marginPercent: margin, slab: slab, range: null };
  }

  function buildLoan(input, grossCost, a, asOf) {
    var base = {
      active: input.payment === 'loan',
      emiInr: 0,
      principalInr: 0,
      downPaymentInr: isNum(input.downPayment) ? input.downPayment : grossCost,
      annualRatePercent: null,
      floating: null,
      tenureMonths: null,
      moratoriumMonths: 0,
      repaymentMonths: null,
      totalRepaymentInr: 0,
      totalInterestInr: 0,
      rateNeedsReview: false,
      rateNeedsEntry: false,
      missingRate: false,
      aboveSchemeMax: false,
      scheme: null
    };
    if (input.payment !== 'loan') return base;
    var scheme = input.schemeId === 'custom' ? null : loanScheme(a, input.schemeId || 'sbi');
    base.scheme = scheme;
    var down = isNum(input.downPayment) ? input.downPayment : null;
    var principal = 0;
    var picked = { rate: null, needsEntry: true, marginPercent: null, range: null, slab: null };
    if (down == null) {
      var margin = scheme && isNum(scheme.marginPercent) ? scheme.marginPercent : 10;
      down = grossCost * margin / 100;
      principal = Math.max(0, grossCost - down);
      if (scheme) {
        picked = schemeRate(scheme, principal);
        if (isNum(picked.marginPercent) && Math.abs(picked.marginPercent - margin) > 0.01) {
          down = grossCost * picked.marginPercent / 100;
          principal = Math.max(0, grossCost - down);
          picked = schemeRate(scheme, principal);
        }
      }
    } else {
      principal = Math.max(0, grossCost - down);
      if (scheme) picked = schemeRate(scheme, principal);
    }
    if (scheme && isNum(scheme.maxAmountInr) && principal > scheme.maxAmountInr + 1) {
      base.aboveSchemeMax = true;
    }
    picked = scheme ? schemeRate(scheme, principal) : picked;
    var rate = isNum(input.annualRate) ? input.annualRate : picked.rate;
    var stale = false;
    if (scheme) {
      stale = isStale(scheme.lastVerified, asOf, a.staleAfterDays || 120);
    }
    if (!isNum(rate)) {
      base.principalInr = principal;
      base.downPaymentInr = down;
      base.rateNeedsEntry = true;
      base.missingRate = true;
      base.rateNeedsReview = stale || !scheme;
      base.floating = scheme ? !!scheme.floating : null;
      base.annualRatePercent = null;
      base.range = picked.range || null;
      base.emiInr = null;
      return base;
    }
    var tenure = isNum(input.tenureMonths) ? input.tenureMonths : (scheme ? scheme.maxTenureMonths : 120);
    var mora = isNum(input.moratoriumMonths) ? input.moratoriumMonths : (scheme ? scheme.defaultMoratoriumMonths : 0);
    if (mora < 0) mora = 0;
    if (mora >= tenure) mora = Math.max(0, tenure - 1);
    var n = tenure - mora;
    var instalment = emi(principal, rate, n);
    base.principalInr = principal;
    base.downPaymentInr = down;
    base.annualRatePercent = rate;
    base.floating = scheme ? !!scheme.floating : null;
    base.rateIsUser = isNum(input.annualRate);
    base.tenureMonths = tenure;
    base.moratoriumMonths = mora;
    base.repaymentMonths = n;
    base.emiInr = instalment;
    base.totalRepaymentInr = instalment * n;
    base.totalInterestInr = instalment * n - principal;
    base.rateNeedsReview = stale;
    base.rateNeedsEntry = !isNum(input.annualRate) && picked.needsEntry;
    base.range = picked.range || null;
    base.lastVerified = scheme ? scheme.lastVerified : null;
    base.processingFeeInr = scheme ? scheme.processingFeeInr : null;
    return base;
  }

  function illustrative(genKwh, consumptionKwh, daytimeFraction, dcKwp, phase, tariff, rules) {
    function pack(name, detail, flowConsumption, selfKwh, exportKwh) {
      var flow = {
        daytimeFraction: daytimeFraction,
        daytimeLoadKwh: null,
        selfConsumptionKwh: selfKwh,
        exportKwh: exportKwh,
        importKwh: flowConsumption - selfKwh,
        solarImportKwh: Math.max(0, (flowConsumption * daytimeFraction) - selfKwh),
        nightImportKwh: flowConsumption * (1 - daytimeFraction)
      };
      // Keep the identity import = consumption − self, export = generation − self.
      flow.importKwh = flowConsumption - selfKwh;
      flow.nightImportKwh = flow.importKwh - flow.solarImportKwh;
      var settled = settle(flow, dcKwp, rules);
      settled.dcKwp = dcKwp;
      var bill = postSolarCharges(flowConsumption, settled, phase, tariff, rules);
      return {
        name: name,
        detail: detail,
        illustrative: true,
        selfConsumptionKwh: selfKwh,
        exportKwh: exportKwh,
        importKwh: flow.importKwh,
        consumptionKwh: flowConsumption,
        generationKwh: genKwh,
        billedUnitsKwh: settled.billedUnitsKwh,
        billInr: bill.ok ? bill.totalInr : null
      };
    }
    var self60 = Math.min(consumptionKwh, genKwh * 0.6);
    var export60 = Math.min(genKwh * 0.6, genKwh);
    var selfWhenExport60 = Math.min(consumptionKwh, genKwh - export60);
    var use60 = genKwh * 0.6;
    var selfWhenUse60 = Math.min(use60, use60 * daytimeFraction, genKwh);
    // Net import near zero: set consumption equal to generation so import equals export
    // after the same daytime split (physical import = physical export).
    var selfBalanced = Math.min(genKwh, genKwh * daytimeFraction);
    return [
      pack(
        '60% of production self-consumed',
        'Illustrative only. Monthly use stays as in the estimate. Only the self-use share changes. This is not the low-use case.',
        consumptionKwh,
        self60,
        genKwh - self60
      ),
      pack(
        '60% of production exported',
        'Illustrative only. Monthly use stays as in the estimate, and export is set to 60% of generation. This situation does not net to zero.',
        consumptionKwh,
        selfWhenExport60,
        genKwh - selfWhenExport60
      ),
      pack(
        'Consumption equal to 60% of generation',
        'Illustrative only. Monthly use is set to 60% of generation. This is the low-use case.',
        use60,
        selfWhenUse60,
        genKwh - selfWhenUse60
      ),
      pack(
        'Net import near zero',
        'Illustrative only. Monthly use is set equal to generation, so physical import equals physical export. This situation does not net to zero. Banking can still leave a charge.',
        genKwh,
        selfBalanced,
        genKwh - selfBalanced
      )
    ];
  }

  function recommendCapacity(monthlyBill, monthlyUnits, unitsMeasured, yieldKwh, monthDays, a) {
    var sales = a.sales;
    var notes = [];
    var site = false;
    var fixedKw = null;
    var targetKw = null;

    function fromUnits(units) {
      var monthGen3 = sales.package3Kw * yieldKwh * monthDays;
      var monthGen5 = sales.package5Kw * yieldKwh * monthDays;
      // Bands sit on the generation of each package, with a little headroom.
      if (units <= monthGen3 * 1.15) return { fixedKw: sales.package3Kw, targetKw: sales.package3Kw, calculated: false };
      if (units <= monthGen5 * 1.1) return { fixedKw: sales.package5Kw, targetKw: sales.package5Kw, calculated: false };
      return { fixedKw: null, targetKw: (units / monthDays) / yieldKwh, calculated: true, site: true };
    }

    if (unitsMeasured && isNum(monthlyUnits)) {
      var byUnits = fromUnits(monthlyUnits);
      if (isNum(monthlyBill) && monthlyBill > sales.bill5KwMaxInr) {
        fixedKw = null;
        targetKw = (monthlyUnits / monthDays) / yieldKwh;
        site = true;
        notes.push('The bill is above Rs ' + sales.bill5KwMaxInr.toLocaleString('en-IN') + '. Capacity follows your units. There is no fixed 3 kW or 5 kW package. A site assessment is recommended.');
      } else if (byUnits.calculated) {
        fixedKw = null;
        targetKw = byUnits.targetKw;
        site = true;
        notes.push('Your units are above what a 5 kW array produces at this yield, so the size is calculated from consumption. A site assessment is recommended.');
      } else {
        fixedKw = byUnits.fixedKw;
        targetKw = byUnits.targetKw;
        if (isNum(monthlyBill)) {
          var billFixed = monthlyBill <= sales.bill3KwMaxInr ? sales.package3Kw : sales.package5Kw;
          if (billFixed !== fixedKw) {
            site = true;
            notes.push('The rupee bill would suggest ' + billFixed + ' kW. The units on the bill are weighed first, so the suggestion is ' + fixedKw + ' kW.');
          }
        }
        var sizedGen = fixedKw * yieldKwh * monthDays;
        if (monthlyUnits * 2 < sizedGen) {
          var raw = Math.max(a.domesticNetMeterMinKw, (monthlyUnits / monthDays) / yieldKwh);
          fixedKw = null;
          targetKw = raw;
          site = true;
          notes.push('The units you entered are well below what that package would generate, so the size follows the units instead. A site assessment should confirm it.');
        }
      }
    } else if (isNum(monthlyBill)) {
      if (monthlyBill <= sales.bill3KwMaxInr) {
        fixedKw = sales.package3Kw;
        targetKw = sales.package3Kw;
        notes.push('Bill up to Rs 3,800: the sales suggestion is 3 kW. It is preliminary, not an engineering design.');
      } else if (monthlyBill <= sales.bill5KwMaxInr) {
        fixedKw = sales.package5Kw;
        targetKw = sales.package5Kw;
        notes.push('Bill above Rs 3,800 and up to Rs 6,000: the sales suggestion is 5 kW. It is preliminary, not an engineering design.');
      } else if (isNum(monthlyUnits)) {
        fixedKw = null;
        targetKw = (monthlyUnits / monthDays) / yieldKwh;
        site = true;
        notes.push('The bill is above Rs ' + sales.bill5KwMaxInr.toLocaleString('en-IN') + '. Capacity is calculated from indicative units and rounded to a package step. It is not a fixed 3 kW or 5 kW offer. A site assessment is recommended.');
      } else {
        return { ok: false, notes: ['A bill above Rs 6,000 needs the units, or a tariff schedule that can sketch them.'] };
      }
    } else {
      return { ok: false, notes: ['Enter a bill or the units.'] };
    }

    if (fixedKw == null && isNum(targetKw)) {
      var rawKw = targetKw;
      var stepped = nearestPackageKw(Math.max(rawKw, a.domesticNetMeterMinKw), a);
      if (Math.abs(stepped - rawKw) > 0.05) {
        notes.push('The calculated size is about ' + roundTo(rawKw, 2) + ' kW. It is rounded to ' + stepped + ' kW. A site assessment should confirm the array.');
      }
      targetKw = stepped;
      site = true;
    }
    if (targetKw < a.domesticNetMeterMinKw) {
      notes.push('Domestic net metering starts at 1 kW in the 2025 KSERC regulations. The suggestion is not taken below that.');
      targetKw = a.domesticNetMeterMinKw;
      fixedKw = null;
      site = true;
    }
    return { ok: true, fixedKw: fixedKw, targetKw: targetKw, site: site, notes: notes };
  }

  function salesIllustration(yieldKwh, tariff, rules) {
    function scenario(name, share) {
      var daily = 3 * yieldKwh;
      var genKwh = daily * 30;
      var consumption = genKwh * share;
      var flow = flows(consumption, genKwh, 0.45);
      var settled = settle(flow, 3, rules);
      settled.dcKwp = 3;
      var post = postSolarCharges(consumption, settled, 'single', tariff, rules);
      var row = {
        name: name,
        illustrative: true,
        share: share,
        dailyKwh: daily,
        generationKwh: genKwh,
        twoMonthGenerationKwh: genKwh * 2,
        consumptionKwh: consumption,
        selfConsumptionKwh: flow.selfConsumptionKwh,
        exportKwh: flow.exportKwh,
        importKwh: flow.importKwh,
        billedUnitsKwh: settled.billedUnitsKwh,
        energyInr: post.ok ? post.energyInr : null,
        fixedInr: post.ok ? post.fixedInr : null,
        fitCreditInr: post.ok ? post.fitCreditInr : null,
        billInr: post.ok ? post.totalInr : null,
        excludesDuty: true,
        couldBeZero: !!(post.ok && post.totalInr < 1)
      };
      var billText = row.couldBeZero
        ? 'bill Rs 0 before duty'
        : 'bill Rs ' + Math.round(row.billInr) + ' before duty';
      row.line = 'Use ' + Math.round(consumption) + ' units (' + Math.round(share * 100) + '%). Energy Rs ' + Math.round(row.energyInr) + ', fixed Rs ' + Math.round(row.fixedInr) + ', credit Rs ' + Math.round(row.fitCreditInr) + ', ' + billText + '.';
      row.detail = row.line;
      return row;
    }
    var half = scenario('3 kW, 50% of generation used', 0.5);
    var sixty = scenario('3 kW, 60% of generation used', 0.6);
    return {
      systemKw: 3,
      label: 'Example: 3 kW system',
      generationKwh: half.generationKwh,
      twoMonthGenerationKwh: half.twoMonthGenerationKwh,
      disclaimer: 'Illustrative only. Not a guarantee. Your actual bill depends on KSEB billing rules and usage. Electricity duty is not included and can remain.',
      half: half,
      sixty: sixty
    };
  }

  function estimate(input, config) {
    input = input || {};
    var a = assumptionsOf(config);
    if (!a) return { ok: false, errors: ['Calculator assumptions are missing.'] };
    var errors = [];
    var warnings = [];
    var asOf = input.asOf || todayIso();

    var billRaw = parseNum(input.monthlyBill);
    var unitsRaw = parseNum(input.monthlyUnits);
    if (input.monthlyBill != null && input.monthlyBill !== '' && !isNum(billRaw)) errors.push('The bill is not a number.');
    if (input.monthlyUnits != null && input.monthlyUnits !== '' && !isNum(unitsRaw)) errors.push('The units are not a number.');
    if (isNum(billRaw) && billRaw < 0) errors.push('The bill cannot be negative.');
    if (isNum(unitsRaw) && unitsRaw < 0) errors.push('Units cannot be negative.');
    if (isNum(billRaw) && billRaw === 0 && !(isNum(unitsRaw) && unitsRaw > 0)) errors.push('Enter a bill above zero, or the units on the bill.');
    if (isNum(unitsRaw) && unitsRaw === 0 && !(isNum(billRaw) && billRaw > 0)) errors.push('Enter units above zero, or the bill amount.');
    if (errors.length) return { ok: false, errors: errors };

    var period = input.periodMonths === 2 ? 2 : 1;
    var bill = isNum(billRaw) ? billRaw / period : null;
    var units = isNum(unitsRaw) ? unitsRaw / period : null;
    if (isNum(bill) && bill > 200000) {
      bill = 200000;
      warnings.push('Bills are calculated up to Rs 2,00,000 a month.');
    }
    if (isNum(units) && units > 25000) {
      units = 25000;
      warnings.push('Units are calculated up to 25,000 kWh a month.');
    }

    var yieldInput = parseNum(input.yieldKwh);
    var yieldKwh = isNum(yieldInput) ? yieldInput : a.yield.default;
    var yieldClamped = false;
    if (yieldKwh < a.yield.min || yieldKwh > a.yield.max) {
      yieldKwh = Math.min(a.yield.max, Math.max(a.yield.min, yieldKwh));
      yieldClamped = true;
      warnings.push('Yield is kept inside the Kerala planning range of ' + a.yield.min + ' to ' + a.yield.max + ' kWh per kW per day.');
    }

    var patternId = input.usagePattern || a.defaultUsagePattern;
    var pattern = a.usagePatterns[patternId] || a.usagePatterns[a.defaultUsagePattern];
    var residential = input.residential !== false;
    var unitsMeasured = input.unitsAreMeasured === true && isNum(units);
    var tariff = a.tariff;
    var tariffStale = isStale(tariff && tariff.lastVerified, asOf, a.staleAfterDays || 120);
    if (!tariff || !tariff.slabs || !tariff.slabs.length) {
      warnings.push('The KSEB tariff schedule is missing, so the bill cannot be built from units.');
    } else if (tariffStale) {
      warnings.push('The saved KSEB tariff was last checked on ' + tariff.lastVerified + '. Treat the rupee figures as unchecked until that date is refreshed.');
    }
    if (tariff && tariff.dutyIncluded === false) {
      warnings.push('Electricity duty and other statutory levies are not in these figures. The published schedule says they are extra, and a duty rate was not verified.');
    }

    var phase = input.phase === 'three' ? 'three' : 'single';
    var preliminaryUnits = false;
    if (!unitsMeasured) {
      if (isNum(bill) && tariff && tariff.slabs) {
        var inverted = invertBill(bill, phase, tariff);
        if (inverted.ok) {
          units = inverted.units;
          preliminaryUnits = true;
          warnings.push('Only a rupee bill was entered. Slabs, fixed charges and duties mean it does not map exactly to units. Indicative use is about ' + units + ' kWh a month on the published LT-I schedule, before duty (schedule total Rs ' + Math.round(inverted.scheduleBill) + ', gap Rs ' + Math.round(inverted.gap) + ').');
        }
      }
    }

    var rec = recommendCapacity(bill, units, unitsMeasured, yieldKwh, a.displayMonthDays, a);
    if (!rec.ok) return { ok: false, errors: rec.notes, warnings: warnings };

    var roof = parseNum(input.roofSqFt);
    var sanctioned = parseNum(input.sanctionedLoadKw);
    var budget = parseNum(input.budgetInr);
    if (input.roofSqFt != null && input.roofSqFt !== '' && !isNum(roof)) errors.push('Roof area is not a number.');
    if (isNum(roof) && roof < 0) errors.push('Roof area cannot be negative.');
    if (input.sanctionedLoadKw != null && input.sanctionedLoadKw !== '' && !isNum(sanctioned)) errors.push('Sanctioned load is not a number.');
    if (isNum(sanctioned) && sanctioned <= 0) errors.push('Sanctioned load should be above zero, or left blank.');
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    var sized = panelsForTarget(rec.targetKw, a.panelWattage);
    var capped = applyCaps(sized.panelCount, a.panelWattage, {
      roofSqFt: isNum(roof) ? roof : null,
      sanctionedKw: isNum(sanctioned) ? sanctioned : null,
      spaceSqFtPerKw: a.spaceSqFtPerKw,
      maxKw: a.domesticNetMeterMaxKw
    });
    var notes = rec.notes.concat(capped.notes);
    var site = rec.site || capped.site;
    if (capped.blocked) {
      return {
        ok: false,
        errors: ['The roof area or sanctioned load you entered cannot fit a panel. A site assessment should measure both.'],
        warnings: warnings,
        siteAssessment: true
      };
    }
    if (capped.panelCount !== sized.panelCount) rec.fixedKw = null;

    var dcKwp = capped.dcKwp;
    var headlineKw = rec.targetKw;
    if (dcKwp + 1e-6 < headlineKw) {
      headlineKw = dcKwp;
      rec.fixedKw = null;
    }
    if (dcKwp > a.singlePhaseUpToKw + 1e-9) phase = 'three';
    if (dcKwp > a.storageNoteAboveKw + 1e-9) {
      notes.push('Above 10 kW, the 2025 KSERC regulations ask for battery storage on a new domestic net-metered system (10% above 10–15 kW, 20% above 15–20 kW). This estimate is for a system without a battery. From 1 April 2027 the storage rule also reaches systems above 5 kW.');
      site = true;
    }
    if (!preliminaryUnits && isNum(bill) && bill <= a.sales.bill3KwMaxInr && unitsMeasured && dcKwp > 4) {
      site = true;
    }

    var gen = generation(headlineKw, yieldKwh, { days: a.displayMonthDays, year: a.calendarYear });
    var moduleGen = generation(dcKwp, yieldKwh, { days: a.displayMonthDays, year: a.calendarYear });
    var monthUnits = isNum(units) ? units : 0;
    var flow = flows(monthUnits, gen.monthlyKwh, pattern.daytimeFraction);
    var settled = settle(flow, dcKwp, a.netMetering);
    settled.dcKwp = dcKwp;
    settled.nightCoveredKwh = settled.nightCoveredKwh;
    var post = postSolarCharges(monthUnits, settled, phase, tariff, a.netMetering);

    var currentBillInr = null;
    var currentBillSource = null;
    if (isNum(bill)) {
      currentBillInr = bill;
      currentBillSource = 'entered';
    } else if (!preliminaryUnits && tariff && tariff.slabs) {
      var pre = scheduleBill(monthUnits, phase, tariff);
      if (pre.ok) {
        currentBillInr = pre.totalInr;
        currentBillSource = 'schedule';
        warnings.push('No rupee bill was entered. The current bill is the published LT-I energy and fixed charge for these units, before electricity duty.');
      }
    }

    var postBillInr = post.ok ? post.totalInr : null;
    var monthlySavings = (isNum(currentBillInr) && isNum(postBillInr)) ? currentBillInr - postBillInr : null;
    var annualSavings = isNum(monthlySavings) ? monthlySavings * 12 : null;

    if (preliminaryUnits && rec.fixedKw && isNum(units) && units * 2 < gen.monthlyKwh) {
      notes.push('The indicative units are well below what this array generates. Much of the energy would be exported and settled at the feed-in rate (Rs ' + a.netMetering.newProsumerSolarFitInr + ' per kWh for a new prosumer), not at your retail slab. A site assessment can look at a smaller array.');
      site = true;
    }

    var sub = subsidyFor(dcKwp, residential, a.subsidy);
    var subsidyOverride = parseNum(input.subsidyOverride);
    var subsidyUsed = sub.amountInr;
    if (!residential) subsidyUsed = 0;
    else if (isNum(subsidyOverride) && subsidyOverride >= 0) subsidyUsed = subsidyOverride;

    var grossDefault = dcKwp * a.indicativeCostPerKw;
    var projectCost = parseNum(input.projectCost);
    if (!isNum(projectCost) || projectCost < 0) projectCost = grossDefault;
    var netCost = residential && sub.eligible ? Math.max(0, projectCost - subsidyUsed) : null;

    if (isNum(budget) && budget >= 0) {
      var compare = netCost == null ? projectCost : netCost;
      if (compare > budget + 1) {
        notes.push('The indicative cost is above the budget you entered. The suggested size is unchanged. A site assessment can price a system that fits the budget.');
        site = true;
      }
    }

    var loanInput = {
      payment: input.payment === 'loan' ? 'loan' : 'cash',
      schemeId: input.schemeId || 'sbi',
      downPayment: parseNum(input.downPayment),
      annualRate: parseNum(input.annualRate),
      tenureMonths: parseNum(input.tenureMonths),
      moratoriumMonths: parseNum(input.moratoriumMonths)
    };
    if (input.tenureUnit === 'years' && isNum(loanInput.tenureMonths)) {
      loanInput.tenureMonths = loanInput.tenureMonths * 12;
    }
    var loan = buildLoan(loanInput, projectCost, a, asOf);
    if (loan.rateNeedsReview) {
      warnings.push('The saved loan rate was last checked on ' + (loan.lastVerified || 'an unknown date') + '. It is shown so you can edit it. It is not a live bank quote.');
    }
    if (loan.missingRate) {
      warnings.push('No single interest rate is on file for this loan amount. Type the rate from the bank. Nothing is assumed in silence.');
    }
    if (loan.aboveSchemeMax) {
      warnings.push('The loan amount is above this scheme’s published maximum. The EMI is still shown for the amount calculated. The bank decides whether it will lend.');
    }

    var paybackYears = null;
    var paybackBase = netCost == null ? projectCost : netCost;
    if (isNum(annualSavings) && annualSavings > 0) paybackYears = paybackBase / annualSavings;

    var combined = null;
    if (loan.active && isNum(loan.emiInr) && isNum(postBillInr)) combined = loan.emiInr + postBillInr;
    else if (!loan.active && isNum(postBillInr)) combined = postBillInr;

    var inv = inverterFor(dcKwp);
    var roofSqFt = Math.round(dcKwp * a.spaceSqFtPerKw);
    var co2 = a && config && config.co2OffsetPerKwhKg ? (gen.annualKwh * config.co2OffsetPerKwhKg) / 1000 : null;
    if (!isNum(co2)) {
      var gcfg = typeof globalThis !== 'undefined' && globalThis.SOORYAVAMSHI_CONFIG;
      var factor = gcfg && gcfg.calculator ? gcfg.calculator.co2OffsetPerKwhKg : 0.82;
      co2 = (gen.annualKwh * factor) / 1000;
    }

    var sixty = illustrative(gen.monthlyKwh, monthUnits, pattern.daytimeFraction, dcKwp, phase, tariff, a.netMetering);

    return {
      ok: true,
      errors: [],
      warnings: warnings,
      notes: notes,
      region: 'Kerala',
      discom: 'KSEB',
      system: 'grid-connected net-metered rooftop solar without battery',
      preliminaryUnits: preliminaryUnits,
      unitsAreMeasured: unitsMeasured,
      periodMonths: period,
      periodLabel: period === 2 ? 'Two-month bill, shown per month' : 'Monthly bill',
      monthlyBillEntered: bill,
      monthlyUnits: monthUnits,
      currentBillInr: currentBillInr,
      currentBillSource: currentBillSource,
      fixedPackageKw: rec.fixedKw,
      nominalKw: headlineKw,
      capacityLabel: (rec.fixedKw || packageSteps(a).some(function (step) { return Math.abs(step - headlineKw) < 1e-6; }))
        ? ((headlineKw % 1 ? roundTo(headlineKw, 1) : headlineKw) + ' kW')
        : (roundTo(dcKwp, 2) + ' kWp'),
      dcKwp: dcKwp,
      panelCount: capped.panelCount,
      panelWattage: a.panelWattage,
      roofSqFt: roofSqFt,
      roofSqM: Math.round(roofSqFt * 0.0929),
      inverter: inv,
      phase: phase,
      yieldKwh: yieldKwh,
      yieldClamped: yieldClamped,
      yieldIsEstimate: true,
      usagePattern: pattern,
      generation: gen,
      moduleGeneration: moduleGen,
      workedExample: salesIllustration(yieldKwh, tariff, a.netMetering),
      billingNote: (a.tariff && a.tariff.prosumerBillingWording) || 'KSEB typically bills solar prosumers monthly; confirm with your section office.',
      flow: flow,
      settlement: settled,
      postSolar: post,
      postSolarBillInr: postBillInr,
      monthlySavingsInr: monthlySavings,
      annualSavingsInr: annualSavings,
      subsidy: sub,
      subsidyUsedInr: subsidyUsed,
      grossCostInr: projectCost,
      grossCostIsIndicative: Math.abs(projectCost - grossDefault) < 1,
      indicativeCostPerKw: a.indicativeCostPerKw,
      netCostInr: netCost,
      showNetCost: residential && sub.eligible,
      paybackYears: paybackYears,
      loan: loan,
      combinedMonthlyOutflowInr: combined,
      siteAssessment: site || !rec.fixedKw,
      co2Tons: co2,
      illustrative60: sixty,
      tariffIncomplete: !(tariff && tariff.slabs && tariff.slabs.length) || tariffStale,
      tariffLastVerified: tariff && tariff.lastVerified,
      wording: {
        currentBill: 'Your Current KSEB Bill',
        consumption: 'Monthly Electricity Consumption',
        capacity: 'Recommended Solar Capacity',
        generation: 'Estimated Solar Generation',
        billAfter: 'Estimated electricity bill after solar',
        savings: 'Potential monthly savings',
        balance: 'Estimated net energy balance',
        subsidy: 'Government Subsidy (if eligible)',
        emi: 'Estimated Loan EMI',
        caveat: 'Your actual bill depends on KSEB billing rules and usage.'
      },
      sources: {
        tariff: tariff && tariff.sourceUrl,
        netMetering: a.netMetering.sourceUrl,
        subsidy: a.subsidy.portalUrl,
        cost: a.costSourceUrl
      }
    };
  }

  return {
    estimate: estimate,
    generation: generation,
    scheduleBill: scheduleBill,
    invertBill: invertBill,
    flows: flows,
    settle: settle,
    postSolarCharges: postSolarCharges,
    subsidyFor: subsidyFor,
    emi: emi,
    isStale: isStale,
    daysBetween: daysBetween,
    assumptionsOf: assumptionsOf,
    monthLengths: monthLengths
  };
});
