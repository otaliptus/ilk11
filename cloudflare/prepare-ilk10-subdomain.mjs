#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, "out")
const targetDir = path.join(repoRoot, "out-ilk10")

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function copyIfPresent(sourcePath, destinationPath) {
  if (!(await exists(sourcePath))) return
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.cp(sourcePath, destinationPath, { recursive: true })
}

async function main() {
  const ilk10HtmlPath = path.join(outDir, "ilk10.html")
  if (!(await exists(ilk10HtmlPath))) {
    throw new Error(`Missing exported ilk10 page at ${ilk10HtmlPath}. Run "npm run build" first.`)
  }

  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(targetDir, { recursive: true })

  await copyIfPresent(ilk10HtmlPath, path.join(targetDir, "index.html"))
  await copyIfPresent(path.join(outDir, "_next"), path.join(targetDir, "_next"))
  await copyIfPresent(path.join(outDir, "favicon.ico"), path.join(targetDir, "favicon.ico"))
  await copyIfPresent(path.join(outDir, "manifest.json"), path.join(targetDir, "manifest.json"))
  await copyIfPresent(path.join(outDir, "_headers"), path.join(targetDir, "_headers"))
  await copyIfPresent(path.join(outDir, "404.html"), path.join(targetDir, "404.html"))

  console.log(`[cloudflare] prepared ilk10 subdomain bundle at ${targetDir}`)
}

await main()
