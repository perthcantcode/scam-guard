# Submission pack

## Project

**Scam Guard** — A private, on-device second opinion for suspicious messages. Paste a text or read a screenshot, inspect concrete warning signs, and track patterns in a personal radar without sending conversations to a cloud AI service.

**Target users:** everyday Filipinos, including students and young adults receiving suspicious texts and offers.

## Submission form answers

Drafted from the organizers' submission checklist (the project, the proof, the disclosures). Fill every `[...]` before you submit. **Deadline: 10:00 AM, October 10. No extensions.**

### The project

| Field | Answer |
| --- | --- |
| Project name | Scam Guard |
| Short description | A private, on-device second opinion for suspicious messages. Paste a text or read a screenshot, see understandable red flags in English or Tagalog, and track your own scam exposure, all without sending the message to a cloud AI service. |
| Team members | [team name and member names, confirmed with every contributor] |
| Public GitHub repository | [https://github.com/perthcantcode/scam-guard] (see [GITHUB_PUBLISH.md](GITHUB_PUBLISH.md)) |

### The proof

| Field | Answer |
| --- | --- |
| Demo video | [video URL] |
| X / LinkedIn video URL | [post URL] |
| What runs locally | Rule checks, link checks, screenshot OCR (Tesseract.js), semantic similarity (MiniLM embeddings in a Web Worker, WebGPU with WASM fallback), history and statistics (IndexedDB). |
| What requires internet | First visit to load the app. English OCR data during `npm run setup:ocr`. The one-time embedding model download from Hugging Face when the user presses Enable local AI. No message or image is sent anywhere. |

### The disclosures

| Field | Answer |
| --- | --- |
| Models used | `Xenova/all-MiniLM-L6-v2` (quantized q8, pretrained, no fine-tuning). Tesseract English LSTM data (`tessdata_fast`). No LLM. |
| Technologies and frameworks | Vanilla JavaScript, Vite 8, vite-plugin-pwa / Workbox, Transformers.js with ONNX Runtime Web, Tesseract.js, Dexie / IndexedDB. |
| APIs and cloud services | No cloud AI API. No analytics, no external fonts. Hugging Face is used only to download the model file in the user's browser. |
| Existing code and assets | Open-source packages above under their own licenses. The brand, icons, scene illustrations and mascot are code-drawn for this project. [Confirm any starter files or earlier code your team brought in.] |
| AI development tools | OpenAI Codex and collaborating agents (core implementation); Claude by Anthropic (UI and design polish, documentation). [Add any other tools your team used, for example Cursor or GPT.] |

### Every submission must answer: Why does this product benefit from running AI locally?

Messages that people want checked often contain names, phone numbers, bank or e-wallet details and OTP prompts. Running OCR and the semantic model on the device means that private content never has to be uploaded just to find out whether it is a scam. There is no account, no API key and no per-check cost, and after the one-time setup downloads the checker is designed to keep working on a weak or interrupted connection, which is the everyday reality for many Filipino mobile users. Rules still work even before the model is downloaded.

## Why local AI?

Messages can contain private financial and personal information. Embedding inference and screenshot OCR execute on the user's device; messages need not leave the browser. Once assets are cached, the design supports checking during connectivity interruptions. Rules remain available without downloading the embedding model. Initial setup and cache eviction still require connectivity.

## Criteria and evidence

| Criterion from supplied reference | Implementation / evidence |
| --- | --- |
| Problem and usefulness, 25% | Paste or screenshot checks, understandable evidence, private history; demonstrate a scam and an ordinary message. |
| Local AI implementation, 25% | MiniLM embeddings in a browser worker and Tesseract OCR locally; show the proof panel and cached-assets setting. |
| Technical execution, 20% | 21 regression tests, production PWA build, validated metadata backup/import; see TEST_RESULTS.md. |
| Innovation, 15% | Personal exposure radar combined with local text/screenshot checks and English/Tagalog explanations. No claim of a novel model. |
| Product and demo quality, 15% | Responsive checker, editable OCR text, clear states, modest motion with pause/reduced-motion support, guided tour. |

## Demo outline (about 3 minutes)

1. Explain the privacy problem and intended user (20 seconds).
2. Enable local AI in advance. Check the Prize message; show evidence and explain the score is a heuristic (35 seconds).
3. Check Everyday text to show a contrasting result (20 seconds).
4. Upload `tests/fixtures/prize-message.png`, review extracted text, then check it (30 seconds).
5. Show model status and proof timings. Demonstrate an actual offline reload only after verifying it on the recording device (35 seconds).
6. Open My radar. Identify any synthetic demo records explicitly; show private metadata history (25 seconds).
7. Explain initial downloads, English model limits, and no cloud AI inference (15 seconds).

The in-app tour is an optional recording aid, not a substitute for showing actual OCR and local inference. Its sample checks are labeled as demo data.

## Final checklist

- [x] Source implementation and reproducible build commands
- [x] Models, tools, assets and network dependencies disclosed
- [x] Automated test results documented
- [ ] Confirm team and member names
- [ ] Confirm work dates and pre-existing contributions with all contributors
- [x] Code license chosen: MIT (see `LICENSE`; change it if your team prefers another)
- [ ] Record actual offline operation on the target device
- [ ] Publish repository and verify a clean clone builds ([GITHUB_PUBLISH.md](GITHUB_PUBLISH.md))
- [ ] Record and publish demo; add video and social-post URLs
- [ ] Submit the organizer's form

The percentages and checklist above are transcribed from the supplied screenshots, not independently verified current event rules.
