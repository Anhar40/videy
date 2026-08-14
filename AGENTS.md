# AGENTS.md

Single-file camera video recorder app: `server.js` (Express 5 + Multer 2 backend) serves `index.html` (vanilla JS frontend, no framework/build step). Recordings are uploaded straight to **Cloudinary** (no local disk storage).

## Commands
- Run: `npm start` (or `npm run dev`; both just `node server.js`).
- No tests, lint, or typecheck. Verify by starting the server and hitting the API.
- Deps: `express`, `multer`, `cloudinary`, `dotenv`. `.env` has `CLOUDINARY_URL` (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`); `server.js` also accepts `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`. Keep `.env` out of git.

## Gotchas
- Port is hardcoded to `3000` in `server.js`.
- **Cloudinary storage**: multer uses `memoryStorage()` (no `uploads/` on disk). `POST /api/recordings/upload` pushes the buffer to Cloudinary folder `recordings/` as a `video` resource; `recording.filename` = full `public_id` (`recordings/camera-...`), `recording.url` = `secure_url` (`https://res.cloudinary.com/...`). `GET /api/recordings` lists via `cloudinary.api.resources` with `prefix: "recordings/"` (excludes Cloudinary `samples/`), sorted by `created_at` desc. `GET|DELETE /api/recordings/:filename` use `cloudinary.api.resource` / `uploader.destroy` (`resource_type: "video"`). Handlers are `async`; `:filename` is used raw (do NOT `path.basename` it).
- **Direct browser upload**: normal recording upload does NOT go through the server. `index.html` fetches `GET /api/upload-signature?filename=camera-<ts>` (returns signed `timestamp`/`signature`/`api_key`/`cloud_name`/`folder` via `cloudinary.utils.api_sign_request`) then POSTs the blob directly to `https://api.cloudinary.com/v1_1/<cloud>/video/upload` with form fields `file`, `cloud_name`, `api_key`, `timestamp`, `signature`, `folder: recordings`, `public_id`. `POST /api/recordings/upload` remains only as a fallback for the `pagehide` `sendBeacon` path.
- **Plain Node server**: runs directly with `node server.js`; `app.listen(PORT)` is unconditional at the end of `server.js`. `api/` and `vercel.json` were **removed** (no serverless/Vercel anymore) and all `isVercel`/`getDiagnostics()`/`findFrontendFile()` vestiges were cleaned out of `server.js`. Frontend files are served from `__dirname` (static + explicit routes for `/`, `/videos.json`, `/preview.html`). `.env` holds the Cloudinary URL. Deploy to any Node host (Render, Railway, Fly.io, VPS): `npm install` then `npm start`, with `CLOUDINARY_URL` set.
- `index.html` loads the video from `videos.json` (`fetch("/videos.json")` in `loadVideo()`), takes the **first** entry, and sets `mainVideo.src` to its external `url` (no longer `/videos/video.mp4`; `videos/` is unused by the frontend).
- The JSON field `thumbnail_encrypted` (nonce/ciphertext/tag/key) is AES-128-GCM. `decryptThumbnail()` decrypts client-side with WebCrypto (`crypto.subtle`), appending the 16-byte tag to the ciphertext, and shows the result as JPEG via `mainVideo.poster`.
- Frontend won't start playback until camera permission is granted (`getUserMedia` runs before `mainVideo.play()` in `startVideo()`). Requires HTTPS or `localhost` + camera/mic. `crypto.subtle` also requires a secure context.
- On video `ended` (or `pause`, or leaving the page via `pagehide`), the recording auto-stops and auto-uploads to `/api/recordings/upload`. `pagehide` uses `navigator.sendBeacon` (fetch is unreliable during unload).
- The recording result section was removed from `index.html` — no on-page preview/download buttons. Previews live on a separate page: `preview.html`, which fetches `/api/recordings`, shows the latest recording, and lists the rest (click to play). `index.html` navbar shows only the **Videy** logo (no server-status text, no preview link); below the video title there is only a **Share** button (`navigator.share`, fallback: copy link + toast).
- Styling uses **Tailwind CSS via CDN** (`https://cdn.tailwindcss.com` + Google Fonts Inter) in both `index.html` and `preview.html` — requires internet at runtime. In `preview.html`, classes `.recording-item`, `.recording-name`, `.recording-info`, `.delete-btn`, `.status` are set/overwritten by JS (`element.className = ...`), so they are styled in a plain `<style>` block, not with Tailwind utilities. `#message.show` in `index.html` is also a plain `<style>` rule (JS toggles `.show`).

## Layout & endpoints
- `videos.json` — video playlist served statically at `/videos.json` (drives the frontend). `preview.html` — separate recordings-preview page at `/preview.html`. `videos/` — static video served at `/videos/*` (unused by frontend now). No local uploads folder.
- API (all JSON, `success` field): `GET /api/status`, `GET /api/upload-signature`, `GET /api/recordings`, `GET|DELETE /api/recordings/:filename`, `POST /api/recordings/upload`.
- Upload: multipart field `recording`, video mimetypes only (webm/mp4/ogg/mkv), max 500 MB. Stored in Cloudinary as `recordings/camera-<timestamp>-<random>.<ext>`.

## Conventions
- UI strings, error messages, and comments are Indonesian; keep them that way.
- Code style: nearly every statement is wrapped in extra parentheses with newlines inside the call (see `server.js`); match this in files you edit.
