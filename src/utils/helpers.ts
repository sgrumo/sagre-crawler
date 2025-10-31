import { FestivalData } from "./models/festival.js";

// Store for tracking seen festivals to avoid duplicates
const seenFestivals = new Set<string>();

/**
 * Parse Italian date format and convert to ISO date string
 * Handles various Italian date formats like:
 * - "31 Ottobre 2025"
 * - "1-2 Novembre 2025"
 * - "31 Ottobre  1-2 Novembre 2025"
 */
export function parseItalianDate(dateStr: string): Date | null {
  const monthMap: Record<string, number> = {
    gennaio: 0,
    febbraio: 1,
    marzo: 2,
    aprile: 3,
    maggio: 4,
    giugno: 5,
    luglio: 6,
    agosto: 7,
    settembre: 8,
    ottobre: 9,
    novembre: 10,
    dicembre: 11,
  };

  const normalized = dateStr.toLowerCase().trim();

  // Try to extract last date mentioned (usually the end date)
  const datePattern = /(\d{1,2})\s+([a-zà-ù]+)\s+(\d{4})/gi;
  const matches = [...normalized.matchAll(datePattern)];

  if (matches.length === 0) {
    return null;
  }

  // Get the last match (usually the end date)
  const lastMatch = matches[matches.length - 1];
  const day = parseInt(lastMatch[1], 10);
  const month = monthMap[lastMatch[2].toLowerCase()];
  const year = parseInt(lastMatch[3], 10);

  if (month === undefined || isNaN(day) || isNaN(year)) {
    return null;
  }

  return new Date(year, month, day);
}

/**
 * Check if a festival's end date has already passed
 */
export function isFestivalPast(festivalData: Partial<FestivalData>): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  // Try to get end date from structured data
  if (festivalData.endDate) {
    const endDate = new Date(festivalData.endDate);
    if (!isNaN(endDate.getTime())) {
      return endDate < today;
    }
  }

  // Try to get start date from structured data
  if (festivalData.startDate) {
    const startDate = new Date(festivalData.startDate);
    if (!isNaN(startDate.getTime())) {
      return startDate < today;
    }
  }

  // Try to parse from dates array (for scraped HTML dates)
  if (festivalData.dates && festivalData.dates.length > 0) {
    for (const dateStr of festivalData.dates) {
      const parsedDate = parseItalianDate(dateStr);
      if (parsedDate && parsedDate >= today) {
        // Found at least one future date
        return false;
      }
    }
    // All parsed dates are in the past
    return true;
  }

  // If we can't determine the date, don't skip it (be conservative)
  return false;
}

/**
 * Generate a normalized key for duplicate detection
 * Uses title (normalized) + location (if available) + approximate dates
 */
export function generateFestivalKey(festivalData: Partial<FestivalData>): string {
  const normalizedTitle = festivalData.title?.toLowerCase().trim() || "";

  // Extract location string
  let locationStr = "";
  if (typeof festivalData.location === "string") {
    locationStr = festivalData.location.toLowerCase().trim();
  } else if (
    festivalData.location &&
    typeof festivalData.location === "object" &&
    "name" in festivalData.location
  ) {
    locationStr = String(festivalData.location.name).toLowerCase().trim();
  }

  // Extract rough date info (month + year)
  let dateKey = "";
  if (festivalData.startDate) {
    const date = new Date(festivalData.startDate);
    if (!isNaN(date.getTime())) {
      dateKey = `${date.getMonth()}-${date.getFullYear()}`;
    }
  } else if (festivalData.dates && festivalData.dates.length > 0) {
    const parsedDate = parseItalianDate(festivalData.dates[0]);
    if (parsedDate) {
      dateKey = `${parsedDate.getMonth()}-${parsedDate.getFullYear()}`;
    }
  }

  return `${normalizedTitle}|${locationStr}|${dateKey}`;
}

/**
 * Check if a festival is a duplicate (already seen)
 */
export function isDuplicate(festivalData: Partial<FestivalData>): boolean {
  const key = generateFestivalKey(festivalData);
  if (seenFestivals.has(key)) {
    return true;
  }
  seenFestivals.add(key);
  return false;
}

/**
 * Clear the duplicate detection cache
 */
export function clearDuplicateCache(): void {
  seenFestivals.clear();
}
