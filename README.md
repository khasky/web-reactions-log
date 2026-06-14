# web-reactions-log

Public, append-only transparency log for Web Reactions counters.

- `checkpoints/latest.json` — the most recent Ed25519-signed tree head (STH).
- `checkpoints/<tree_size>.json` — every published checkpoint, immutable.
- `entries/*.ndjson` — raw vote-log leaves for independent re-folding.
- `ots/<tree_size>.pending.json` — OpenTimestamps receipts (when enabled).

Anyone can verify the counters without trusting the operator:

    node webreactions/verifier/src/verify.js --repo <raw base url> [--api https://api.webreactions.app]

The byte formats, hashing, and the pinned public key are specified in
`webreactions/TRANSPARENCY.md`. Force-pushing or rewriting history here is the
tamper signal — mirrors and Software Heritage preserve the real history.
