const CHARACTER_MAP = {
  Ç: "C",
  ç: "c",
  Ğ: "G",
  ğ: "g",
  İ: "I",
  ı: "i",
  Ö: "O",
  ö: "o",
  Ş: "S",
  ş: "s",
  Ü: "U",
  ü: "u",
  Ø: "O",
  ø: "o",
  Ł: "L",
  ł: "l",
};

export function decodeHtmlEntities(text) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return String(text ?? "").replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity) => {
    if (entity in named) return named[entity];
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return full;
  });
}

export function normalizeSpaces(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCharacters(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((character) => CHARACTER_MAP[character] ?? character)
    .join("");
}

export function normalizeAsciiText(text) {
  return normalizeSpaces(
    normalizeCharacters(decodeHtmlEntities(text)).replace(/[’`´]/g, "'").replace(/[–—]/g, "-")
  );
}

export function normalizeSearchKey(text) {
  return normalizeAsciiText(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function slugify(text) {
  const ascii = normalizeAsciiText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "unknown";
}

export function titleCaseAscii(text) {
  return normalizeAsciiText(text)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function inferNameShape(name) {
  const cleaned = normalizeSpaces(name);
  if (!cleaned) return "unknown";
  if (cleaned.includes(".")) return "abbreviated";
  const tokenCount = cleaned.split(" ").filter(Boolean).length;
  if (tokenCount <= 1) return "single-token";
  return "multi-token";
}

export function buildEntityId(entityType, primaryKey) {
  return `${entityType}:${slugify(primaryKey)}`;
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
