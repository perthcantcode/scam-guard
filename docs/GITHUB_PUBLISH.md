# Publish to a public GitHub repository

Repository: perthcantcode/scam-guard. Works in PowerShell, Git Bash, macOS and Linux terminals.

## Before you push (2 minutes)

- Open `README.md` and `docs/SUBMISSION.md`. Fill in team name, member names, repository URL, demo video URL and the X/LinkedIn post URL.
- The code license is **MIT** (`LICENSE`, copyright Ruperth Jay G. Vesina). Change it now if your team prefers another one.
- Personal planning files (`scam-guard-master-plan.md`, `scam-guard-prompts.md`), `node_modules/`, `dist/`, and the generated `public/ort/` and `public/tesseract/` folders are already in `.gitignore`. No API keys or `.env` files are used.

## 1. Create the empty repository

1. Go to https://github.com/new
2. Repository name: `scam-guard`
3. Visibility: **Public**
4. Leave **Add a README**, **.gitignore** and **license** unchecked (the project already has them).
5. Press **Create repository**.

## 2. Push the project

Run these inside the project folder (the one containing `package.json`):

```sh
git init
git add .
git status
```

Read the `git status` list. You should see `src/`, `docs/`, `scripts/`, `public/favicon.svg`, `public/icons/`, `tests/`, `LICENSE`, `README.md`, `package.json` and `package-lock.json`. You should **not** see `node_modules`, `dist`, `public/ort` or `public/tesseract`. About 50 files, roughly 1.4 MB. Line-ending warnings (CRLF/LF) are harmless.

```sh
git commit -m "Scam Guard: on-device scam message checker (AppBuilders PH Hackathon 2026)"
git branch -M main
git remote add origin https://github.com/perthcantcode/scam-guard.git
git push -u origin main
```

If Git asks you to sign in, use the browser prompt or a personal access token. If it says it does not know who you are, run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then repeat the commit.

## 3. Verify a clean clone builds

```sh
cd ..
git clone https://github.com/perthcantcode/scam-guard.git scam-guard-check
cd scam-guard-check
npm ci
npm run setup:ocr
npm test
npm run build
```

All four steps should pass. Then open the repository's **Actions** tab and confirm the *Verify* workflow is green.

## 4. Polish the repository page

- Add a short description: *Private, on-device scam message checker. Local OCR and embeddings, no cloud AI.*
- Add topics: `local-ai`, `scam-detection`, `privacy`, `pwa`, `tesseract`, `transformers-js`, `vite`, `hackathon`.
- Optional: add a screenshot from `docs/screenshots/` to the repository's social preview.

## 5. Optional live link

The app is static. On Vercel or Netlify, import the repository, set the build command to `npm run setup:ocr && npm run build`, the output directory to `dist`, and deploy at the domain root. A live link is not required by the checklist; the public repository and the demo video are.

## Submission checklist

See [SUBMISSION.md](SUBMISSION.md) for every field the organizers ask for, with the answers drafted. The deadline shown in the briefing slides was **10:00 AM, October 10, with no extensions**.
