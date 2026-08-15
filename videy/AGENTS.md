# AGENTS.md

Single-file camera recorder: `server.js` (Express 5 + Multer) serves `index.html` (vanilla JS, no build step) + `preview.html`. Recordings upload straight to **Cloudinary**; nothing is stored on local disk.

## Commands
- Run: `npm start` (or `npm run dev`; both just `node server.js`). Port is hardcoded `3000`.
- No tests, lint, or typecheck exist. Verify by starting the server and hitting `http://localhost:3000/api/status`.
- Deps: `express`, `multer`, `cloudinary`, `dotenv`.

## Env & Cloudinary
- `.env` is gitignored and absent locally; the server still starts without it, but every Cloudinary endpoint fails until credentials are set.
- Config accepts either `CLOUDINARY_URL` (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`) or `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`. Never commit `.env`.

## Upload architecture (read before changing endpoints)
- Normal upload is **browser → Cloudinary directly**, bypassing the server (which has a 4.5 MB serverless body limit historically). `index.html` `uploadRecording()`: fetch `GET /api/upload-signature?filename=...`, then POST the blob to `https://api.cloudinary.com/v1_1/<cloud>/video/upload` with fields `file, cloud_name, api_key, timestamp, signature, folder=recordings, public_id`.
- `POST /api/recordings/upload` is only a **fallback** for the `pagehide` path, which uses `navigator.sendBeacon` (fetch is unreliable during unload). Field name `recording`; accepted mimetypes `video/webm|mp4|ogg|x-matroska`; 500 MB limit (413 on `LIMIT_FILE_SIZE`).
- Recordings live in Cloudinary folder `recordings/` as `video` resources. `GET /api/recordings` lists via `api.resources` with `prefix: "recordings/"`, sorted `created_at` desc. `GET|DELETE /api/recordings/:filename` use `decodeURIComponent` on the param and must stay `resource_type: "video"`. Do NOT `path.basename` the param.
- All JSON responses carry a `success` field; messages and errors are Indonesian.

## Frontend flow (index.html)
- `loadVideo()` fetches `/videos.json`, keeps the whole array in `videos`, renders a list below the player (`renderVideoList()`, first 6 items + a "Lihat Lainnya"/"Tutup" toggle), and loads the first entry. `loadVideoByIndex(index)` sets `mainVideo.src = video.url` (external URL) and `poster = decryptThumbnail(video.thumbnail_encrypted)`.
- Clicking a different video runs `switchVideo(index)`: it pauses the current video, **awaits the in-flight recording save** (`stopAndSaveRecording()` — the recorder's `stop` → `finishRecording` sequence resolves a `savePromise`; without this await the old camera stream would be killed mid-recording), then auto-plays the clicked video and starts a fresh recording. Same-video clicks just resume if paused.
- `thumbnail_encrypted` (`nonce`/`ciphertext`/`tag`/`key`) is AES-128-GCM, decrypted client-side with WebCrypto: import raw `key`, append 16-byte `tag` to `ciphertext`, decrypt with `iv=nonce`, render as JPEG via `URL.createObjectURL`.
- Playback requires camera/mic permission first (`getUserMedia` runs before `mainVideo.play()` in `startVideo()`); recording starts automatically on play and stops/uploads on `pause` or `ended`. WebRTC `getUserMedia` and `crypto.subtle` need HTTPS or `localhost`.
- `MediaRecorder` mimeType fallback chain: vp9 → vp8 → bare webm.
- No on-page preview/download; the separate `preview.html` lists recordings from `/api/recordings` and plays the latest.

## Styling
- Tailwind via CDN (`cdn.tailwindcss.com`) + Inter from Google Fonts in both pages — needs internet at runtime.
- In `preview.html`, classes `.recording-item`, `.recording-name`, `.recording-info`, `.delete-btn`, `.status` are set/overwritten by JS (`element.className = ...`), so they're styled in a plain `<style>` block, NOT Tailwind utilities. Same for `#message.show` in `index.html` (JS toggles `.show`).

## Conventions
- UI strings, error messages, and comments are Indonesian — keep them that way.
- Code style: nearly every statement is wrapped in extra parentheses with the arguments on their own lines (see `server.js` / the inline `<script>`s); match this in files you edit.
- `.vercelignore` is a leftover from a removed serverless deployment; there is no `vercel.json`, `api/`, or serverless code anymore — deploy to any plain Node host with `CLOUDINARY_URL` set.
