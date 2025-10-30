// main.ts
import "dotenv/config";
import { CheerioCrawler } from "crawlee";
import { router } from "./routes.js";

const startUrls = [
  "https://www.sagreinromagna.it",
  "https://www.sagreinemilia.it",
  { url: "https://www.assosagre.it/calendario_sagre.php?id_regioni=5", label: "assosagre-list" }, // Emilia-Romagna region
];

const crawler = new CheerioCrawler({
  requestHandler: router,
  maxRequestsPerCrawl: 100, // Adjust based on your needs
  maxConcurrency: 2, // Be respectful to the servers
  maxRequestRetries: 3,
});

await crawler.run(startUrls);
