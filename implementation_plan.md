# Solar calculator audit and correction

Audit of the calculator as it stood on `main` (commit `d3a071a`), then the correction. Default case throughout: Kerala, KSEB, grid-connected, net-metered rooftop solar, no battery. Customers are mainly residential.

Checked 26 October 2026. Older pages were opened again on that date. Nothing below is carried forward from an earlier search without a check.

## Audit (before the change)

Kerala was already the only state in the calculator. Andhra Pradesh appears only in the feasibility checker’s DISCOM map, which this change leaves alone.

The calculator still did not match the way a KSEB bill works.

- A rupee bill was turned into units by dividing by a flat Rs 7.20. LT-I domestic is telescopic through 250 units, then one rate for the whole block, plus a fixed charge that depends on the slab. Duty is extra. Many homes are billed every two months.
- Generation used 4.3 peak-sun hours times a 0.82 performance ratio, about 3.53 kWh per kW per day. A 3 kWp array was about 10.6 units a day, not about 15.
- Capacity was sized to cover 100% of consumption. It did not use the sales bands: up to Rs 3,800 suggests 3 kW, above that up to Rs 6,000 suggests 5 kW, and above Rs 6,000 is calculated, with a site assessment.
- Savings were the lesser of annual generation times the flat tariff, and 90% of the annual bill. That prices every unit at retail, including export, and reads like a near-zero bill. The page said solar cuts the bill by up to 90%.
- There was no split of self-consumption, export and import, no separate 60% illustration, no bimonthly normalisation, and no subsidy, EMI, payback or system cost in the result. The meta description mentioned the subsidy. Nav badges still say Rs 78,000; those badges were left as they were.
- The homepage quick estimate used about 1 kW per Rs 761.6 of bill, and its own subsidy formula. The contact form divided a bill by the same flat Rs 7.20, then called the old engine.
- There was no separate ROI module. The calculator was the only place savings were worked out, so the new model replaces that one path rather than adding a second.

## Sources checked on 26 October 2026

