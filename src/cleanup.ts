// cleanup.ts
// Script to remove past food festivals from Strapi
import "dotenv/config";

interface StrapiFestival {
  id: number;
  documentId: string;
  title: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

interface StrapiListResponse {
  data: StrapiFestival[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

interface CleanupConfig {
  strapiUrl: string;
  strapiToken?: string;
  dryRun?: boolean;
}

interface CleanupResult {
  total: number;
  deleted: number;
  failed: number;
  festivals: Array<{
    id: number;
    documentId: string;
    title: string;
    endDate?: string;
    status: "deleted" | "failed" | "skipped";
  }>;
}

/**
 * Fetch all festivals from Strapi with pagination
 */
async function fetchAllFestivals(
  strapiUrl: string,
  strapiToken?: string,
): Promise<StrapiFestival[]> {
  const allFestivals: StrapiFestival[] = [];
  let page = 1;
  let hasMore = true;

  // Extract base URL (remove /festivals from the end if present)
  const baseUrl = strapiUrl.replace(/\/festivals\/?$/, "");

  while (hasMore) {
    try {
      const url = `${baseUrl}/festivals?pagination[page]=${page}&pagination[pageSize]=100`;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (strapiToken) {
        headers["Authorization"] = `Bearer ${strapiToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as StrapiListResponse;
      allFestivals.push(...data.data);

      hasMore = page < data.meta.pagination.pageCount;
      page++;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      throw error;
    }
  }

  return allFestivals;
}

/**
 * Check if a festival is in the past
 */
function isPastFestival(festival: StrapiFestival): boolean {
  if (!festival.endDate) {
    // If no end date, use start date as fallback
    if (!festival.startDate) {
      return false; // Can't determine, keep it
    }
    const startDate = new Date(festival.startDate);
    return startDate < new Date();
  }

  const endDate = new Date(festival.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day

  return endDate < today;
}

/**
 * Delete a festival from Strapi
 */
async function deleteFestival(
  documentId: string,
  strapiUrl: string,
  strapiToken?: string,
): Promise<boolean> {
  try {
    // Extract base URL (remove /festivals from the end if present)
    const baseUrl = strapiUrl.replace(/\/festivals\/?$/, "");
    const url = `${baseUrl}/festivals/${documentId}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (strapiToken) {
      headers["Authorization"] = `Bearer ${strapiToken}`;
    }

    const response = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to delete festival ${documentId} (${response.status}): ${errorText}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error deleting festival ${documentId}:`, error);
    return false;
  }
}

/**
 * Main cleanup function
 */
export async function cleanupPastFestivals(
  config: CleanupConfig,
): Promise<CleanupResult> {
  console.log("🧹 Starting cleanup of past festivals...\n");

  if (config.dryRun) {
    console.log("⚠️  DRY RUN MODE - No festivals will be deleted\n");
  }

  const result: CleanupResult = {
    total: 0,
    deleted: 0,
    failed: 0,
    festivals: [],
  };

  try {
    // Fetch all festivals
    console.log("📥 Fetching festivals from Strapi...");
    const allFestivals = await fetchAllFestivals(
      config.strapiUrl,
      config.strapiToken,
    );
    console.log(`✓ Found ${allFestivals.length} total festivals\n`);

    // Filter past festivals
    const pastFestivals = allFestivals.filter(isPastFestival);
    result.total = pastFestivals.length;

    console.log(`🗑️  Found ${pastFestivals.length} past festivals to remove\n`);

    if (pastFestivals.length === 0) {
      console.log("✨ No past festivals to clean up!");
      return result;
    }

    // Delete past festivals
    for (const festival of pastFestivals) {
      const festivalInfo = {
        id: festival.id,
        documentId: festival.documentId,
        title: festival.title,
        endDate: festival.endDate,
        status: "skipped" as "deleted" | "failed" | "skipped",
      };

      if (config.dryRun) {
        console.log(
          `[DRY RUN] Would delete: ${festival.title} (ended: ${festival.endDate || festival.startDate || "unknown"})`,
        );
        festivalInfo.status = "skipped";
      } else {
        const success = await deleteFestival(
          festival.documentId,
          config.strapiUrl,
          config.strapiToken,
        );

        if (success) {
          console.log(
            `✓ Deleted: ${festival.title} (ended: ${festival.endDate || festival.startDate || "unknown"})`,
          );
          result.deleted++;
          festivalInfo.status = "deleted";
        } else {
          console.log(`✗ Failed to delete: ${festival.title}`);
          result.failed++;
          festivalInfo.status = "failed";
        }
      }

      result.festivals.push(festivalInfo);
    }

    // Print summary
    console.log("\n📊 Cleanup Summary:");
    console.log(`   Total past festivals: ${result.total}`);
    if (!config.dryRun) {
      console.log(`   Successfully deleted: ${result.deleted}`);
      console.log(`   Failed to delete: ${result.failed}`);
    } else {
      console.log(`   Would delete: ${result.total}`);
    }
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    throw error;
  }

  return result;
}

/**
 * CLI entry point
 */
async function main() {
  const strapiUrl = process.env.STRAPI_URL;
  const strapiToken = process.env.STRAPI_TOKEN;
  const dryRun = process.argv.includes("--dry-run");

  if (!strapiUrl) {
    console.error(
      "❌ Error: STRAPI_URL environment variable is required\n" +
        "Please set it in your .env file or environment",
    );
    process.exit(1);
  }

  try {
    await cleanupPastFestivals({
      strapiUrl,
      strapiToken,
      dryRun,
    });

    console.log("\n✨ Cleanup completed successfully!");
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
