# Run Scam Guard locally

Scam Guard is a static web app (vanilla JavaScript + Vite). It needs no backend, no API key and no account.

## 1. What you need

- **Node.js 22 or newer** (tested on 22 and 24). Check with `node -v`.
- **Git** (only to clone).
- A modern browser: Chrome, Edge or Firefox. WebGPU is used when available; WASM is the fallback.
- An internet connection for the **first** setup only (see "What downloads" below).

## 2. Install and start

```sh
git clone https://github.com/perthcantcode/scam-guard.git
cd scam-guard
npm ci
npm run setup:ocr
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

What those commands do:

| Command | Purpose |
| --- | --- |
| `npm ci` | Installs the locked dependencies. Its postinstall step copies the ONNX and Tesseract runtime files into `public/` and generates the app icons. |
| `npm run setup:ocr` | Downloads the official English Tesseract language data (about 4 MB), verifies its SHA-256, and saves its license. This is a one-time file download, not a cloud OCR call. |
| `npm run dev` | Starts the development server. |

## 3. Try it

1. On **Check message**, press an example button (for example *Prize message*) and then **Check message**. Rules run immediately.
2. Press **Enable local AI** to download the pretrained `Xenova/all-MiniLM-L6-v2` model once. It then runs in a Web Worker on your device.
3. Open **Upload screenshot**, choose an image (try `tests/fixtures/prize-message.png`), review the extracted text, then check it.
4. Open **My radar** and press **Load demo data** to see the heatmap with clearly labeled sample records.
5. On **How it works**, press **Play product tour** for a guided walkthrough.

## 4. Test and build

```sh
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

`npm test` runs 21 synthetic regression tests. `npm run build` creates `dist/` with a service worker that precaches the app shell and OCR files.

## 5. Check the offline behavior yourself

A dev server is not proof of offline support. Use the production preview:

1. Run `npm run build` and `npm run preview`.
2. Open the page online, wait for caching, press **Enable local AI**, and read one screenshot.
3. Turn on **Use cached assets only**, then disconnect (airplane mode or DevTools, Network, Offline).
4. Reload and run a check. Look at **How this check ran** for the processing mode and timings.

## What downloads, and when

| Item | When | Where from |
| --- | --- | --- |
| App files | First visit | Your own server |
| English OCR data | `npm run setup:ocr` | Official `tesseract-ocr/tessdata_fast` repository |
| Embedding model (quantized, tens of MB) | When you press **Enable local AI** | Hugging Face, cached by Transformers.js in your browser |

Your messages and images are never uploaded. Suspicious links are shown as text and never fetched.

## Troubleshooting

- **`npm ci` fails on a native package or a download error.** Make sure you are online and on Node 22+. Behind a corporate network, try `npm ci --ignore-scripts` and then `node scripts/prepare-assets.mjs`.
- **Certificate errors on Windows during `setup:ocr`.** Run `node --use-system-ca scripts/download-ocr.mjs`. Never disable TLS verification.
- **Screenshot reading says OCR data is missing.** Run `npm run setup:ocr` once while online.
- **Local AI shows Unavailable.** Check your connection for the one-time model download. Rule checks keep working, and the result card tells you when it used rules only.
- **Blank page after switching branches.** Stop the dev server, delete `node_modules` and run `npm ci` again.
