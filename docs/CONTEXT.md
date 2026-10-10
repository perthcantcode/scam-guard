# Current project context

The user's current instruction supersedes older visual/stack suggestions in the original planning files: build a working program with a simple white interface, bold Helvetica or Montserrat-style type, and a touch of green. Retain vanilla JavaScript/Vite. No LLM training; use pretrained local inference plus rules and OCR.

- `src/main.js`: UI and interactions; `src/styles.css`: responsive design.
- `src/engine`: pure message analysis, links, templates, embedding worker/client, local OCR.
- `src/db`: Dexie metadata storage, import/export, local-date aggregation.
- `src/data`: brands, synthetic scam/benign examples, labeled demo history.
- `scripts`: local runtime copying, icon generation, official OCR-data setup.
- `vite.config.js`: PWA build and caching.

Keep inference private. Never send message/image content to model download hosts. Never claim real-world accuracy, guaranteed safety, or verified offline support without evidence. Keep demo rows labeled. Preserve raw-message privacy defaults, local day keys, import validation, and rule fallback when model setup fails.

Run `npm test` and `npm run build` after relevant functional changes. Browser verification should cover paste, results, history, radar, model readiness, screenshot errors/success, reload, and a real disconnected production PWA test. OCR English assets are downloaded and checksum-validated; reproduce them with npm run setup:ocr.

