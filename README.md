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

Everything under `checkpoints/`, `ots/`, and `entries/` is written by the anchoring
bot. What each file is for:

**`checkpoints/` — signed tree heads (STHs)**

- `latest.json` — the single newest checkpoint (`tree_size`, `root_hash`, `ts`,
  `signature`), pretty-printed. **Overwritten every checkpoint.** The O(1) entry
  point consumers and the verifier read first; also the git-published view that is
  compared against the live API to catch a split view.
- `<YYYY-MM-DD>.ndjson` — the permanent **append-only archive**: one compact JSON
  line per checkpoint, one shard per UTC day — the browsable history of every STH
  ever signed. Today's shard is appended to and freezes once the day rolls over.
- `.gitkeep` — empty marker so the directory survives a fresh/reset repo.

The newest checkpoint is in both `latest.json` and the current shard on purpose (a
moving pointer plus an append-only archive), not by accident.

**`ots/` — Bitcoin timestamps (OpenTimestamps)**

A checkpoint's root is submitted to the OTS calendars, then matured into a proof
once it lands in a Bitcoin block, so an anchored checkpoint `<tree_size>` produces:

- `<tree_size>.pending.json` — interim calendar receipt right after submission
  (queued, not yet in a Bitcoin block); superseded once the proof matures.
- `<tree_size>.ots` — the matured OpenTimestamps proof (standard binary `.ots`)
  anchoring that checkpoint's root in a Bitcoin block.
- `<tree_size>.json` — self-contained sidecar for that proof: the signed STH + the
  Bitcoin block height, so a verifier needs nothing else to tie the `.ots` to a
  checkpoint. (The block height lives here, not in the binary `.ots`.)
- `latest.json` — pointer to the newest matured proof; overwritten as proofs mature.
- `.gitkeep` — empty marker so the directory survives a fresh/reset repo.

Not every checkpoint gets its own OTS proof — only the newest not-yet-submitted one
each time submit runs; the rest ride a consistency proof to an anchored one.

**`entries/` — reserved (empty)**

Holds only `.gitkeep`. The raw log leaves (individual reaction events) are **not**
published here — they are served by the public API at `/log/entries`, which the
verifier refetches to recompute the Merkle root against the signed checkpoint here.

Revocations are part of that same raw API log: account erasure and other public
corrections are append-only `op=4` leaves, exposed at `/log/revocations`. The
verifier checks that endpoint against the actual `op=4` leaves covered by the signed
root anchored here.

## Reading the commit history

Every commit here is made by the anchoring bot. The message says what it did:

| Commit message | File written | What it means |
| --- | --- | --- |
| `add checkpoint 766` | `checkpoints/<YYYY-MM-DD>.ndjson` | a new Ed25519-signed tree head (STH) for `tree_size` 766 was appended — the substantive "a checkpoint was published" event |
| `update latest 766` | `checkpoints/latest.json` | the pointer to the newest checkpoint moved to 766 (the file the verifier reads) |
| `ots submit 759` | `ots/759.pending.json` | checkpoint 759's root was submitted to the OpenTimestamps calendars; awaiting a Bitcoin block |
| `ots anchor 759` | `ots/759.ots` | the proof matured — 759's root is now anchored in Bitcoin (the block height is recorded in the `ots/759.json` sidecar) |
| `ots sidecar 759` | `ots/759.json` | the self-contained sidecar for that proof (signed STH + block height) |
| `ots latest 759` | `ots/latest.json` | the pointer to the newest matured proof moved to 759 |

`tree_size` is the cumulative number of log leaves — it only ever grows.

**Commit messages are informational only.** The verifier never reads them: it
recomputes everything from the file *contents* here plus the public API's
`/log/*` endpoints. Read them to follow what the bot did; nothing depends on
their wording.

**Why the numbers look out of order.** Checkpoint `tree_size` values jump by
however many events landed in that hour (e.g. `742 → 754 → 759 → 766`), not by
one. And an OTS submit always anchors the *newest* checkpoint not yet submitted,
so several submits walk newest → older (`766`, then `759`, …). Both are expected;
most intermediate checkpoints never get their own OTS proof and are tied to an
anchored one by consistency proofs instead.

**Editing this repository.** Docs (`README`, `LICENSE`, anything outside the data
directories) are safe to edit — the verifier ignores them and the bot never
touches them. The data directories — `checkpoints/`, `ots/`, and any published
`entries/` — are machine-generated: hand-editing them, force-pushing, or
rewriting history is exactly the tampering the verifier is built to catch (and
third-party mirrors preserve the real history). Don't edit them by hand.

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

This repository holds only the published log data and its documentation — no
scripts or tooling. Operator maintenance (resetting the log to genesis after a
database reset, scaffolding a fresh empty layout for a new mirror) is performed by
the backend automation and lands here as normal bot commits, visible in the
commit history like everything else.

Force-pushing or rewriting history in this repo is itself the tamper signal —
third-party mirrors (e.g. Software Heritage) preserve the real history.

## License

The log data in this repository is dedicated to the public domain under
[CC0 1.0 Universal](LICENSE) — copy, mirror, and verify it freely.
