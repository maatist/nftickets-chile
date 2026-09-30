#!/usr/bin/env node
/**
 * Copy the EventTicketing ABI from the Foundry build output into
 * packages/subgraph/abis/EventTicketing.json, in the plain-array form that
 * @graphprotocol/graph-cli expects.
 *
 * Source : packages/contracts/out/EventTicketing.sol/EventTicketing.json
 * Target : packages/subgraph/abis/EventTicketing.json
 *
 * Run: pnpm --filter @nftickets/subgraph run copy-abi
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const source = resolve(
  pkgRoot,
  "../contracts/out/EventTicketing.sol/EventTicketing.json",
);
const targetDir = resolve(pkgRoot, "abis");
const target = resolve(targetDir, "EventTicketing.json");

let raw;
try {
  raw = readFileSync(source, "utf8");
} catch (err) {
  console.error(
    `[subgraph] Could not read Foundry artifact at ${source}.\n` +
      "Build the contracts first: pnpm --filter @nftickets/contracts run build",
  );
  throw err;
}

const artifact = JSON.parse(raw);
const abi = Array.isArray(artifact) ? artifact : artifact.abi;
if (!Array.isArray(abi)) {
  throw new Error(
    `[subgraph] No "abi" array found in ${source}. Got keys: ${Object.keys(artifact).join(", ")}`,
  );
}

mkdirSync(targetDir, { recursive: true });
writeFileSync(target, `${JSON.stringify(abi, null, 2)}\n`, "utf8");
console.log(`[subgraph] Wrote ${abi.length} ABI entries to ${target}`);
