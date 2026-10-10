# Implementation disclosures

- UI: original vanilla JavaScript, HTML and CSS using Helvetica/Arial system fonts; no downloaded font, UI framework, or analytics.
- Build/PWA: Vite 8.3.4 and vite-plugin-pwa 2.0.0 with Workbox service-worker generation.
- Storage: Dexie 4.4.6 / IndexedDB. Message text is excluded by default; exported backups always contain metadata only.
- Embeddings: @huggingface/transformers 4.3.1 with its installed ONNX Runtime Web dependency; pretrained `Xenova/all-MiniLM-L6-v2`, q8. Model setup downloads from Hugging Face; inference executes in a browser worker on WebGPU with WASM fallback. No fine-tuning or LLM.
- OCR: Tesseract.js 7.0.0, locally copied worker and embedded-WASM LSTM cores. English language data source: official `tesseract-ocr/tessdata_fast` repository. English data is included after setup, with a pinned SHA-256 digest. Local screenshot inference was verified with the synthetic prize-message fixture.
- Explanations: English/Tagalog templates, not generative AI.
- Data: 44 synthetic reference examples (32 scam, 12 benign), handwritten brand/domain rules, deterministic synthetic demo history. No external live scam database or reputation lookups.
- Development assistance: OpenAI Codex and collaborating agents for the core implementation; Claude (Anthropic) for the final UI and design polish (palette, marquee, How it works header, FAQ, mascot, footer) and the run/publish documentation. Existing starter files and user-supplied guides were inspected and modified. Other tools mentioned in the older planning documents were not verified as used.

Scores combine heuristic rules and experimental semantic similarity. The similarity thresholds have not been calibrated against a representative holdout set. Automated synthetic control tests are not a deployment accuracy claim. English semantic performance should not be presented as validated multilingual performance.

No cloud AI inference API is used. Static model/runtime files require initial downloads. Worker request counts are fetch attempts, and page resource timing is a diagnostic signal, not a complete network audit. No claim is made that a switch simulates a physical disconnection.

## Assets and licenses

Reference screenshots supplied by the user inspired spacing, typography and accents; their logos and images are not shipped. Icons, scene illustrations and the FAQ mascot are code-based assets in this project. Third-party runtimes retain their package licenses; the OCR setup saves the language data license alongside the asset. Model terms are available in the model repository. The original application code is released under the MIT license (see `LICENSE`).

