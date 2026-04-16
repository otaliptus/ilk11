import fs from "node:fs/promises";

export async function readRootGamesCsv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return parseGamesCsv(text);
}

export function parseGamesCsv(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  const header = lines[0].split(",").map((part) => part.trim());
  const fieldIndex = new Map(header.map((name, index) => [name, index]));

  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    const parts = lines[index].split(",");
    rows.push({
      game: parts[fieldIndex.get("game")] ?? "",
      team: parts[fieldIndex.get("team")] ?? "",
      difficulty: parts[fieldIndex.get("difficulty")] ?? "",
      formation: parts[fieldIndex.get("formation")] ?? "",
      lineup: String(parts[fieldIndex.get("lineup")] ?? "")
        .split(";")
        .map((name) => name.trim())
        .filter(Boolean),
      sourceMatchId: String(parts[fieldIndex.get("source_match_id")] ?? "").trim(),
    });
  }

  return { header, rows };
}

export function parseGameYear(gameLabel) {
  const fromTail = String(gameLabel ?? "").match(/(\d{4})\s*$/);
  if (!fromTail) return null;
  const year = Number(fromTail[1]);
  return Number.isInteger(year) ? year : null;
}
