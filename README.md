# Web Reactions Log

Public, append-only transparency log for Web Reactions counters. This repository
holds signed checkpoints and Bitcoin timestamps for the public reaction log. Used
with the public API and the open-source verifier, it lets anyone recompute the
counters and confirm the signed history was not silently rewritten.

This log is paired with the open-source
[`web-reactions-verifier`](https://github.com/khasky/web-reactions-verifier). This
repository holds the signed checkpoints and OpenTimestamps proofs; that repository
holds the code that checks them.

If you only want to check the current public log, start with **Verify** below.

## How verification works

Web Reactions publishes raw log entries from the public API (`/log/entries`) and
publishes signed tree heads in this repository:

1. Each accepted counter-changing event is serialized as a log leaf.
2. The API periodically builds a Merkle tree over the leaves and signs the root
   as a checkpoint with Ed25519.
3. This repository records those checkpoints in Git history; mature checkpoints
   can also be anchored to Bitcoin through OpenTimestamps.
4. The verifier refetches the public leaves, recomputes every leaf hash and the
   Merkle root, checks the signed checkpoint, then folds the log back into
   counters.

That means live counters are verifiable against the public log. A cached or
served counter that does not match the fold of the signed log is detectable.

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

### Fast check

Use the open-source verifier. The published Web Reactions Ed25519 key is pinned
in the verifier, so `--pubkey` is optional for the main deployment.

```bash
npx web-reactions-verify \
  --api https://api.webreactions.app \
  --repo https://raw.githubusercontent.com/khasky/web-reactions-log/main
```

To also compare one live target's `/reactions/count` response to the recomputed
fold, add `--target site/id`:

```bash
npx web-reactions-verify \
  --api https://api.webreactions.app \
  --repo https://raw.githubusercontent.com/khasky/web-reactions-log/main \
  --target github/1
```

### Bitcoin anchor check

`--ots` additionally verifies the newest matured OpenTimestamps proof against a
Bitcoin block. It is slower and can only pass after an OTS proof has matured, so
it is separate from the fast check:

```bash
npx web-reactions-verify \
  --api https://api.webreactions.app \
  --repo https://raw.githubusercontent.com/khasky/web-reactions-log/main \
  --ots
```

### From a checkout

The verifier lives in a separate public repository:

```
git clone https://github.com/khasky/web-reactions-verifier
cd web-reactions-verifier
pnpm install
node src/verify.mjs \
  --api https://api.webreactions.app \
  --repo https://raw.githubusercontent.com/khasky/web-reactions-log/main
```

The current pinned public key is:

```text
MZZMvWNdL8MXb0AzSvN3+XYnXeU126NWqfqyoZ1dLkU=
```

Pass `--pubkey <base64>` only when verifying a different deployment or a fork
with a different signing key.

With `--target github/1`, expected successful output looks like this. Without
`--target`, the live `/reactions/count` comparison line is omitted.

```bash
checkpoint: tree_size=12 ts=1782799216388
PASS  checkpoint Ed25519 signature
PASS  GitHub anchor matches signed root (tree_size=12)
PASS  fetched all 12 leaves (got 12)
PASS  every recomputed leaf_hash matches the served leaf (0 mismatch)
PASS  recomputed Merkle root == checkpoint root_hash
folded 11 (site,target,reaction) counters from 12 events
PASS  live /reactions/count matches the fold for github/1
revocations: 0 tombstone(s)
PASS  /log/revocations matches op=4 leaves in the log (0)
PASS  structural invariants hold (0 violation(s))

RESULT: PASS
```

Exit code `0` means the verifier passed. Exit code `1` means the public entries,
signed checkpoint, GitHub anchor, revocation list, or live counters did not match
what the verifier recomputed.

## Reactions, removals, and tombstones

The log records counter-changing events, not just final state:

- `op=1` — a reaction was added.
- `op=2` — a reaction was changed; the leaf records both the new reaction and
  the previous one.
- `op=3` — a reaction was removed by the user.
- `op=4` — a revocation tombstone: a later public leaf that reverses an earlier
  `op=1`, `op=2`, or `op=3` leaf.

So a normal user "unreact" is `op=3`, not a tombstone. Tombstones are for
append-only corrections such as account erasure or other public reversals. The
original leaf stays in the log; the `op=4` leaf points at it with `revoke_seq`,
and the verifier applies the inverse effect when recomputing counters.

## What this proves

The verifier checks integrity of the public counter history:

- the checkpoint signature matches the published Ed25519 key;
- the public API entries recompute to the signed Merkle root;
- the root matches the checkpoint published in this repository;
- the revocation endpoint matches the actual `op=4` leaves in the log;
- optional target counts match the fold of the signed log;
- with `--ots`, a matured checkpoint root is anchored in Bitcoin.

This does **not** prove that every reaction came from a unique human, or that the
anti-abuse policy is perfect. It proves that the published counters match the
public append-only log and that changes/removals/revocations are represented as
verifiable log events.

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
