# Build and publish

Use Node 24 and the committed lockfile:

```sh
npm ci
npm run setup:ocr
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

On Windows with enterprise/system certificate requirements, use `node --use-system-ca scripts/download-ocr.mjs`. Never disable certificate verification. OCR data is checked against a pinned SHA-256 digest; review upstream changes before replacing it.

Deploy `dist` on an HTTPS static host. Build command: `npm run setup:ocr && npm run build`. Configure the host to serve `index.html` for `/share` and to serve real files under `/assets`, `/ort`, `/tesseract`, and `/icons`. Missing model/runtime files must not be replaced by HTML. This configuration assumes deployment at the domain root.

The app does not require environment variables, API keys, a backend, or an account. Large runtime files are expected. Model downloads happen in each user's browser, after consent through Enable local AI.

Before making a repository public, review staged files for private notes and credentials. Generated runtime files, dependencies, build output and original personal planning documents are ignored. Keep the lockfile, source, scripts, tests and documentation. No repository remote or publication has been created by this preparation work.

Run the production offline procedure in TEST_RESULTS.md on the demonstration device. A successful build is not proof of physical offline operation. Review license choices and third-party notices before publication.
