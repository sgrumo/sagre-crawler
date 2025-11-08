// main.ts
import "dotenv/config";
import { CheerioCrawler, createCheerioRouter, Dataset } from "crawlee";
import { romagnaEmiliaRouter } from "./websites/romagna-emilia/routes.js";
import { assosasgreRouter } from "./websites/assosagre/routes.js";
import { viviromagnaRouter } from "./websites/viviromagna/routes.js";

// Combine all routers into a single router for the crawler
const mainRouter = createCheerioRouter();

// Add all routes from each website router
mainRouter.addHandler(
  "romagna-emilia-festival-detail",
  romagnaEmiliaRouter.getHandler("romagna-emilia-festival-detail")!,
);
mainRouter.addHandler(
  "romagna-emilia-list-page",
  romagnaEmiliaRouter.getHandler("romagna-emilia-list-page")!,
);
mainRouter.addDefaultHandler(romagnaEmiliaRouter.getHandler("default")!);

mainRouter.addHandler(
  "assosagre-detail",
  assosasgreRouter.getHandler("assosagre-detail")!,
);
mainRouter.addHandler(
  "assosagre-list",
  assosasgreRouter.getHandler("assosagre-list")!,
);

mainRouter.addHandler(
  "viviromagna-detail",
  viviromagnaRouter.getHandler("viviromagna-detail")!,
);
mainRouter.addHandler(
  "viviromagna-list",
  viviromagnaRouter.getHandler("viviromagna-list")!,
);

const startUrls = [
  //  "https://www.sagreinromagna.it",
  //  "https://www.sagreinemilia.it",
  //  {
  //    url: "https://www.assosagre.it/calendario_sagre.php?id_regioni=5",
  //    label: "assosagre-list",
  //  }, // Emilia-Romagna region
  { url: "https://www.viviromagna.it/eventi-sagre", label: "viviromagna-list" }, // Viviromagna events
];

const crawler = new CheerioCrawler({
  requestHandler: mainRouter,
  maxRequestsPerCrawl: 100, // Adjust based on your needs
  maxConcurrency: 2, // Be respectful to the servers
  maxRequestRetries: 3,
});

await crawler.run(startUrls);
