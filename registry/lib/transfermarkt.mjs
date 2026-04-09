import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { setTimeout as sleep } from "node:timers/promises";
import { decodeHtmlEntities, normalizeAsciiText, normalizeSpaces, titleCaseAscii } from "./normalize.mjs";

const BASE_URL = "https://www.transfermarkt.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 20000;

function parsePlayerIdFromHref(rawHref) {
  const href = String(rawHref ?? "");
  const match = href.match(/\/spieler\/(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function slugToFullName(rawHref) {
  const href = String(rawHref ?? "");
  const slugMatch = href.match(/^\/([^/]+)\/profil\/spieler\/\d+/i);
  if (!slugMatch) return null;

  const decoded = decodeURIComponent(slugMatch[1]).replace(/-\d+$/, "");
  const fullName = titleCaseAscii(decoded.replace(/-/g, " "));
  return fullName || null;
}

function parsePercentFromStyle(style, property) {
  const regex = new RegExp(`${property}\\s*:\\s*([0-9.]+)%`, "i");
  const match = String(style ?? "").match(regex);
  if (!match) return NaN;
  return Number(match[1]);
}

function extractPlayerTrailingMarkup(matchHtml, matchEnd) {
  const boundaries = [
    matchHtml.indexOf('<div class="formation-player-container"', matchEnd),
    matchHtml.indexOf('<div class="small-5 columns', matchEnd),
    matchHtml.indexOf('<div class="large-7 columns small-12 aufstellung-vereinsseite', matchEnd),
  ].filter((index) => index >= 0);

  if (boundaries.length === 0) {
    return matchHtml.slice(matchEnd, Math.min(matchHtml.length, matchEnd + 1200));
  }

  const end = Math.min(...boundaries);
  return matchHtml.slice(matchEnd, end);
}

function parseCaptainFlagFromMarkup(markup) {
  return /kapitaenicon-formation/i.test(String(markup ?? ""));
}

function extractFormationPlayers(matchHtml) {
  const players = [];
  const regex =
    /<div class="formation-player-container" style="([^"]*)">([\s\S]*?)<span class="formation-number-name">\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;

  for (const match of matchHtml.matchAll(regex)) {
    const style = match[1] ?? "";
    const top = parsePercentFromStyle(style, "top");
    const left = parsePercentFromStyle(style, "left");
    if (!Number.isFinite(top) || !Number.isFinite(left)) continue;

    const href = match[3] ?? "";
    const displayName = titleCaseAscii(match[4]);
    const fullName = slugToFullName(href) ?? displayName;
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;

    players.push({
      top,
      left,
      playerId: parsePlayerIdFromHref(href),
      displayName,
      fullName,
      isCaptain: parseCaptainFlagFromMarkup(extractPlayerTrailingMarkup(matchHtml, matchEnd)),
    });
  }

  return players;
}

function extractTeams(matchHtml) {
  return [
    ...matchHtml.matchAll(
      /unterueberschrift\s+aufstellung-unterueberschrift-mannschaft[\s\S]*?class="sb-vereinslink"[^>]*>([^<]+)<\/a>/g
    ),
  ]
    .map((entry) => titleCaseAscii(entry[1]))
    .filter(Boolean)
    .slice(0, 2);
}

function parseDate(matchHtml) {
  const dateMatch = matchHtml.match(/<title>[^<]*,\s*(\d{2})\/(\d{2})\/(\d{4})\s*-/i);
  if (!dateMatch) return null;
  const [, dayRaw, monthRaw, yearRaw] = dateMatch;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  return { year, month, day };
}

export function parseMatchStarters(matchHtml, sourceMatchId) {
  const teams = extractTeams(matchHtml);
  const players = extractFormationPlayers(matchHtml);
  const date = parseDate(matchHtml);

  if (teams.length < 2) {
    throw new Error(`match ${sourceMatchId}: could not parse both teams`);
  }
  if (players.length < 22) {
    throw new Error(`match ${sourceMatchId}: expected at least 22 starters, got ${players.length}`);
  }

  const starters = players.slice(0, 22);
  const home = starters.slice(0, 11).map((entry) => ({ ...entry, team: teams[0] }));
  const away = starters.slice(11, 22).map((entry) => ({ ...entry, team: teams[1] }));

  return {
    sourceMatchId,
    date,
    teams,
    players: [...home, ...away],
  };
}

async function fetchHtml(url, retries = 2) {
  async function requestText(currentUrl, redirects = 5) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(currentUrl);
      const client = parsed.protocol === "http:" ? http : https;
      let settled = false;

      function finishWithError(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }

      function finishWithValue(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      const req = client.get(
        parsed,
        {
          headers: {
            "accept-language": "en-US,en;q=0.9",
            "user-agent": DEFAULT_USER_AGENT,
          },
        },
        (res) => {
          const statusCode = res.statusCode ?? 0;
          const location = res.headers.location;

          if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
            res.resume();
            if (redirects <= 0) {
              finishWithError(new Error(`Too many redirects for ${currentUrl}`));
              return;
            }
            const nextUrl = new URL(location, parsed).toString();
            requestText(nextUrl, redirects - 1).then(finishWithValue).catch(finishWithError);
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf8").slice(0, 400);
              finishWithError(new Error(`HTTP ${statusCode} for ${currentUrl}: ${body}`));
            });
            return;
          }

          res.setEncoding("utf8");
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => finishWithValue(body));
        }
      );

      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`Request timeout for ${currentUrl}`)));
      req.on("error", finishWithError);
    });
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestText(url);
    } catch (error) {
      if (attempt >= retries) throw error;
      await sleep(250 * (attempt + 1));
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

export async function fetchTransfermarktMatchHtml(sourceMatchId, cacheDir = null) {
  const matchId = String(sourceMatchId ?? "").trim();
  if (!matchId) {
    throw new Error("Missing source match id");
  }

  const cachePath = cacheDir ? path.join(cacheDir, `${matchId}.html`) : null;
  if (cachePath) {
    try {
      return await fs.readFile(cachePath, "utf8");
    } catch {
      // cache miss
    }
  }

  const html = await fetchHtml(`${BASE_URL}/spielbericht/index/spielbericht/${matchId}`);
  if (cachePath) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, html, "utf8");
  }
  return html;
}

export function compactDisplayName(name) {
  return titleCaseAscii(normalizeSpaces(String(name ?? "")));
}
