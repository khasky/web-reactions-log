#!/usr/bin/env node
// =============================================================================
// clear-log.mjs — reset this transparency log to empty (genesis), safely.
// =============================================================================
// Wipes the published checkpoint + OpenTimestamps artifacts so the log can start
// fresh — e.g. a pre-launch reset after the backing database was cleared. It only
// touches the DATA directories (checkpoints/ ots/ entries/), removing everything
// EXCEPT the `.gitkeep` markers. README, LICENSE, .git, and this script are never
// touched.
//
// It can also create that empty layout from scratch (`--init`), so standing up a
// fresh copy of this repo (e.g. a new staging mirror) needs no separate scaffolding
// script — this one operator script both initializes and resets the layout.
//
// Dependency-free: Node 18+ built-ins only (no package.json / install needed).
//   node clear-log.mjs            # DRY RUN — show what would be removed
//   node clear-log.mjs --yes      # actually remove
//   node clear-log.mjs --init     # create the empty checkpoints/ ots/ entries/ layout
//   node clear-log.mjs --help
//
// Flags:
//   --init            create the canonical empty layout (dirs + .gitkeep) and exit;
//                     only ever creates missing pieces, never deletes
//   --yes, -y         apply the deletion (otherwise dry-run)
//   --api <url>       API base for the DB-lockstep check
//   --no-api-check    skip the DB-lockstep check
//   --force           proceed despite a failed precondition (no .git, or the API
//                     still reporting a non-genesis checkpoint)
// =============================================================================

import { readdirSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Repo root = this script's own directory, so it works from any cwd and can only
// ever clean the log repo it lives in.
const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIRS = ["checkpoints", "ots", "entries"];
const KEEP = new Set([".gitkeep"]);
const DEFAULT_API = "https://api.webreactions.app";

const argv = process.argv.slice(2);
const has = (...f) => f.some((x) => argv.includes(x));
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
};

const warn = (m) => console.warn(`! ${m}`);
const err = (m) => console.error(`✗ ${m}`);

