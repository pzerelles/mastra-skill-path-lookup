import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from "@mastra/core/storage";
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { weatherWorkflow } from "./workflows/weather-workflow";
import { weatherAgent } from "./agents/weather-agent";
import {
  toolCallAppropriatenessScorer,
  completenessScorer,
  translationScorer,
} from "./scorers/weather-scorer";
import { AzureOpenAIGateway } from "@mastra/core/llm";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";

const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: "../workspace",
  }),
  skills: ["./skills", "./other-skills"],
  tools: { enabled: false },
});

export const mastra = new Mastra({
  gateways: process.env.AZURE_RESOURCE_NAME
    ? {
        "azure-openai": new AzureOpenAIGateway({
          resourceName: process.env.AZURE_RESOURCE_NAME,
          apiKey: process.env.AZURE_API_KEY!,
          apiVersion: "2025-01-01-preview",
          deployments: ["gpt-4.1-mini"],
        }),
      }
    : undefined,
  workspace,
  workflows: { weatherWorkflow },
  agents: { weatherAgent },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
  },
  storage: new MastraCompositeStore({
    id: "composite-storage",
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore("observability"),
    },
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
          new CloudExporter(), // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
