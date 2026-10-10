# Verification — 2026-10-10

## Automated

- `node --test src/engine/__tests__/engine.test.js src/db/storage.test.js`: **21 passed, 0 failed**.
- `npm run build`: **passed**, PWA service worker generated with 21 precache entries (including English OCR data).
- Engine controls include 12 synthetic scam messages and 12 legitimate controls, clause-local OTP negation, misleading URL hosts, lookalike domains, non-duplicated rule weights, fallback scores, input bounds, and OCR file validation.
- Storage tests cover local dates/midnight, 53-week heatmaps, bounded streaks, quiet-week comparisons, private metadata backup validation, import deduplication, and preservation of real checks when replacing/removing demo data. Storage unit tests use an in-memory substitute; browser persistence was checked separately.

## Browser

Verified in the Codex in-app browser at `http://127.0.0.1:5174/`:

- Desktop UI loads; no external fonts. White/black/green styling visually inspected.
- Phone viewport 390 × 844 visually inspected; form and bottom navigation fit.
- Prize/OTP example: 85/100, high scam risk, evidence and explanation shown.
- Everyday study-group example: 0/100, no strong red flags.
- Both checks saved and survived a page reload.
- Radar shows saved checks, totals and source/type breakdowns.
- Demo load added 176 clearly labeled records; radar total became 178 including the two real test checks.
- Local model reached **Ready / GPU inference active** after supplying its required asyncify runtime.
- With cached-assets-only enabled, actual local AI classified the prize/OTP example as **Prize / Giveaway Scam, 85/100**. The proof panel reported **WebGPU, 483 ms embedding inference, 2 ms rules**, and **0 measured fetches/resources since AI ready**. This is a single observed run, not a performance benchmark or physical-offline test.
- Screenshots: [desktop](screenshots/check-desktop.jpg), [local AI result](screenshots/local-ai-result.jpg).

## Remaining checks / limitations

- OCR verified locally using tests/fixtures/prize-message.png: both sentences extracted correctly in 0.4 seconds; checking the extracted text produced 85/100 high scam risk. This is a clean synthetic image, not a general OCR accuracy benchmark.
- Production airplane-mode reload, fresh-page cached model initialization, WASM-only device, Android installation/share target, and a second physical device remain unverified.
- No real-world or representative multilingual accuracy evaluation; synthetic controls are regression coverage only.
- No deployment or hackathon submission performed.

## Final UI checks

- Slow marquee pause control changes to Resume and retains the paused state.
- Subtle outlined icon tiles, black footer, FAQs, and reduced-motion CSS added.
- Automated tests: 21 passed after UI and OCR readiness changes. Production build passed, including OCR language data.


- Final mobile UI inspected at 390 x 844; FAQ expands correctly. Full-page screenshots: final-desktop.jpg and final-mobile.jpg in docs/screenshots.

## Production cache check

At http://127.0.0.1:4173/, the service worker reported app and screenshot-reader caches ready. After stopping the preview server, the page reloaded successfully. With Use cached assets only enabled, a fresh OCR worker extracted the fixture correctly in 0.6 seconds. This verifies origin-unavailable app reload and OCR, not device-wide airplane mode or offline embedding initialization on this production origin.


## UI palette revision

White/black/red theme applied to the interface, charts, illustrations, demo cursor, favicon and generated PWA icons. Header alignment, headline wrapping and punctuation, metric baselines, and narrow-screen overflow refined. Checker and information page inspected at 320px and 390px viewport widths; radar inspected at 390px. No analysis or storage behavior changed. Updated final desktop/mobile screenshots accompany this revision.


## Scam Guard identity refinement

Replaced the reference-derived tagline with 'Spot the scam. Before you tap.' and introduced a static shield emblem. Two continuous marquee rows use opposite directions and red markers. Browser inspection confirmed both tracks running and both paused on hover. Repeated marquee copies are hidden from assistive technology; reduced-motion mode is static. Desktop and 390px phone layouts inspected with no phone horizontal overflow. Production build passed.

