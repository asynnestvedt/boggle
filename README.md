# Woggle

A shared Boggle board for phones, tablets, and computers. Sign in, share a room link,
and play the same round with friends. The server owns the board, deadline, saved
words, and scores. Reloading or reconnecting restores the current round.

**Letterlight**, available at `/letterlight/`, is a daily five-letter word game.
Everyone gets the same server-selected puzzle each UTC day and has six guesses.
Sign in with a Woggle account to save progress across devices. The server validates
guesses against the MIT-licensed `an-array-of-english-words` list and keeps the
answer private until the game ends. The daily selection secret is stored in SQLite;
keep it with your database backups so puzzles remain consistent after a restore.

## Run locally

Requires Node.js **22.13 or newer** and npm. Tested with Node 22.15 on Windows.
Node 22 prints an experimental warning for its built-in SQLite module.

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Open [localhost:3000](http://localhost:3000). Create an account with a display name,
email address, and a password of 12–128 characters. The first player is the room
host. Share the room link; friends sign in or register before joining. A solo game
uses the same server-owned room system.

The host selects a 4×4 or 5×5 board, a 1–10 minute duration, and die orientation.
Use the microphone icon to join room voice chat. Joining requests microphone
permission; leaving voice, leaving the room, signing out, or losing the room
connection stops capture. The voice panel offers microphone and speaker selection,
microphone and incoming-audio mute, volume, echo cancellation, and noise suppression.
Device selection depends on browser support and permissions. Voice requires HTTPS
or localhost, supports up to eight connected voice sessions per room, and resumes
only when you choose to join again after a disconnect. Audio is relayed through the
server to opted-in participants in the same room and is not stored.
The room and players panel shows up to ten recent groups. Copy the current room's
invite link beside a group and share it with those players. Groups are saved per
account when a round starts with multiple connected players.
Select adjacent dice, then save the word. A `Qu` die counts as two letters and can
form a three-letter word with one adjacent die. Reusing a die or wrapping across
the edge of a board is rejected by the server.

At the deadline, everyone receives the same finished round. Expand the players'
word lists and review validity and duplicates with your group. Click your own
words to exclude or restore them; everyone sees the resulting scores. The existing
house scoring rule is preserved: **word length minus two**. There is no automated
English dictionary check or automatic duplicate cancellation.

Closing a tab preserves membership and the current round. Multiple tabs for one
account count as one player. Leaving explicitly transfers the host role to the
next member. If a host disappears, an online member can select **Become host**
between rounds. **New room** leaves the current room and creates another.

## Passwords and reset email

The account panel supports signing in, signing out, password changes, and forgotten
passwords. Passwords use salted scrypt hashes. Sessions use opaque, hashed tokens
and HttpOnly, SameSite cookies; production cookies are Secure. Password resets
expire after 30 minutes, work once, and revoke all existing sessions and game
connections. Changing a password requires the current password and also signs out
all sessions. Email addresses are normalized to lowercase.

For local development without SMTP, reset emails are written as JSON files under
`.data/outbox/`. Read the latest message and open its link:

```powershell
Get-ChildItem .data/outbox | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
```

Reset tokens are never included in API responses. Links use the configured
`APP_URL`, carry the token in a URL fragment, and remove it from the address bar
when opened. A newer reset request invalidates the previous link. Email ownership
verification at registration is not implemented.

To deliver real reset emails, configure `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, and,
if required by your mail service, `SMTP_USER` / `SMTP_PASSWORD`. Port 465 uses TLS
immediately; other ports require STARTTLS. Do not commit `.env` or `.data`.

## Production configuration

Run **one Node process** behind an HTTPS reverse proxy with WebSocket upgrade
support. For example:

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://woggle.example.com
DATA_DIR=/var/lib/woggle
TRUST_PROXY_HOPS=1
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=Woggle <woggle@example.com>
```

Use your actual public origin for `APP_URL`, including the port if nonstandard.
Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies; use `0`
when connecting directly. Production startup requires HTTPS and SMTP configuration.
SMTP delivery itself must be verified with your mail service before launch.
For initial deployment without a mail provider, `RESET_EMAIL_DISABLED=true` starts
the app with password reset requests explicitly unavailable. Configure SMTP and
remove that setting to enable email resets.

Persist `DATA_DIR` on a local disk or persistent volume. SQLite stores accounts,
sessions, reset-token hashes, and the current state of every room. A server restart
restores the same boards, word lists, and deadlines; an elapsed round finishes on
restart. Back up the database using SQLite-aware tooling (WAL files may be active).
The development outbox contains sensitive reset links; do not expose it publicly.

Rooms expire after 24 hours without activity once no clients remain connected.
Sessions expire after seven days. Rooms support up to 32 members and five
connections per account. Request limits protect account endpoints, room creation,
and WebSocket commands; stale connections are removed with server ping/pong.

The process keeps an in-memory room cache backed by SQLite. Do not run multiple
workers or replicas against the same database: horizontal scaling requires a shared
room coordinator and broadcast layer first. Only the current round is retained;
long-term game history is not implemented.

## Development and tests

```powershell
npm test
npm run test:browser
```

The server suite covers authentication, password-reset races and expiry, session
revocation, HTTP/WebSocket access checks, host takeover, board validation, late
joins, multiple tabs, deadlines, word privacy/review, and database persistence.
Browser tests exercise two independent players, transport loss and reconnection,
reloads, account recovery, word review, and a 390px mobile layout. Each test uses
isolated data; no real emails are sent.

On Windows, browser tests use installed Microsoft Edge. On other platforms:

```sh
npx playwright install chromium
npm run test:browser
```

Set `PLAYWRIGHT_CHANNEL` to select another installed browser channel. Test
screenshots are saved under `test-results/`.

### Server structure and protocol

- `server/index.js`: HTTP API, origin checks, cookie authentication, WebSocket transport.
- `server/lib/auth.js`: accounts, scrypt, session and reset-token lifecycle.
- `server/lib/store.js`: SQLite schema and persistence.
- `server/lib/rooms.js`: authoritative round and word state.
- `server/lib/mailer.js`: SMTP delivery and development outbox.
- `public/js/main.js`: board UI rendered from server snapshots.
- `public/js/lib/room-connection.js`: authenticated WebSocket connection and recovery.

The browser connects to `/api/rooms/socket?room=<server-issued-id>` using its
session cookie. Identity and display names are taken from the account, never the
query string. Clients send `{ action, payload }` commands:

- `startRound`: settings and the last room version; only the host may start.
- `submitWord`: current round ID and a zero-based die path; the server derives the word and points.
- `reviewWord`: current round ID, own saved word, and an `excluded` boolean after the deadline.
- `claimHost`: take over only when the current host is offline.
- `sync`: request a fresh snapshot.
- `leaveRoom`: leave explicitly, across this account's tabs in the room.

The server sends `state` snapshots with a room version, `serverNow`, and round
timestamps, or `error` messages. Active-round snapshots contain only the requesting
player's words; all lists become visible after the round ends. The UI measures
elapsed time from each server timestamp instead of incrementing a local counter,
resynchronizes every ten seconds and on tab visibility changes, and disables input
when disconnected. The server independently enforces the deadline on every command.

The old client-authored `startgame` relay, anonymous identity cookies, board-generation
API, and unbounded third-party HTTP solver proxy have been removed.
