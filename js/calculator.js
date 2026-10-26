/**
 * Suryavamshi Solar Projects LLP — calculator page controller.
 * Numbers come from SolarModel (js/solar-model.js) and SOORYAVAMSHI_CONFIG.
 * This file only reads the form, draws the result, and carries the estimate
 * to the site-assessment form and WhatsApp.
 *
 * Default case: Kerala, KSEB, grid-connected net metering, no battery.
 */
window.SolarCalculator = (function () {
  const MAX_BILL = 200000;
  const SLIDER_MAX_BILL = 10000;
  const MIN_BILL = 200;
  const MAX_UNITS = 25000;
  const SLIDER_MAX_UNITS = 1200;
  const MIN_UNITS = 50;
  const SLIDER_STEPS = 1000;
  const WA_NUMBER = '919061626868';
  const BOOKING_LINKS = '.header-cta, .drawer-foot a.btn-sun, .mobile-bar a.primary, .closing a.btn-sun, #calcAssessmentBtn';

  let isBillMode = true;
  let currentBill = 3500;
  let currentUnits = 400;
  let billMemo = null;
  let unitsAtSwitch = null;
  let userSet = false;
  let formPrefilled = false;
  let ready = false;
  let summaryTimer = null;
  let lastEst = null;
  let elements = {};
  const dirty = {
    projectCost: false,
    subsidy: false,
    down: false,
    rate: false,
    tenure: false,
    moratorium: false
  };

  function init() {
    elements = {
      slider: document.getElementById('calcUnitsSlider'),
      numberInput: document.getElementById('calcUnitsInput'),
      unitLabel: document.getElementById('calcUnitLabel'),
      currency: document.getElementById('calcCurrency'),
      hint: document.getElementById('calcInputHint'),
      ticks: document.getElementById('calcTicks'),
      modeSeg: document.getElementById('calcModeSeg'),
      fieldLabel: document.querySelector('.calc-field-label'),
      tabUnits: document.getElementById('tabUnitsMode'),
      tabBill: document.getElementById('tabBillMode'),
      presetPills: document.querySelectorAll('.preset-pill'),
      assessmentBtn: document.getElementById('calcAssessmentBtn'),
      waBtn: document.getElementById('calcWhatsAppBtn'),
      summary: document.getElementById('calcSummary'),
      unitsOptional: document.getElementById('calcUnitsOptional'),
      unitsOptionalWrap: document.getElementById('calcUnitsOptionalWrap'),
      yield: document.getElementById('calcYield'),
      yieldVal: document.getElementById('calcYieldVal'),
      roof: document.getElementById('calcRoof'),
      load: document.getElementById('calcLoad'),
      budget: document.getElementById('calcBudget'),
      scheme: document.getElementById('calcScheme'),
      loanBox: document.getElementById('calcLoanBox'),
      projectCost: document.getElementById('calcProjectCost'),
      subsidyInput: document.getElementById('calcSubsidyInput'),
      down: document.getElementById('calcDown'),
      rate: document.getElementById('calcRate'),
      tenure: document.getElementById('calcTenure'),
      tenureUnit: document.getElementById('calcTenureUnit'),
      moratorium: document.getElementById('calcMoratorium'),
      loanNote: document.getElementById('calcLoanNote'),
      heroKw: document.getElementById('resultHeroKw'),
      heroKwSub: document.getElementById('resultHeroSub'),
      gaugeFill: document.getElementById('resultGaugeFill'),
      lead: document.getElementById('resultLead'),
      currentBill: document.getElementById('resultCurrentBill'),
      currentBillNote: document.getElementById('resultCurrentBillNote'),
      monthlyUnits: document.getElementById('resultMonthlyUnits'),
      monthlyUnitsNote: document.getElementById('resultMonthlyUnitsNote'),
      genMonthly: document.getElementById('resultGenMonthly'),
      genNote: document.getElementById('resultGenNote'),
      billAfter: document.getElementById('resultBillAfter'),
      billAfterNote: document.getElementById('resultBillAfterNote'),
      savings: document.getElementById('resultSavings'),
      savingsNote: document.getElementById('resultSavingsNote'),
      subsidy: document.getElementById('resultSubsidy'),
      subsidyNote: document.getElementById('resultSubsidyNote'),
      emi: document.getElementById('resultEmi'),
      emiNote: document.getElementById('resultEmiNote'),
      panelCount: document.getElementById('resultPanelCount'),
      roofSpace: document.getElementById('resultRoofSpace'),
      roofNote: document.getElementById('resultRoofNote'),
      inverterCap: document.getElementById('resultInverterCap'),
      inverterNote: document.getElementById('resultInverterNote'),
      panelGrid: document.getElementById('resultPanelGrid'),
      panelCountTag: document.getElementById('resultPanelCountTag'),
      subsidyCopy: document.getElementById('resultSubsidyCopy'),
      costCopy: document.getElementById('resultCostCopy'),
      loanCopy: document.getElementById('resultLoanCopy'),
      flowIntro: document.getElementById('resultFlowIntro'),
      flowSelf: document.getElementById('flowSelf'),
      flowExport: document.getElementById('flowExport'),
      flowImport: document.getElementById('flowImport'),
      flowBalance: document.getElementById('flowBalance'),
      flowEnergy: document.getElementById('flowEnergy'),
      flowFixed: document.getElementById('flowFixed'),
      flowFit: document.getElementById('flowFit'),
      flowSixty: document.getElementById('flowSixty'),
      formulaDaily: document.getElementById('formulaDaily'),
      formulaYield: document.getElementById('formulaYield'),
      formulaMonth: document.getElementById('formulaMonth'),
      formulaAnnual: document.getElementById('formulaAnnual'),
      formulaResult: document.getElementById('formulaResult'),
      formulaCo2: document.getElementById('formulaCo2'),
      formulaNotes: document.getElementById('formulaNotes')
    };

    if (!elements.slider || !elements.numberInput) return;

    elements.slider.min = 0;
    elements.slider.max = SLIDER_STEPS;
    elements.slider.step = 1;

    bindEvents();
    applyUrlParams();
    syncInputs();
    renderCalculations();
    ready = true;
    if (userSet) bringResultIntoView();
  }

  function applyUrlParams() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
    const bill = params ? parseFloat(params.get('bill')) : NaN;
    const units = params ? parseFloat(params.get('units')) : NaN;
    if (params && params.get('period') === '2') {
      const two = document.querySelector('input[name="calc-period"][value="2"]');
      if (two) two.checked = true;
    }
    if (bill > 0) {
      setMode(true);
      currentBill = Math.round(Math.min(bill, MAX_BILL));
      billMemo = null;
      userSet = true;
      setHint(bill > MAX_BILL
        ? 'The calculator goes up to ₹' + fmt(MAX_BILL) + ' a month, so that figure is used.'
        : defaultHint(), bill > MAX_BILL);
    } else if (units > 0) {
      currentBill = null;
      setMode(false);
      currentUnits = Math.round(Math.min(units, MAX_UNITS));
      unitsAtSwitch = currentUnits;
      billMemo = null;
      userSet = true;
      setHint(defaultHint());
    } else {
      setMode(true);
    }
  }

  function sliderMin() { return isBillMode ? MIN_BILL : MIN_UNITS; }
  function sliderMax() { return isBillMode ? SLIDER_MAX_BILL : SLIDER_MAX_UNITS; }
  function typedMax() { return isBillMode ? MAX_BILL : MAX_UNITS; }
  function activeValue() { return isBillMode ? currentBill : currentUnits; }

  function valueFromPosition(pos) {
    const min = sliderMin();
    const max = sliderMax();
    return min + (max - min) * (pos / SLIDER_STEPS);
  }

  function positionFromValue(value) {
    if (value == null || !isFinite(value)) return 0;
    const min = sliderMin();
    const max = sliderMax();
    const p = (value - min) / (max - min);
    return Math.round(Math.max(0, Math.min(1, p)) * SLIDER_STEPS);
  }

  function isAboveSlider() {
    const value = activeValue();
    return value != null && value > sliderMax();
  }

  function niceRound(n) {
    if (n < 1000) return Math.round(n / 10) * 10;
    if (n < 5000) return Math.round(n / 50) * 50;
    if (n < 20000) return Math.round(n / 100) * 100;
    return Math.round(n / 500) * 500;
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('en-IN');
  }

  function fmtKwh(n) {
    if (n == null || !isFinite(n)) return '—';
    const rounded = Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : Math.round(n * 10) / 10;
    return rounded.toLocaleString('en-IN');
  }

  function fmtShortInr(n) {
    if (n >= 100000) return '₹' + +(n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + +(n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return '₹' + fmt(n);
  }

  function inrOrDash(n) {
    return n == null || !isFinite(n) ? '—' : '₹' + fmt(n);
  }

  function billAfterText(n, veryLow) {
    if (n == null || !isFinite(n)) return '—';
    if (veryLow || (n > 0 && n < 1)) return 'Under ₹1';
    return '₹' + fmt(n);
  }

  function numOrNull(el) {
    if (!el || String(el.value).trim() === '') return null;
    const n = parseFloat(el.value);
    return isFinite(n) ? n : null;
  }

  function checkedValue(name, fallback) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }

  function setText(el, text) { if (el) el.textContent = text; }

  function linkEl(href, label) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    return a;
  }

  function setParts(el, parts) {
    if (!el) return;
    el.replaceChildren();
    parts.forEach(function (part) {
      if (part == null || part === '') return;
      el.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
    });
  }

  function updateSliderProgress() {
    if (!elements.slider) return;
    const percent = (parseFloat(elements.slider.value) / SLIDER_STEPS) * 100;
    elements.slider.style.setProperty('--slider-percent', Math.max(0, Math.min(100, percent)) + '%');
  }

  function updateYieldProgress() {
    if (!elements.yield) return;
    const y = parseFloat(elements.yield.value);
    const pct = ((y - 4) / 2) * 100;
    elements.yield.style.setProperty('--slider-percent', Math.max(0, Math.min(100, pct)) + '%');
    if (elements.yieldVal && isFinite(y)) elements.yieldVal.textContent = y.toFixed(1) + ' kWh per kW per day';
    elements.yield.setAttribute('aria-valuenow', String(y));
  }

  function updateTicks() {
    if (!elements.ticks) return;
    const labels = [0, 1 / 3, 2 / 3, 1].map(function (t, i) {
      const raw = valueFromPosition(t * SLIDER_STEPS);
      const value = i === 0 ? sliderMin() : (i === 3 ? sliderMax() : niceRound(raw));
      if (isBillMode) return fmtShortInr(value);
      return i === 3 ? fmt(value) + ' Units' : fmt(value);
    });
    elements.ticks.innerHTML = labels.map(function (l) { return '<span>' + l + '</span>'; }).join('');
  }

  function setHint(text, warn) {
    if (!elements.hint) return;
    elements.hint.textContent = text;
    elements.hint.classList.toggle('warn', !!warn);
  }

  function defaultHint() {
    if (isAboveSlider()) {
      return isBillMode
        ? 'Using your typed bill of ₹' + fmt(currentBill) + '. The slider stops at ₹' + fmt(SLIDER_MAX_BILL) + '; type any bill up to ₹' + fmt(MAX_BILL) + '.'
        : 'Using your typed ' + fmt(currentUnits) + ' units. The slider stops at ' + fmt(SLIDER_MAX_UNITS) + ' units; type up to ' + fmt(MAX_UNITS) + '.';
    }
    return isBillMode
      ? 'Type any bill up to ₹' + fmt(MAX_BILL) + ' a month, or drag the slider up to ₹' + fmt(SLIDER_MAX_BILL) + '.'
      : 'Type any amount up to ' + fmt(MAX_UNITS) + ' units a month, or drag the slider.';
  }

  function syncInputs(skipNumberBox) {
    const value = activeValue();
    elements.slider.value = positionFromValue(value == null ? sliderMin() : value);
    elements.slider.classList.toggle('over', isAboveSlider());
    elements.slider.setAttribute('aria-label', isBillMode ? 'Your current KSEB bill' : 'Monthly electricity consumption');
    elements.slider.setAttribute('aria-valuetext', value == null
      ? 'No value'
      : (isBillMode ? '₹' + fmt(value) + ' a month' : fmt(value) + ' units a month'));
    updateSliderProgress();
    if (!skipNumberBox) {
      elements.numberInput.value = value == null ? '' : String(Math.round(value));
    }
    elements.numberInput.max = typedMax();
    elements.presetPills.forEach(function (p) {
      const on = !isBillMode && value != null && parseInt(p.getAttribute('data-units'), 10) === Math.round(value);
      p.classList.toggle('active', on);
      p.setAttribute('aria-pressed', String(on));
    });
    updateTicks();
    updateYieldProgress();
  }

  function changed() {
    userSet = true;
    renderCalculations();
    scheduleSummary();
  }

  function bindEvents() {
    const onSliderUpdate = function (e) {
      const pos = parseInt(e.target.value, 10);
      let value = niceRound(valueFromPosition(pos));
      value = Math.max(sliderMin(), Math.min(sliderMax(), value));
      if (pos >= SLIDER_STEPS) value = sliderMax();
      if (pos <= 0) value = sliderMin();
      if (isBillMode) currentBill = value;
      else currentUnits = value;
      billMemo = null;
      setHint(defaultHint());
      syncInputs();
      changed();
    };
    elements.slider.addEventListener('input', onSliderUpdate);
    elements.slider.addEventListener('change', onSliderUpdate);

    elements.numberInput.addEventListener('input', function (e) {
      const raw = String(e.target.value).replace(/[^\d.]/g, '');
      const val = parseFloat(raw);
      billMemo = null;
      if (raw === '' || !isFinite(val)) {
        if (isBillMode) currentBill = null;
        else currentUnits = null;
        setHint(isBillMode ? 'Enter your KSEB bill in ₹.' : 'Enter your electricity consumption in units.', true);
        syncInputs(true);
        changed();
        return;
      }
      const cap = typedMax();
      const used = Math.min(val, cap);
      if (isBillMode) currentBill = used;
      else currentUnits = used;
      if (val > cap) {
        elements.slider.classList.add('over');
        setHint(isBillMode
          ? 'The calculator goes up to ₹' + fmt(MAX_BILL) + ' a month, so that figure is used.'
          : 'The calculator goes up to ' + fmt(cap) + ' units a month, so that figure is used.', true);
      } else if (val <= 0) {
        setHint(isBillMode ? 'Enter a bill above zero.' : 'Enter units above zero.', true);
      } else {
        setHint(defaultHint());
      }
      syncInputs(true);
      changed();
    });

    elements.numberInput.addEventListener('change', function () { syncInputs(); });

    elements.tabUnits.addEventListener('click', function () {
      if (isBillMode) { setMode(false); changed(); }
    });
    elements.tabBill.addEventListener('click', function () {
      if (!isBillMode) { setMode(true); changed(); }
    });
    if (elements.modeSeg) {
      elements.modeSeg.addEventListener('keydown', function (e) {
        if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
        e.preventDefault();
        setMode(!isBillMode);
        changed();
        (isBillMode ? elements.tabBill : elements.tabUnits).focus();
      });
    }

    elements.presetPills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        const picked = parseInt(this.getAttribute('data-units'), 10);
        if (elements.unitsOptional) elements.unitsOptional.value = '';
        if (isBillMode) setMode(false);
        currentUnits = picked;
        unitsAtSwitch = picked;
        setHint(defaultHint());
        syncInputs();
        changed();
      });
    });

    if (elements.unitsOptional) {
      elements.unitsOptional.addEventListener('input', function () { changed(); });
    }
    [elements.roof, elements.load, elements.budget].forEach(function (el) {
      if (el) el.addEventListener('input', function () { changed(); });
    });
    if (elements.yield) {
      elements.yield.addEventListener('input', function () {
        updateYieldProgress();
        changed();
      });
    }

    const card = document.getElementById('calc-card');
    if (card) {
      card.addEventListener('change', function (e) {
        const name = e.target && e.target.name;
        if (name === 'calc-period' || name === 'calc-use' || name === 'calc-connection' || name === 'calc-pay') {
          changed();
        }
      });
    }

    function markFilled(flag, el) {
      if (!el) return;
      el.addEventListener('input', function () {
        dirty[flag] = String(el.value).trim() !== '';
        changed();
      });
    }
    markFilled('projectCost', elements.projectCost);
    markFilled('subsidy', elements.subsidyInput);
    markFilled('down', elements.down);
    markFilled('rate', elements.rate);
    markFilled('tenure', elements.tenure);
    markFilled('moratorium', elements.moratorium);

    if (elements.tenureUnit) {
      elements.tenureUnit.addEventListener('change', function () {
        if (dirty.tenure) {
          const n = parseFloat(elements.tenure.value);
          if (isFinite(n)) {
            if (elements.tenureUnit.value === 'months') elements.tenure.value = String(Math.round(n * 12));
            else elements.tenure.value = String(Math.round((n / 12) * 10) / 10);
          }
        }
        changed();
      });
    }
    if (elements.scheme) {
      elements.scheme.addEventListener('change', function () {
        dirty.rate = false;
        changed();
      });
    }

    document.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest(BOOKING_LINKS);
      if (!a) return;
      updateBookingLinks();
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!document.getElementById('assessment-form')) return;
      e.preventDefault();
      openForm(a === elements.assessmentBtn || userSet);
    });

    if (elements.waBtn) {
      elements.waBtn.addEventListener('click', function () {
        this.href = whatsappLink();
        if (window.svTrack) window.svTrack('calculator_whatsapp');
      });
    }
  }

  function setMode(billMode) {
    const wasBill = isBillMode;
    isBillMode = billMode;
    [[elements.tabBill, isBillMode], [elements.tabUnits, !isBillMode]].forEach(function (pair) {
      const btn = pair[0];
      const on = pair[1];
      if (!btn) return;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    if (elements.modeSeg) elements.modeSeg.classList.toggle('bill', isBillMode);
    if (elements.currency) elements.currency.hidden = !isBillMode;
    if (elements.unitsOptionalWrap) elements.unitsOptionalWrap.hidden = !isBillMode;

    if (isBillMode) {
      if (!wasBill && billMemo != null) currentBill = billMemo;
      if (!wasBill && unitsAtSwitch != null && currentUnits != null && Math.round(currentUnits) !== Math.round(unitsAtSwitch) && elements.unitsOptional) {
        elements.unitsOptional.value = String(Math.round(currentUnits));
      }
      billMemo = null;
      unitsAtSwitch = null;
      if (elements.unitLabel) elements.unitLabel.textContent = '/ month';
      if (elements.fieldLabel) elements.fieldLabel.textContent = 'Your Current KSEB Bill';
    } else {
      if (wasBill && currentBill != null) billMemo = currentBill;
      const opt = numOrNull(elements.unitsOptional);
      if (opt != null && opt > 0) currentUnits = opt;
      else if (wasBill && lastEst && lastEst.ok && lastEst.monthlyUnits > 0) {
        currentUnits = Math.round(lastEst.monthlyUnits * (lastEst.periodMonths || 1));
      }
      unitsAtSwitch = currentUnits;
      if (elements.unitLabel) elements.unitLabel.textContent = 'Units';
      if (elements.fieldLabel) elements.fieldLabel.textContent = 'Monthly Electricity Consumption';
    }
    setHint(defaultHint());
    if (ready) syncInputs();
  }

  function periodMonths() {
    return checkedValue('calc-period', '1') === '2' ? 2 : 1;
  }

  function gather() {
    const input = {
      periodMonths: periodMonths(),
      yieldKwh: elements.yield ? parseFloat(elements.yield.value) : 5,
      usagePattern: checkedValue('calc-use', 'mixed'),
      residential: checkedValue('calc-connection', 'home') !== 'other',
      payment: checkedValue('calc-pay', 'cash') === 'loan' ? 'loan' : 'cash',
      schemeId: elements.scheme ? elements.scheme.value : 'sbi',
      roofSqFt: numOrNull(elements.roof),
      sanctionedLoadKw: numOrNull(elements.load),
      budgetInr: numOrNull(elements.budget)
    };
    if (isBillMode) {
      if (currentBill != null) input.monthlyBill = currentBill;
      const opt = numOrNull(elements.unitsOptional);
      if (opt != null && opt > 0) {
        input.monthlyUnits = opt;
        input.unitsAreMeasured = true;
      } else {
        input.unitsAreMeasured = false;
      }
    } else if (currentUnits != null) {
      input.monthlyUnits = currentUnits;
      input.unitsAreMeasured = true;
    }
    if (input.payment === 'loan') {
      if (dirty.projectCost) input.projectCost = numOrNull(elements.projectCost);
      if (dirty.subsidy && input.residential) input.subsidyOverride = numOrNull(elements.subsidyInput);
      if (dirty.down) input.downPayment = numOrNull(elements.down);
      if (dirty.rate) input.annualRate = numOrNull(elements.rate);
      if (dirty.tenure) {
        input.tenureMonths = numOrNull(elements.tenure);
        input.tenureUnit = elements.tenureUnit ? elements.tenureUnit.value : 'months';
      }
      if (dirty.moratorium) input.moratoriumMonths = numOrNull(elements.moratorium);
    }
    return input;
  }

  function runEstimate() {
    if (!window.SolarModel) return { ok: false, errors: ['The calculation model did not load.'] };
    return window.SolarModel.estimate(gather());
  }

  /**
   * Backward-compatible size for a monthly unit figure.
   * recommendedKw is DC kWp to one decimal. panelCount uses the same 550 W modules.
   */
  function compute(monthlyUnits) {
    if (!window.SolarModel) return { recommendedKw: '0.0', panelCount: 0 };
    const est = window.SolarModel.estimate({
      monthlyUnits: monthlyUnits,
      unitsAreMeasured: true,
      residential: true,
      payment: 'cash'
    });
    if (!est.ok) return { recommendedKw: '0.0', panelCount: 0 };
    return { recommendedKw: est.dcKwp.toFixed(1), panelCount: est.panelCount };
  }

  function writeIfClean(el, flag, value, digits) {
    if (!el || dirty[flag] || document.activeElement === el) return;
    if (value == null || !isFinite(value)) {
      el.value = '';
      return;
    }
    const factor = Math.pow(10, digits == null ? 0 : digits);
    const shown = Math.round(value * factor) / factor;
    el.value = String(shown);
  }

  function syncLoanFields(est) {
    const loanOn = checkedValue('calc-pay', 'cash') === 'loan';
    if (elements.loanBox) elements.loanBox.hidden = !loanOn;
    if (!loanOn || !est || !est.ok || !est.loan) return;
    const loan = est.loan;
    writeIfClean(elements.projectCost, 'projectCost', est.grossCostInr, 0);
    writeIfClean(elements.subsidyInput, 'subsidy', est.subsidyUsedInr, 0);
    writeIfClean(elements.down, 'down', loan.downPaymentInr, 0);
    if (loan.missingRate) {
      if (elements.rate) {
        const range = loan.range;
        elements.rate.placeholder = range ? (range[0] + '–' + range[1]) : 'Type the bank rate';
      }
      writeIfClean(elements.rate, 'rate', null, 2);
    } else {
      if (elements.rate) elements.rate.placeholder = '';
      writeIfClean(elements.rate, 'rate', loan.annualRatePercent, 2);
    }
    if (!dirty.tenure && elements.tenure && document.activeElement !== elements.tenure && loan.tenureMonths) {
      if (elements.tenureUnit && elements.tenureUnit.value === 'years') {
        const years = loan.tenureMonths / 12;
        elements.tenure.value = String(Number.isInteger(years) ? years : Math.round(years * 10) / 10);
      } else {
        elements.tenure.value = String(loan.tenureMonths);
      }
    }
    writeIfClean(elements.moratorium, 'moratorium', loan.moratoriumMonths, 0);
    if (elements.loanNote) {
      const scheme = loan.scheme;
      elements.loanNote.textContent = scheme && scheme.note ? scheme.note : '';
    }
  }

  function clearReadout() {
    [elements.currentBill, elements.monthlyUnits, elements.genMonthly, elements.billAfter, elements.savings, elements.subsidy, elements.emi, elements.panelCount, elements.roofSpace, elements.inverterCap, elements.flowSelf, elements.flowExport, elements.flowImport, elements.flowBalance, elements.flowEnergy, elements.flowFixed, elements.flowFit, elements.formulaDaily, elements.formulaYield, elements.formulaMonth, elements.formulaAnnual, elements.formulaResult, elements.formulaCo2].forEach(function (el) {
      setText(el, '—');
    });
    setText(elements.heroKw, '—');
    setText(elements.heroKwSub, 'Kerala, on-grid, no battery. Enter a bill or the units on it.');
    if (elements.flowSixty) elements.flowSixty.replaceChildren();
    setParts(elements.subsidyCopy, []);
    setParts(elements.costCopy, []);
    setParts(elements.loanCopy, []);
    renderPanelMatrix(0);
  }

  function renderCalculations() {
    const est = runEstimate();
    lastEst = est;
    syncLoanFields(est);
    if (!est.ok) {
      clearReadout();
      setText(elements.lead, (est.errors && est.errors.length ? est.errors : ['Enter a bill or the units.']).join(' '));
      setText(elements.formulaNotes, (est.warnings || []).join(' '));
      setText(elements.flowIntro, '');
      updateBookingLinks(est);
      updateWhatsAppLinks(est);
      return;
    }

    setText(elements.heroKw, est.capacityLabel);
    setText(elements.heroKwSub, est.dcKwp.toFixed(2) + ' kWp DC · ' + est.panelCount + ' × ' + est.panelWattage + ' W. Kerala, on-grid, no battery.');

    if (elements.gaugeFill) {
      const circumference = 264;
      const ratio = Math.min(1, Math.max(0.08, Math.log(1 + est.dcKwp) / Math.log(1 + 300)));
      elements.gaugeFill.style.strokeDashoffset = String(circumference - (circumference * ratio));
    }

    const lead = [];
    if (est.periodMonths === 2) lead.push('Two-month figure, shown per month. Solar does not change KSEB’s billing period.');
    if (est.preliminaryUnits) lead.push('A rupee bill does not map exactly to units. Slabs, fixed charges and duty sit between the amount and the kWh, so this size is preliminary.');
    if (est.siteAssessment) lead.push('A site assessment is recommended.');
    if (est.phase === 'three') lead.push('Above 5 kW DC, the fixed charge uses the three-phase slab.');
    if (est.notes && est.notes.length) lead.push(est.notes.join(' '));
    setText(elements.lead, lead.join(' '));

    setText(elements.currentBill, inrOrDash(est.currentBillInr));
    setText(elements.currentBillNote, est.currentBillSource === 'schedule'
      ? 'per month, from the LT-I schedule, before duty'
      : (est.periodMonths === 2 ? 'per month, from a two-month bill' : 'per month, as entered'));
    setText(elements.monthlyUnits, fmtKwh(est.monthlyUnits) + ' kWh');
    setText(elements.monthlyUnitsNote, est.unitsAreMeasured ? 'from the units entered' : 'indicative, from the rupee bill');
    setText(elements.genMonthly, fmtKwh(est.generation.monthlyKwh) + ' kWh');
    setText(elements.genNote, fmtKwh(est.generation.dailyKwh) + ' kWh a day · 30-day month');
    setText(elements.billAfter, billAfterText(est.postSolarBillInr, est.postSolar && est.postSolar.veryLow));
    setText(elements.billAfterNote, est.postSolar && est.postSolar.veryLow
      ? 'Very low on this estimate. It is not guaranteed.'
      : 'same month, before duty');
    setText(elements.savings, inrOrDash(est.monthlySavingsInr));
    setText(elements.savingsNote, est.annualSavingsInr == null
      ? 'needs a current bill and a tariff'
      : '₹' + fmt(est.annualSavingsInr) + ' a year, same comparison');
    setText(elements.subsidy, inrOrDash(est.subsidyUsedInr));
    setText(elements.subsidyNote, est.showNetCost ? 'potential, if eligible' : 'not applied on this connection');
    if (est.loan && est.loan.active && est.loan.emiInr != null) {
      setText(elements.emi, inrOrDash(est.loan.emiInr));
      setText(elements.emiNote, 'a month, plus the bill after solar');
    } else if (est.loan && est.loan.active && est.loan.missingRate) {
      setText(elements.emi, '—');
      setText(elements.emiNote, 'type an interest rate');
    } else {
      setText(elements.emi, '—');
      setText(elements.emiNote, 'cash purchase');
    }
    setText(elements.panelCount, fmt(est.panelCount) + ' panels');
    setText(elements.roofSpace, fmt(est.roofSqFt) + ' sq ft');
    setText(elements.roofNote, 'about ' + fmt(est.roofSqM) + ' m², shade-free');
    setText(elements.inverterCap, est.inverter.text);
    setText(elements.inverterNote, est.inverter.phase);

    renderSubsidy(est);
    renderLoan(est);
    renderPanelMatrix(est.panelCount);
    renderFlows(est);
    renderFormula(est);
    updateBookingLinks(est);
    updateWhatsAppLinks(est);

    if (window.svShowEstimate && (userSet || formPrefilled)) {
      const field = document.getElementById('client-consumption');
      if (field && (!field.value.trim() || field.value === field.dataset.autoValue)) prefillForm();
      else window.svShowEstimate(null);
    }
  }

  function renderSubsidy(est) {
    const sub = est.subsidy || {};
    const amount = est.subsidyUsedInr || 0;
    if (est.showNetCost) {
      setParts(elements.subsidyCopy, [
        'Potential subsidy ₹' + fmt(amount) + ' on ' + fmtKwh(sub.eligibleKw) + ' kW of this ' + est.dcKwp.toFixed(2) + ' kWp system. The central scheme is ₹30,000 per kW for the first 2 kW and ₹18,000 per kW up to 3 kW, capped at ₹78,000. It applies to an eligible residential connection, through a registered vendor, and it is paid after commissioning. It is not guaranteed and it is not immediate. ',
        linkEl('https://pmsuryaghar.gov.in/', 'pmsuryaghar.gov.in')
      ]);
    } else {
      setParts(elements.subsidyCopy, [
        (sub.reason || 'No central CFA is applied on this connection.') + ' Gross indicative cost ₹' + fmt(est.grossCostInr) + '. The subsidy is not guaranteed and it is not immediate. ',
        linkEl('https://pmsuryaghar.gov.in/', 'pmsuryaghar.gov.in')
      ]);
    }
    const costBits = [];
    costBits.push('Indicative system cost ₹' + fmt(est.grossCostInr) + (est.grossCostIsIndicative
      ? ' (₹' + fmt(est.indicativeCostPerKw) + ' per kW, not a Suryavamshi quote).'
      : '.'));
    if (est.showNetCost && est.netCostInr != null) {
      costBits.push(' Net upfront after the potential subsidy: ₹' + fmt(est.netCostInr) + '.');
    }
    if (est.paybackYears != null && isFinite(est.paybackYears)) {
      costBits.push(' Indicative payback about ' + est.paybackYears.toFixed(1) + ' years if these monthly savings continued.');
    }
    setParts(elements.costCopy, [costBits.join('')]);
  }

  function renderLoan(est) {
    const loan = est.loan;
    if (!loan || !loan.active) {
      setParts(elements.loanCopy, ['Cash purchase. EMI is not part of this estimate.']);
      return;
    }
    const parts = [];
    if (loan.missingRate) {
      const range = loan.range ? ' The published range is ' + loan.range[0] + '% to ' + loan.range[1] + '%.' : '';
      const checked = loan.lastVerified ? ' Last checked ' + loan.lastVerified + '.' : '';
      parts.push('Type an annual interest rate to see an EMI.' + range + checked + ' ');
    }
    if (loan.rateNeedsReview && loan.lastVerified) {
      parts.push('The saved rate was last checked on ' + loan.lastVerified + '. Edit it if the bank has moved. ');
    }
    if (loan.annualRatePercent != null) {
      const floatText = loan.floating == null ? 'rate type not on file' : (loan.floating ? 'floating' : 'fixed');
      parts.push('Loan ₹' + fmt(loan.principalInr) + ', down payment ₹' + fmt(loan.downPaymentInr) + ', ' + loan.annualRatePercent + '% a year, ' + floatText + '. ');
      parts.push('Tenure ' + loan.tenureMonths + ' months including a ' + loan.moratoriumMonths + '-month moratorium (' + loan.repaymentMonths + ' repayment months). ');
      parts.push('EMI ₹' + fmt(loan.emiInr) + '. Total repayment ₹' + fmt(loan.totalRepaymentInr) + '. Total interest ₹' + fmt(loan.totalInterestInr) + '. ');
    }
    if (est.postSolarBillInr != null) parts.push('Estimated electricity bill after solar ₹' + fmt(est.postSolarBillInr) + '. ');
    if (est.combinedMonthlyOutflowInr != null && loan.emiInr != null) {
      parts.push('Combined monthly outflow is the EMI plus that bill: ₹' + fmt(est.combinedMonthlyOutflowInr) + '. ');
    }
    parts.push('The subsidy, if it is paid, is credited to the loan account later. It is not taken off the principal here. The bank makes the credit decision. ');
    if (loan.scheme && loan.scheme.note) parts.push(loan.scheme.note + ' ');
    if (loan.scheme && loan.scheme.applyUrl) {
      parts.push(linkEl(loan.scheme.applyUrl, loan.scheme.name || 'Lender page'));
    }
    setParts(elements.loanCopy, parts);
  }

  function renderFlows(est) {
    const flow = est.flow;
    const post = est.postSolar || {};
    const settled = est.settlement || {};
    setText(elements.flowIntro, 'Solar is used at home first, while the sun is up. Surplus is exported. The home imports when solar falls short. A bidirectional meter records both, and KSEB rules decide the bill. Daytime use here is an assumption (' + Math.round(flow.daytimeFraction * 100) + '% of consumption). ' + (est.wording ? est.wording.caveat : ''));
    setText(elements.flowSelf, fmtKwh(flow.selfConsumptionKwh) + ' kWh');
    setText(elements.flowExport, fmtKwh(flow.exportKwh) + ' kWh');
    setText(elements.flowImport, fmtKwh(flow.importKwh) + ' kWh');
    setText(elements.flowBalance, 'Physical net import ' + fmtKwh(settled.physicalNetImportKwh) + ' kWh. Billed units after banking ' + fmtKwh(settled.billedUnitsKwh) + ' kWh. Surplus still banked ' + fmtKwh(settled.surplusBankedKwh) + ' kWh.');
    setText(elements.flowEnergy, inrOrDash(post.energyInr));
    setText(elements.flowFixed, inrOrDash(post.fixedInr) + (post.gridSupportInr ? ' · grid support ₹' + fmt(post.gridSupportInr) : ''));
    setText(elements.flowFit, post.fitCreditInr ? '₹' + fmt(post.fitCreditInr) + ' at ₹' + post.fitRate + '/kWh, against the fixed charge' : '₹0');

    if (!elements.flowSixty) return;
    elements.flowSixty.replaceChildren();
    (est.illustrative60 || []).forEach(function (row) {
      const li = document.createElement('li');
      const billBit = row.billInr == null ? '.' : (row.billInr < 1 ? ', illustrative bill under ₹1.' : ', illustrative bill ₹' + fmt(row.billInr) + '.');
      li.textContent = row.name + '. ' + row.detail + ' Self ' + fmtKwh(row.selfConsumptionKwh) + ' kWh, export ' + fmtKwh(row.exportKwh) + ' kWh, import ' + fmtKwh(row.importKwh) + ' kWh' + billBit;
      elements.flowSixty.appendChild(li);
    });
  }

  function renderFormula(est) {
    const gen = est.generation;
    setText(elements.formulaDaily, est.dcKwp.toFixed(2) + ' kWp × ' + est.yieldKwh + ' = ' + fmtKwh(gen.dailyKwh) + ' kWh');
    setText(elements.formulaYield, est.yieldKwh.toFixed(1) + ' kWh per kW per day, an estimate');
    setText(elements.formulaMonth, fmtKwh(gen.dailyKwh) + ' × ' + gen.monthDays + ' = ' + fmtKwh(gen.monthlyKwh) + ' kWh');
    setText(elements.formulaAnnual, fmtKwh(gen.annualKwh) + ' kWh in ' + gen.year + ', the sum of the months');
    setText(elements.formulaResult, est.dcKwp.toFixed(2) + ' kWp DC');
    setText(elements.formulaCo2, (est.co2Tons == null ? '—' : est.co2Tons.toFixed(1) + ' tons / yr'));
    const extra = (est.warnings || []).slice();
    if (est.yieldClamped) extra.push('The yield slider was held inside 4 to 6.');
    setText(elements.formulaNotes, extra.join(' '));
  }

  function renderPanelMatrix(count) {
    if (!elements.panelGrid) return;
    const wattage = (lastEst && lastEst.panelWattage) || 550;
    if (elements.panelCountTag) elements.panelCountTag.textContent = fmt(count) + ' x ' + wattage + 'W Modules';
    elements.panelGrid.innerHTML = '';
    const displayCount = Math.min(count, 36);
    for (let i = 0; i < displayCount; i++) {
      const panel = document.createElement('div');
      panel.className = 'mini-panel-icon';
      panel.title = 'Module #' + (i + 1) + ': ' + wattage + 'W Mono PERC Bifacial';
      panel.innerHTML = '<div class="mini-panel-cell"></div><div class="mini-panel-cell"></div><div class="mini-panel-cell"></div>';
      elements.panelGrid.appendChild(panel);
    }
    if (count > 36) {
      const moreTag = document.createElement('div');
      moreTag.style.alignSelf = 'center';
      moreTag.style.fontSize = '0.75rem';
      moreTag.style.color = 'rgba(245, 239, 230, 0.75)';
      moreTag.style.fontWeight = '600';
      moreTag.textContent = '+' + fmt(count - 36) + ' more';
      elements.panelGrid.appendChild(moreTag);
    }
  }

  function scheduleSummary() {
    if (!elements.summary) return;
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(function () {
      const est = lastEst;
      if (!est || !est.ok) {
        elements.summary.textContent = 'Enter a KSEB bill or monthly units to see a Kerala rooftop estimate.';
        return;
      }
      elements.summary.textContent = est.capacityLabel + ', ' + est.panelCount + ' panels. Estimated electricity bill after solar ' + inrOrDash(est.postSolarBillInr) + '. Potential monthly savings ' + inrOrDash(est.monthlySavingsInr) + '.';
    }, 900);
  }

  function urlParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; } catch (e) { return ''; }
  }

  function bookingHref(est) {
    const p = new URLSearchParams();
    if (est && est.ok) {
      if (isBillMode && est.monthlyBillEntered != null) p.set('bill', String(Math.round(est.monthlyBillEntered)));
      else p.set('units', String(Math.round(est.monthlyUnits)));
      p.set('kw', est.dcKwp.toFixed(1));
      if (est.periodMonths === 2) p.set('period', '2');
    }
    const loc = urlParam('location');
    const pin = urlParam('pin').replace(/\D/g, '');
    if (loc) p.set('location', loc);
    if (pin) p.set('pin', pin);
    const q = p.toString();
    return q ? 'contact.html?' + q : 'contact.html';
  }

  function updateBookingLinks(est) {
    if (!ready && !est) return;
    est = est || lastEst;
    const withEstimate = bookingHref(est);
    document.querySelectorAll(BOOKING_LINKS).forEach(function (a) {
      a.setAttribute('href', userSet || a === elements.assessmentBtn ? withEstimate : 'contact.html');
    });
  }

  function whatsappText(est) {
    est = est || lastEst;
    const lines = [
      'Hi, I used the solar calculator on suryavamshi.com.',
      'Kerala, grid-connected, net-metered, no battery.'
    ];
    if (isBillMode && currentBill != null) lines.push('KSEB bill entered: ₹' + fmt(currentBill) + (periodMonths() === 2 ? ' for two months.' : ' for one month.'));
    else if (!isBillMode && currentUnits != null) lines.push('Consumption entered: ' + fmt(currentUnits) + ' units' + (periodMonths() === 2 ? ' over two months.' : ' a month.'));
    if (est && est.ok) {
      lines.push('Suggested system: ' + est.capacityLabel + ', ' + est.dcKwp.toFixed(2) + ' kWp, ' + est.panelCount + ' panels.');
      if (est.postSolarBillInr != null) lines.push('Estimated electricity bill after solar: ₹' + fmt(est.postSolarBillInr) + ' a month.');
      if (est.monthlySavingsInr != null) lines.push('Potential monthly savings: ₹' + fmt(est.monthlySavingsInr) + '.');
      lines.push('Your actual bill depends on KSEB billing rules and usage.');
    }
    lines.push('Please arrange a site assessment.');
    return lines.join('\n');
  }

  function whatsappLink(est) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(whatsappText(est));
  }

  function updateWhatsAppLinks(est) {
    const link = whatsappLink(est);
    if (elements.waBtn) elements.waBtn.href = link;
    if (!userSet) return;
    document.querySelectorAll('.fab-wa, .mobile-bar a.wa').forEach(function (a) { a.href = link; });
  }

  function estimateForForm(est) {
    est = est || lastEst;
    if (!est || !est.ok) return null;
    return {
      kw: est.dcKwp.toFixed(1),
      panels: est.panelCount,
      bill: isBillMode && est.monthlyBillEntered != null ? Math.round(est.monthlyBillEntered) : null,
      units: !isBillMode ? Math.round(est.monthlyUnits) : null
    };
  }

  function prefillForm() {
    const est = lastEst;
    if (!est || !est.ok) return;
    const monthlyInput = document.getElementById('client-consumption') || document.getElementById('contactUnits');
    const msgInput = document.getElementById('client-message') || document.getElementById('contactMessage');
    const formEst = estimateForForm(est);

    if (monthlyInput && formEst) {
      if (window.svSetUsageMode) window.svSetUsageMode(isBillMode ? 'bill' : 'units');
      monthlyInput.value = isBillMode ? formEst.bill : formEst.units;
      monthlyInput.dataset.autoValue = String(monthlyInput.value);
    }

    if (msgInput) {
      const usage = isBillMode
        ? 'a KSEB bill of about ₹' + fmt(est.monthlyBillEntered) + ' a month'
        : 'about ' + fmt(est.monthlyUnits) + ' units a month';
      const periodBit = est.periodMonths === 2 ? ' The figure entered was a two-month bill, normalised to a month.' : '';
      const after = est.postSolarBillInr == null ? '' : ' Estimated electricity bill after solar about ₹' + fmt(est.postSolarBillInr) + ' a month.';
      const save = est.monthlySavingsInr == null ? '' : ' Potential monthly savings about ₹' + fmt(est.monthlySavingsInr) + '.';
      const text = 'I used the solar calculator for Kerala: grid-connected, net-metered, no battery. Suggested system ' + est.capacityLabel + ' (' + est.dcKwp.toFixed(2) + ' kWp, ' + est.panelCount + ' panels, about ' + fmt(est.roofSqFt) + ' sq ft) for ' + usage + '.' + periodBit + after + save + ' Your actual bill depends on KSEB billing rules and usage. Please arrange a site assessment.';
      if (!msgInput.value.trim() || msgInput.value === msgInput.dataset.autoText) {
        msgInput.value = text;
        msgInput.dataset.autoText = text;
      }
    }

    formPrefilled = true;
    if (window.svShowEstimate) window.svShowEstimate(formEst);
  }

  function openForm(prefill) {
    if (prefill) prefillForm();
    const form = document.getElementById('assessment-form');
    const success = document.getElementById('form-success');
    const shown = form && getComputedStyle(form).display !== 'none' ? form : (success || form);
    if (!shown) return;
    const smooth = document.documentElement.getAttribute('data-sv-motion') !== 'off';
    shown.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    const first = shown === form ? document.getElementById('client-name') : shown;
    if (first) {
      try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
    }
  }

  function handleAssessmentPrefill() {
    openForm(true);
  }

  function bringResultIntoView() {
    if (window.location.hash) return;
    const nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) return;
    const narrow = window.matchMedia && window.matchMedia('(max-width: 980px)').matches;
    const target = document.getElementById(narrow ? 'calc-result' : 'calc-card');
    if (!target) return;
    try { history.replaceState(history.state, '', '#' + target.id); } catch (e) {}
    let touched = false;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
      window.addEventListener(ev, function () { touched = true; }, { once: true, passive: true });
    });
    const go = function () {
      if (touched) return;
      try { target.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch (e) { target.scrollIntoView(true); }
    };
    go();
    window.addEventListener('load', function () { setTimeout(function () { requestAnimationFrame(go); }, 0); });
  }

  return {
    init: init,
    compute: compute,
    getCurrentResults: function () {
      return compute(Math.round(currentUnits || 0));
    },
    getEstimate: function () {
      if (!ready || !(userSet || formPrefilled)) return null;
      const formEst = estimateForForm(lastEst);
      if (!formEst) return null;
      return {
        kw: formEst.kw,
        panels: formEst.panels,
        bill: formEst.bill,
        units: lastEst.monthlyUnits,
        mode: isBillMode ? 'bill' : 'units'
      };
    },
    whatsappText: function () { return ready ? whatsappText() : ''; },
    openForm: function () { openForm(true); },
    handleAssessmentPrefill: handleAssessmentPrefill
  };
})();
