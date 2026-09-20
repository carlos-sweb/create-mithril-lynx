// src/fontsource.js
//
// Local search over Fontsource's font catalog (https://fontsource.org). The
// public API (https://api.fontsource.org/v1/fonts) has no free-text search —
// only exact `id`/`family` filters (confirmed against its own docs) — so
// this fetches the whole list once (~2100 fonts, ~540KB as of 2026-09) and
// filters client-side. Cached to disk (24h TTL) so repeated searches in one
// session, or across nearby `npx`/`bunx` invocations, don't re-download it
// every time.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FONTS_LIST_URL = "https://api.fontsource.org/v1/fonts";
const FONT_DETAIL_URL = (id) => `https://api.fontsource.org/v1/fonts/${id}`;
const CACHE_PATH = path.join(os.tmpdir(), "create-mithril-lynx-fontsource-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Promise<Array<{id: string, family: string, category: string,
 *   variable: boolean, license: string, weights: number[], styles: string[]}>>}
 */
export async function fetchFontList({ forceRefresh = false } = {}) {
	if (!forceRefresh) {
		try {
			const stat = fs.statSync(CACHE_PATH);
			if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
				return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
			}
		} catch {
			// No cache yet, or unreadable — fetch fresh below.
		}
	}

	const response = await fetch(FONTS_LIST_URL);
	if (!response.ok) {
		throw new Error(`Fontsource API returned ${response.status} fetching the font list.`);
	}
	const list = await response.json();

	try {
		fs.writeFileSync(CACHE_PATH, JSON.stringify(list));
	} catch {
		// Best-effort — a failed cache write just means the next call re-fetches.
	}

	return list;
}

/**
 * Case-insensitive substring match on `family` (primarily) and `id`.
 * Exact matches sort first, then alphabetically by family.
 */
export function searchFonts(list, query) {
	const q = query.trim().toLowerCase();
	if (q === "") return [];

	const matches = list.filter(
		(font) => font.family.toLowerCase().includes(q) || font.id.toLowerCase().includes(q),
	);

	return matches.sort((a, b) => {
		const aExact = a.family.toLowerCase() === q ? 0 : 1;
		const bExact = b.family.toLowerCase() === q ? 0 : 1;
		if (aExact !== bExact) return aExact - bExact;
		return a.family.localeCompare(b.family);
	});
}

/**
 * Full detail for one font — includes `variants[weight][style][subset]`,
 * each holding `{ url: { woff2, woff, ttf } }`. Confirmed against Fontsource's
 * own docs (https://fontsource.org/docs/api/font-id) and a real fetch.
 */
export async function fetchFontDetail(id) {
	const response = await fetch(FONT_DETAIL_URL(id));
	if (!response.ok) {
		throw new Error(`Fontsource API returned ${response.status} fetching "${id}".`);
	}
	return response.json();
}

/** Flattens a font's `variants` object into a flat, pickable list. */
export function listVariants(detail) {
	const out = [];
	for (const [weight, byStyle] of Object.entries(detail.variants ?? {})) {
		for (const [style, bySubset] of Object.entries(byStyle)) {
			for (const [subset, files] of Object.entries(bySubset)) {
				if (files?.url?.ttf) {
					out.push({ weight: Number(weight), style, subset, url: files.url.ttf });
				}
			}
		}
	}
	// Latin first (most common default), then by weight, then style.
	return out.sort((a, b) => {
		if (a.subset !== b.subset) return a.subset === "latin" ? -1 : b.subset === "latin" ? 1 : a.subset.localeCompare(b.subset);
		if (a.weight !== b.weight) return a.weight - b.weight;
		return a.style.localeCompare(b.style);
	});
}