| What | Where | What was used |
| --- | --- | --- |
| Generation yield, Kerala | https://ekiran.kseb.in/ | Planning range 4–6 kWh/kWp/day, default 5, labelled as an estimate. |
| KSEB public FAQ | https://ekiran.kseb.in/public/faqs and https://ekiran.kseb.in/faqs | Both returned 404 on 26 Oct 2026. Accounting follows the 2025 regulations, not a FAQ page. |
| KSEB policy list | https://ekiran.kseb.in/public/policy_regulation | Lists the 2020 regulations and the 2022 amendment. The 2025 regulations supersede them for energy accounting from 1 Jan 2026. |
| Net metering and banking | KSERC (Renewable Energy and Related Matters) Regulations, 2025. Notification 5 Nov 2025, Gazette No. 3944 dated 6 Nov 2025. https://dev.erckerala.org/api/storage/final-regulations/BDm5OZBLIuAbHoyTX0xoploDz82DbFy1O6klxxfS.pdf | Accounting from 1 Jan 2026. Domestic net metering 1–20 kW (Reg 6.3). Plant capacity not above sanctioned load (Reg 6.6). Fixed charges and other charges still payable (Reg 26). Settlement in Reg 28. |
| Billing period | KSERC order of 5 Dec 2024 in OP 18/2023 | Bimonthly billing remains for consumers below 20 kW. Solar does not change that to monthly. |
| Retail tariff | KSEB retail supply tariff order, LT-I domestic, effective 1 Apr 2025 to 31 Mar 2027. https://peak-files.estonetech.in/peak-data-files_duplicate/TOC/TOC_Kerala%20State%20Electricity%20Board%20Retail%20Supply%20Tariff%20Order%202025-26.pdf | Slabs below. Electricity duty is excluded. A duty rate was not verified. |
| Central CFA | MNRE operational guidelines, originally 13 Feb 2024, same CFA text in the MNRE PDF fetched 26 Oct 2026: https://cdnbbsr.s3waas.gov.in/s303412aef4dcdee4f934f7bf599f89783/uploads/2026/10/202610011688339072.pdf and https://mnre.gov.in/en/notice/operational-guidelines-for-implementation-of-the-component-central-financial-assistance-to-residential-consumers-of-pm-surya-ghar-muft-bijli-yojana/ | Rs 30,000 per kW for the first 2 kW, Rs 18,000 per kW for the next kW up to 3 kW, cap Rs 78,000. Residential only. Paid after commissioning. Portal https://pmsuryaghar.gov.in/ returned 403 to a fetch; the link is still shown. |
| SBI Surya Ghar loan | https://sbi.bank.in/web/personal-banking/loans/pm-surya-ghar-loan-for-solar-roof-top — page last updated 19 Oct 2026, rates with effect from 15 Oct 2026, read 26 Oct 2026 | Features table: up to Rs 2 lakh, 6.00% floating (EBLR − 2.15%); above Rs 2 lakh up to Rs 6 lakh, 8.15% floating (EBLR + 0%). Margin 10%, processing fee nil, moratorium 6 months, tenure up to 120 months including moratorium, no prepayment penalty. Apply via https://pmsuryaghar.gov.in/ then https://www.jansamarth.in. The FAQ on the same page still says 5.75% and 7.90% as on 15 Dec 2025. The calculator uses the features table. The rate is editable. |
| Central Bank of India | https://centralbank.bank.in/en/PM_Surya_Ghar and https://centralbank.bank.in/en/Roof-Top-Solar-Loan-Scheme, read 26 Oct 2026. Retail rates page last updated 19 May 2026: https://centralbank.bank.in/en/retail-scheme-interest | Up to Rs 2 lakh: repo 5.25% + 0.50% = 5.75%, margin 10%. Above Rs 2 lakh the bank publishes a range, not one rate: 8.20–9.75% (non-home-loan) and 7.20–8.75% (home-loan borrowers). That band is left blank until a rate is typed. Margin 20% above Rs 2 lakh. Processing fee nil. CIC Rs 50 + GST and API Rs 81 + GST are not in the EMI. Moratorium 3–6 months (default 6). Max Rs 6 lakh. Tenure up to 120 months. The scheme page’s project-cost assumption of about Rs 70,000 per kW is the indicative price. It is not a Suryavamshi quote. |

No call was made to wss.kseb.in. The calculator does not claim a live transformer or feasibility check. The existing feasibility guide remains the place for that.

## Formulas

All changeable numbers live in `SOORYAVAMSHI_CONFIG.calculator.assumptions` in `js/config.js`, each with a source URL and a `lastVerified` date. `js/solar-model.js` is the pure calculation. `js/calculator.js` only reads the form and draws the result.

Generation, for a DC capacity in kWp and a yield in kWh/kWp/day:

- Daily kWh = kWp × yield
- A displayed month = daily × 30
- Annual kWh = daily × the sum of the month lengths in 2026 (not a leap year), which is daily × 365

Checks at yield 5: `generation(3)` is 15 kWh/day and 450 kWh in 30 days. `generation(5)` is 25 and 750. A sales “3 kW” package is 6 × 550 W = 3.30 kWp, so the package generates 16.5 kWh/day and 495 kWh in 30 days. The 15 / 450 check is the formula, not the package.

Sales suggestion, preliminary:

- Bill up to Rs 3,800 → 3 kW
- Above Rs 3,800 up to Rs 6,000 → 5 kW
- Above Rs 6,000 → size from consumption, no fixed package, site assessment
- If the visitor types units, those units are weighed first. A package whose 30-day generation is more than twice the units steps down to a consumption-based size, not below 1 kW
- Caps: shade-free roof (about 100 sq ft per kW), sanctioned load, and the 20 kW domestic net-meter ceiling

Physical flows, with daytime use assumed and disclosed (day 70%, mixed 45%, night 25% of consumption during sun hours):

- Self-consumption = min(generation, consumption × daytime fraction)
- Export = generation − self-consumption
- Import = consumption − self-consumption

