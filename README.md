# Web Reactions Log

Public, append-only transparency log for Web Reactions counters. It holds the
signed checkpoints and their Bitcoin timestamps — anyone can use it, together with
the public API and the open-source verifier, to recompute the counts and confirm
the signed history was never rewritten.

## What's here

- `checkpoints/latest.json` — the most recent Ed25519-signed tree head (STH).
- `checkpoints/<YYYY-MM-DD>.ndjson` — daily shard, one signed checkpoint per line.
- `ots/<tree_size>.ots` — matured OpenTimestamps proof anchoring that checkpoint's root in a Bitcoin block.
- `ots/<tree_size>.json` — that proof's signed checkpoint + the Bitcoin block height.
- `ots/latest.json` — pointer to the newest matured proof.
- `ots/<tree_size>.pending.json` — interim OpenTimestamps receipt, before a proof matures.

The raw log entries themselves are served by the public API (`/log/entries`); the
verifier refetches them and checks the recomputed Merkle root against the signed,
Bitcoin-anchored checkpoint published here.

Revocations are part of that same raw log. Account erasure or other public
corrections are represented as append-only `op=4` leaves, exposed separately at
`/log/revocations` for audit convenience. The verifier checks that endpoint
against the actual `op=4` leaves covered by the signed root anchored here.

## Verify

Use the open-source verifier (separate public repo):

```
git clone https://github.com/khasky/web-reactions-verifier
cd web-reactions-verifier
pnpm install
node src/verify.mjs \
  --api https://api.webreactions.app \
  --repo https://raw.githubusercontent.com/khasky/web-reactions-log/main \
  --pubkey <published Ed25519 key> \
  --ots
```

## Administrators

`clear-log.mjs` (operator-only) resets this log to empty — every checkpoint and OTS
proof removed, the `.gitkeep` markers kept — e.g. a pre-launch reset after the
backing database was cleared. It is dry-run by default, verifies the API is at
genesis first (so the log stays in lockstep with the DB), and does **not** commit:

```
node clear-log.mjs            # dry run — show what would be removed
node clear-log.mjs --yes      # remove, then review + git commit + push yourself
node clear-log.mjs --init     # (re)create the empty checkpoints/ ots/ entries/ layout
```

`--init` scaffolds the canonical empty layout — the data directories and their
`.gitkeep` markers — for standing up a fresh copy of this repo (e.g. a new mirror).

Operator tooling, not part of the published log.

Force-pushing or rewriting history in this repo is itself the tamper signal —
third-party mirrors (e.g. Software Heritage) preserve the real history.

## License

The log data in this repository is dedicated to the public domain under
[CC0 1.0 Universal](LICENSE) — copy, mirror, and verify it freely.
