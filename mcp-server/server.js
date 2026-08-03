import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const referenceData = JSON.parse(
  readFileSync(path.join(__dirname, "..", "data", "average-spending.json"), "utf8")
);

const server = new McpServer({
  name: "budget-benchmark",
  version: "1.0.0"
});

server.tool(
  "get_average_spending",
  "Get the average monthly household spending for a given expense category (Hebrew category name, matching the expense tracker's category list), sourced from CBS (הלמ\"ס) survey data where available.",
  { category: z.string().describe("Category name, e.g. מזון") },
  async ({ category }) => {
    const entry = referenceData.categories[category];
    const payload = entry === undefined
      ? { error: `No reference data for category "${category}"`, source: referenceData.source }
      : {
          category,
          monthlyAverage: entry.monthlyAverage,
          basis: entry.basis,
          sourceCategory: entry.sourceCategory,
          currency: referenceData.currency,
          year: referenceData.year,
          source: referenceData.source,
          note: referenceData.note
        };
    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
);

server.tool(
  "list_reference_categories",
  "List all categories with their average monthly spending, each flagged as cbs (directly from official CBS data) or estimated.",
  {},
  async () => {
    const payload = {
      currency: referenceData.currency,
      year: referenceData.year,
      source: referenceData.source,
      note: referenceData.note,
      categories: referenceData.categories
    };
    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