Settlement follows Reg 28, for a new prosumer, solar-hour export only (no battery):

- Banked export uses the domestic solar factor of 1.0
- Up to and including 2 kW, take-back is 1. Above 2 kW, night use is treated as off-peak (peak and off-peak are not metered here) and take-back is 0.85
- Billed units = daytime import + night import not covered by that bank
- This is not consumption minus generation
- A 2% monthly banking charge applies to surplus still carried forward
- New-prosumer solar feed-in tariff Rs 2.79/kWh (existing prosumers Rs 3.08; the visitor is treated as new). The credit is applied only against the fixed charge, and only up to that charge
- Energy charge uses the slab of billed units. Fixed charge uses the slab of gross monthly consumption. The fixed charge does not fall into a cheaper slab because of solar
- New domestic systems up to 10 kW are exempt from grid-support charge until the 1 Apr 2027 proviso for systems above 5 kW. Above 10 kW the charge is Rs 0.50/kWh for the first 300 adjusted units and Rs 1 after that
- Above 10 kW the regulations ask for storage. The note says so and asks for a site visit. Battery cost is not added

Current bill: the amount entered, or, when only units are entered, the LT-I energy plus fixed charge before duty. Savings = that current bill minus the estimated bill after solar, for the same month. Annual savings = monthly savings × 12. Generation is not multiplied by a flat rupee rate.

A two-month entry is divided by 2 before sizing, billing and savings. The result says it is shown per month, and that solar does not change the billing period.

Subsidy, residential only, on DC module capacity, eligible kW capped at 3:

- 1 kW → Rs 30,000; 2 kW → Rs 60,000; 3 kW and above → Rs 78,000; 1.5 kW → Rs 45,000
- Net cost = indicative cost minus potential subsidy, and only when the connection is treated as an eligible home
- A non-home connection shows Rs 0 and no net cost
- The section title is “Government Subsidy — Subject to Eligibility”

EMI = P × r × (1+r)^n / ((1+r)^n − 1), with r the monthly rate and n the repayment months. At zero interest, EMI = P / n. n = tenure minus moratorium. Moratorium interest is not capitalised. Subsidy is not subtracted from the principal. Combined monthly outflow = EMI + estimated bill after solar. Savings are not subtracted a second time. If the stored rate is older than 120 days it is still shown, with the check date, and the field stays editable. If no single rate is on file, EMI stays blank until a rate is typed.

The 60% story is four labelled illustrative rows only: 60% of production self-consumed, 60% exported, consumption equal to 60% of generation, and net import near zero. The main result uses the flows above.

LT-I energy (Rs/unit) and fixed charge (Rs/month, single phase / three phase):

| Monthly units | Energy | Fixed, single | Fixed, three |
| --- | ---: | ---: | ---: |
| 0–50 | 3.35 | 50 | 130 |
| 51–100 | 4.25 | 85 | 175 |
| 101–150 | 5.35 | 105 | 205 |
| 151–200 | 7.20 | 140 | 215 |
| 201–250 | 8.50 | 160 | 235 |
| 0–300 | 6.75 | 220 | 240 |
| 0–350 | 7.60 | 240 | 250 |
| 0–400 | 7.95 | 260 | 260 |
| 0–500 | 8.25 | 285 | 285 |
| Above 500 | 9.20 | 310 | 310 |

Slabs through 250 units are telescopic. From 300 units the whole block is one rate. Above 500 units, one republished copy prints Rs 8.20. That is below the 0–500 rate of Rs 8.25 and is treated as a misprint. The schedule used here is Rs 9.20.

Worked example, 400 units, mixed use, 3.30 kWp, yield 5: schedule bill about Rs 3,440 (400 × 7.95 + Rs 260). Estimated bill after solar about Rs 103 (fixed charge Rs 260, energy charge Rs 0, feed-in credit about Rs 157). Potential monthly savings about Rs 3,337. Not a zero bill.

## Files changed