async function main() {
  if (has("--help", "-h")) {
    console.log(
      "Usage: node clear-log.mjs [--init] [--yes] [--api <url>] [--no-api-check] [--force]\n" +
        "--init creates the empty checkpoints/ ots/ entries/ layout.\n" +
        "Otherwise resets those dirs to .gitkeep-only (dry-run unless --yes).",
    );
    return 0;
  }

  // --- Init mode: create the canonical empty layout, then exit ---------------
  // Lets this one operator script also scaffold a fresh log repo (the data dirs +
  // their .gitkeep markers) — e.g. a new staging mirror — so no separate bootstrap
  // script is needed. Idempotent: only ever CREATES missing pieces, never deletes.
  if (has("--init")) {
    let created = 0;
    for (const d of DATA_DIRS) {
      mkdirSync(join(ROOT, d), { recursive: true });
      const keep = join(ROOT, d, ".gitkeep");
      if (!existsSync(keep)) {
        writeFileSync(keep, "");
        created++;
      }
    }
    console.log(`Web Reactions log layout (root: ${ROOT})`);
    for (const d of DATA_DIRS) console.log(`  ${d}/.gitkeep`);
    console.log(created ? `\n✓ created ${created} missing marker(s).` : "\n✓ layout already present.");
    console.log("\nNEXT — commit it (only if this is a fresh repo):");
    console.log("    git init -b main      # skip if already a git repo");
    console.log('    git add -A && git commit -m "init transparency log layout"');
    console.log("    git push");
    return 0;
  }

  const apply = has("--yes", "-y", "--apply");
  const force = has("--force");
  const apiBase = (valueOf("--api") || DEFAULT_API).replace(/\/+$/, "");
  const apiCheck = !has("--no-api-check");

  // --- Precondition 1: this really is a Web Reactions log repo ---------------
  const present = DATA_DIRS.filter((d) => existsSync(join(ROOT, d)));
  if (present.length === 0) {
    err(`this does not look like a web-reactions-log repo (none of ${DATA_DIRS.join(", ")} found next to the script). Aborting.`);
    return 1;
  }
  for (const d of DATA_DIRS) if (!present.includes(d)) warn(`dir "${d}/" missing — skipping it.`);

  // --- Precondition 2: git is the safety net + the publish mechanism ---------
  // The reset only takes effect once committed & pushed, and git is the undo for
  // these deletions. Refuse without it unless --force.
  const hasGit = existsSync(join(ROOT, ".git"));
  if (!hasGit && !force) {
    err("no .git here — the reset only matters once committed & pushed, and git is your undo. Re-run with --force to clear anyway.");
    return 1;
  }
  if (!hasGit) warn("no .git — deletions will NOT be git-recoverable.");

  // --- Build the plan: every file in the data dirs except .gitkeep -----------
  const targets = [];
  for (const d of present) {
    for (const name of readdirSync(join(ROOT, d))) {
      if (KEEP.has(name)) continue;
      targets.push({ dir: d, name, path: join(ROOT, d, name) });
    }
  }
  const byDir = Object.fromEntries(DATA_DIRS.map((d) => [d, 0]));
  for (const t of targets) byDir[t.dir]++;

  console.log(`Web Reactions log reset — ${apply ? "APPLY" : "DRY RUN"} (root: ${ROOT})`);
  for (const d of DATA_DIRS) console.log(`  ${d}/  ${byDir[d]} file(s)${byDir[d] ? "" : "  (clean)"}`);
  console.log(`  total: ${targets.length} file(s) to remove (keeping .gitkeep)`);

  if (targets.length === 0) {
    console.log("\nLog is already empty. Nothing to do.");
    return 0;
  }

  // --- Precondition 3: DB lockstep (best-effort) -----------------------------
  // The published log must move in lockstep with the backing DB. If the live API
  // still reports a non-genesis checkpoint, the DB was NOT reset — clearing the
  // log now would desync it from what the cron republishes, breaking the verifier.
  if (apiCheck) {
    const ts = await latestCheckpointTreeSize(apiBase);
    if (ts === null) {
      warn(`could not verify DB state via ${apiBase}/log/checkpoint — proceed only if you know the DB is reset.`);
    } else if (ts > 0) {
      const msg = `the API at ${apiBase} still reports a checkpoint (tree_size=${ts}) — the DB is NOT at genesis. Clearing the log now will desync it.`;
      if (apply && !force) {
        err(`${msg}\n  Reset the backing database first, or pass --force.`);
        return 1;
      }
      warn(msg);
    } else {
      console.log(`✓ DB lockstep OK — API reports genesis (tree_size=${ts}).`);
    }
  }

  // --- Dry run stops here ----------------------------------------------------
  if (!apply) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --yes to clear:\n    node clear-log.mjs --yes");
    return 0;
  }

  // --- Apply -----------------------------------------------------------------
  let removed = 0;
  for (const t of targets) {
    rmSync(t.path, { recursive: true, force: true });
    removed++;
  }
  console.log(`\n✓ removed ${removed} file(s); checkpoints/ ots/ entries/ are back to .gitkeep-only.`);
  console.log("\nNEXT — this only reset your LOCAL copy. Publish it yourself:");
  console.log("    git status                                   # review the deletions");
  console.log('    git add -A && git commit -m "reset transparency log"');
  console.log("    git push");
  console.log("\n⚠ Keep the backing database in lockstep (reset to genesis), or the next");
  console.log("  published checkpoint starts from a non-genesis state and verification will");
  console.log("  mismatch.");
  return 0;
}

// Fetch the latest published checkpoint from the API and dig out its tree_size.
// Returns 0 for "genesis / no checkpoint", a positive number otherwise, or null
// when it can't be determined (network/parse error, no fetch). Never throws.
// `Connection: close` so the socket doesn't linger and block a clean exit.
async function latestCheckpointTreeSize(base) {
  if (typeof fetch !== "function") return null; // Node < 18
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/log/checkpoint`, {
      signal: ctrl.signal,
      headers: { connection: "close" },
    });
    if (res.status === 204 || res.status === 404) return 0; // no checkpoint yet
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return 0;
    const found = findTreeSize(JSON.parse(text));
    return found ?? 0; // valid JSON but no tree_size => treat as genesis
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Recursively find the largest numeric tree_size/treeSize/size in a parsed body.
function findTreeSize(node) {
  let max = null;
  const visit = (v) => {
    if (!v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v)) {
      if (/^(tree_size|treeSize|size)$/.test(k) && typeof val === "number") {
        max = max === null ? val : Math.max(max, val);
      } else if (val && typeof val === "object") {
        visit(val);
      }
    }
  };
  visit(node);
  return max;
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
