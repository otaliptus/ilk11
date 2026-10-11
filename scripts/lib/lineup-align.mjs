// Shared helpers for backfilling lineup details from external sources
// (Transfermarkt match pages, TFF match pages, ...).

export function norm(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[İıŞşĞğÇçÖöÜü]/g, (character) =>
      ({ "İ": "I", "ı": "i", "Ş": "S", "ş": "s", "Ğ": "G", "ğ": "g", "Ç": "C", "ç": "c", "Ö": "O", "ö": "o", "Ü": "U", "ü": "u" }[character])
    )
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isNameMatch(csvNorm, sourceNorm) {
  if (!csvNorm || !sourceNorm) return false;
  if (csvNorm === sourceNorm) return true;
  // Sources truncate long display names (e.g. "Soylemezgi.")
  if (sourceNorm.length >= 5 && csvNorm.startsWith(sourceNorm)) return true;
  if (csvNorm.length >= 6 && sourceNorm.endsWith(csvNorm)) return true;
  if (csvNorm.length >= 6 && sourceNorm.includes(csvNorm)) return true;
  if (sourceNorm.length >= 6 && csvNorm.includes(sourceNorm)) return true;
  // Sources sometimes keep a leading nickname ("Beto Cacho.", "Jaja Coelho")
  if (csvNorm.length >= 4 && sourceNorm.startsWith(csvNorm)) return true;
  if (csvNorm.length >= 4 && sourceNorm.endsWith(csvNorm)) return true;
  // Short surnames ("CAN", "NAS") against full names ("MÜSLİM CAN")
  if (csvNorm.length >= 3 && sourceNorm.length >= 6 && sourceNorm.endsWith(csvNorm)) return true;
  // Very short name fragments inside long names ("YAW" in "JOACHIN YAW
  // ACHEAMPONG"); the assignment solver resolves collisions.
  if (csvNorm.length >= 3 && sourceNorm.length >= 8 && sourceNorm.includes(csvNorm)) return true;
  // Nicknames embedded in the full name ("RIERA" in "ALBERTO RIERA ORTEGA",
  // "DEDE" in "LEONARDO DE DEUS SANTOS")
  if (csvNorm.length >= 4 && sourceNorm.includes(csvNorm)) return true;
  // Transliteration variants ("KAMBUROGLU" vs "KANBUROGLU", "GINCHEV" vs
  // "GUINTCHEV"): only for long names and tiny edit distance.
  if (csvNorm.length >= 7 && sourceNorm.length >= 7 && editDistance(csvNorm, sourceNorm) <= 2) return true;
  // Same, when the variant sits inside a longer source name
  // ("GINCHEV" inside "GOCHOPETKOV GUINTCHEV").
  if (csvNorm.length >= 7 && sourceNorm.length >= csvNorm.length + 1) {
    let best = Number.POSITIVE_INFINITY;
    for (let length = csvNorm.length; length <= csvNorm.length + 2 && length <= sourceNorm.length; length += 1) {
      for (let start = 0; start + length <= sourceNorm.length; start += 1) {
        const distance = editDistance(csvNorm, sourceNorm.slice(start, start + length));
        if (distance < best) best = distance;
        if (best === 0) break;
      }
    }
    if (best <= 2) return true;
  }
  return false;
}

function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distance = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j += 1) distance[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(distance[i - 1][j] + 1, distance[i][j - 1] + 1, distance[i - 1][j - 1] + cost);
    }
  }
  return distance[rows - 1][cols - 1];
}

// All assignments (capped) of the 11 csv names to the 11 source players.
// `sourcePlayers` items need a `name`; `csvNumbers` is used to pair a single
// leftover slot with a single leftover player when names differ (stale name).
export function alignPlayers(csvNames, sourcePlayers, csvNumbers = []) {
  const csvNorms = csvNames.map(norm);
  const sourceNorms = sourcePlayers.map((player) => norm(player.name));

  const candidateLists = csvNorms.map((csvNorm) =>
    sourceNorms.map((sourceNorm, index) => (isNameMatch(csvNorm, sourceNorm) ? index : -1)).filter((index) => index >= 0)
  );

  const nameMismatch = [];
  const emptyCsvPositions = candidateLists.map((list, index) => (list.length === 0 ? index : -1)).filter((i) => i >= 0);
  const claimedSource = new Set(candidateLists.flat());
  const emptySourcePositions = sourceNorms.map((_, index) => (claimedSource.has(index) ? -1 : index)).filter((i) => i >= 0);

  if (emptyCsvPositions.length === 1 && emptySourcePositions.length === 1) {
    const csvIndex = emptyCsvPositions[0];
    const sourceIndex = emptySourcePositions[0];
    if (csvNumbers[csvIndex] === null || csvNumbers[csvIndex] === sourcePlayers[sourceIndex].number) {
      candidateLists[csvIndex] = [sourceIndex];
      nameMismatch.push({
        csv: csvNames[csvIndex],
        source: sourcePlayers[sourceIndex].name,
        number: sourcePlayers[sourceIndex].number,
      });
    }
  }

  if (candidateLists.some((candidates) => candidates.length === 0)) {
    return { error: "unmatched names", details: csvNames.filter((_, i) => candidateLists[i].length === 0) };
  }

  const used = new Array(sourcePlayers.length).fill(false);
  const assignment = new Array(csvNames.length).fill(-1);
  const solutions = [];
  const maxSolutions = 200;

  function search(position) {
    if (solutions.length >= maxSolutions) return;
    if (position === csvNames.length) {
      solutions.push([...assignment]);
      return;
    }
    for (const sourceIndex of candidateLists[position]) {
      if (used[sourceIndex]) continue;
      used[sourceIndex] = true;
      assignment[position] = sourceIndex;
      search(position + 1);
      used[sourceIndex] = false;
      if (solutions.length >= maxSolutions) return;
    }
  }

  search(0);
  if (solutions.length === 0) return { error: "no assignment" };
  return { solutions, nameMismatch };
}

export function teamMatches(sourceTeam, csvTeam) {
  const a = norm(sourceTeam);
  const b = norm(csvTeam);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // Long shared prefix for city/club prefixes ("Mke Ankaragucu").
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  return common >= 8;
}

export function parseInts(value, length = 11) {
  const parsed = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(";")
        .map((token) => token.trim());
  return Array.from({ length }, (_, index) => {
    const token = parsed[index];
    if (token === undefined || token === null || token === "") return null;
    const number = Number(token);
    return Number.isInteger(number) && number > 0 ? number : null;
  });
}

export function parseFlags(value, length = 11) {
  const parsed = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(";")
        .map((token) => token.trim());
  return Array.from({ length }, (_, index) => (Number(parsed[index]) === 1 ? 1 : 0));
}

export function numbersToString(numbers) {
  return numbers.map((number) => (number === null ? "" : String(number))).join(";");
}

export function flagsToString(flagsList) {
  return flagsList.map((flag) => (flag ? "1" : "0")).join(";");
}

export function hasNumberAnomaly(numbers) {
  const present = numbers.filter((number) => number !== null);
  return numbers.includes(null) || present.length !== new Set(present).size;
}