- `js/solar-model.js` — new pure model
- `js/config.js` — assumptions, sources, dates. Feasibility state list unchanged
- `js/calculator.js` — DOM controller only. Booking links, WhatsApp, URL `?bill=`, `?units=`, `?period=2`, and the on-page form prefill stay
- `calculator.html` — inputs and result labels
- `css/daylight.css` — loan box, choice chips, subsidy block
- `js/premium.js` — homepage quick estimate uses the same model
- `js/contact-form.js` — capacity estimate uses the same model. A bill is no longer divided by Rs 7.20
- `tests/solar-model.test.js` — 12 node tests
- `index.html`, `contact.html`, `equipment.html` — script order so the model loads before the controller

SEO pages that still say about 90% bill reduction were not rewritten.

## Tests

`node --test tests/solar-model.test.js` — 12 passed, 0 failed.

Covered: generation at 3 kWp and 5 kWp; bills Rs 450, 3,800, 6,000 and above 6,000; units entered directly; day versus night import at 900 units; near-balanced import and export not equal to consumption minus generation; residential subsidy versus none; cash, a normal EMI, and zero interest; a missing tariff and a stale loan rate; a two-month bill normalised to the same month as the matching one-month bill; panels, DC kWp, inverter and generation on one system; the four 60% rows staying illustrative; empty, zero and non-numeric input rejected; SBI and Central Bank dates, including a blank Central Bank rate above Rs 2 lakh.

Browser, 26 Oct 2026, desktop 1280×900 and phone 390×844:

- Default Rs 3,500 → 3 kW, 3.30 kWp, 6 × 550 W, 495 kWh in 30 days, bill after solar about Rs 103, subsidy Rs 78,000, EMI not used
- Rs 450 → 3 kW, site assessment, bill after solar shown as under Rs 1 with “not guaranteed”
- Rs 3,800 and a two-month Rs 7,600 produce the same monthly result
- Rs 6,000 → 5 kW, 10 panels, 5.50 kWp
- Rs 8,000 → calculated 6.05 kWp, no fixed package
- 400 units → schedule bill about Rs 3,440, same 3 kW system
- 900 units, night import and bill after solar both higher than daytime use
- Non-home connection → subsidy Rs 0, no net cost
- SBI loan on the default system fills 8.15% because the principal is above Rs 2 lakh, and shows EMI, interest, and EMI plus the bill after solar
- Central Bank above Rs 2 lakh leaves the rate empty and shows 8.20–9.75%
- Custom loan, Rs 1,20,000, 0%, 12 months → EMI Rs 10,000, interest Rs 0
- Empty and zero bills show an error instead of a system
- Homepage Rs 3,500 matches the calculator. Homepage Rs 8,000 matches the calculated size and says a site assessment is recommended
- “Book a Site Assessment” prefills the form. `contact.html?bill=3800&kw=3.3` shows 3.3 kW, 6 panels, Rs 3,800
- No horizontal overflow on the phone. No “free electricity” and no promised zero bill in the result
- Screenshots: desktop full page, phone full page, phone calculator card

## Open questions for Suryavamshi

1. Is Rs 70,000 per kW an acceptable indicative cost, or should the calculator use the company’s price list?
2. Confirm the above-500-unit energy charge of Rs 9.20 against the republished Rs 8.20.
3. Confirm treating the visitor as a new prosumer (feed-in Rs 2.79) and treating night use as off-peak (take-back 0.85).
4. If the SBI FAQ and the SBI features table disagree again, the features table is what the calculator shows. Say if that should change.
5. Central Bank above Rs 2 lakh has no single rate. A preferred default inside the published range can be added if you want one.
6. Electricity duty is excluded. A verified duty rate can be added later.
7. Homepage and SEO copy still say about 90% bill reduction, and some badges still present Rs 78,000 as the subsidy figure. Those pages were left unchanged.
8. Confirm that a 6 × 550 W array should be labelled “3 kW” as well as 3.30 kWp.
9. Above 10 kW the regulations ask for storage. The calculator notes that and does not price a battery. Confirm that is the sales rule.
10. The ekiran FAQ URLs returned 404. Confirm the public FAQ path if one should be linked.
