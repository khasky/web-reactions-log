# AGENTS.md — Web Reactions Log

**Public, data-only repo. No application code.** Every file here is **machine-generated**, appended by the Web Reactions cron — signed checkpoints and their Bitcoin timestamps:

- `checkpoints/latest.json` — newest Ed25519-signed tree head (STH).
- `checkpoints/<YYYY-MM-DD>.ndjson` — daily shard, one signed checkpoint per line.
- `ots/<tree_size>.ots` / `.json` — matured OpenTimestamps proof anchoring that root in a Bitcoin block, + its signed checkpoint and block height.
- `ots/latest.json` — pointer to the newest matured proof; `ots/<tree_size>.pending.json` — interim receipt before maturity.

## The one rule

**Never hand-edit, rebase, force-push, or rewrite history here.** Rewriting this repo's history is itself the tamper signal the whole system depends on — third-party mirrors (e.g. Software Heritage) preserve the real history, so a rewrite is detectable and self-defeating. Only the automated backend writes to this repo; an agent should not.

- Don't add tooling, build scripts, or verification logic here — the open-source **verifier** lives in its own repo (`web-reactions-verifier`). Point people there.
- Public repo: no secrets, no private internals.
