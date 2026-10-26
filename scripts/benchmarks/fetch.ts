/**
 * Download the NHANES files used by the benchmark registry directly from CDC into data/raw/nhanes/.
 * Usage: npm run benchmarks:fetch   (then npm run benchmarks:build)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NHANES_FILES, officialUrls } from "./nhanes-config";

const OUT = path.resolve("data/raw/nhanes");

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const f of NHANES_FILES) {
    let ok = false;
    for (const url of officialUrls(f)) {
      try {
        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) {
          console.warn(`  ${url} -> HTTP ${res.status}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.subarray(0, 80).toString("latin1").startsWith("HEADER RECORD*******LIBRARY HEADER RECORD")) {
          console.warn(`  ${url} -> not an XPORT file (got HTML?)`);
          continue;
        }
        await writeFile(path.join(OUT, `${f.name}.XPT`), buf);
        console.log(`✓ ${f.name} (${buf.length.toLocaleString()} bytes) from ${url}`);
        ok = true;
        break;
      } catch (e) {
        console.warn(`  ${url} -> ${(e as Error).message}`);
      }
    }
    if (!ok) {
      console.error(`✗ Could not download ${f.name}. Download it manually from CDC and place it at ${path.join(OUT, f.name + ".XPT")}.`);
      process.exitCode = 1;
    }
  }
}

main();
