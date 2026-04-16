#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, "out")
const targetDir = path.join(repoRoot, "out-ilk11")

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!(await exists(outDir))) {
    throw new Error(`Missing "${outDir}". Run "npm run build" first.`)
  }

  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.cp(outDir, targetDir, { recursive: true })

  // Preserve the legacy subdomain behaviour: ilk11.otaliptus.com/ should land
  // on the ilk11 game, not the new landing page.
  const redirectsPath = path.join(targetDir, "_redirects")
  const existing = (await exists(redirectsPath)) ? await fs.readFile(redirectsPath, "utf8") : ""
  const header = "# Added by cloudflare/prepare-ilk11-subdomain.mjs\n/  /ilk11  301\n"
  await fs.writeFile(redirectsPath, header + existing, "utf8")

  console.log(`[cloudflare] prepared ilk11 subdomain bundle at ${targetDir}`)
}

await main()
