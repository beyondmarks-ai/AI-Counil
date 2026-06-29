import { NextResponse } from "next/server";

type CouncilModel = "Kimi" | "Mistral" | "OpenAI" | "Grok" | "DeepSeek";
type RequestMode = "member" | "synthesizer";

type AzureChatChoice = {
  message?: {
    content?: string;
  };
};

type AzureChatResponse = {
  choices?: AzureChatChoice[];
  error?: {
    message?: string;
  };
};

const modelEnvKeys: Record<CouncilModel, string> = {
  Kimi: "KIMI",
  Mistral: "MISTRAL",
  OpenAI: "OPENAI",
  Grok: "GROK",
  DeepSeek: "DEEPSEEK",
};

const fallbackDeployments: Record<CouncilModel, string> = {
  Kimi: "Kimi-K2.5",
  Mistral: "Mistral-Large-3",
  OpenAI: "gpt-4o",
  Grok: "grok-4-20-non-reasoning",
  DeepSeek: "DeepSeek-V4-Flash",
};

function isCouncilModel(value: unknown): value is CouncilModel {
  return (
    value === "Kimi" ||
    value === "Mistral" ||
    value === "OpenAI" ||
    value === "Grok" ||
    value === "DeepSeek"
  );
}

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function buildChatUrl(endpoint: string, deployment: string, apiVersion: string) {
  const url = new URL(endpoint);
  const pathname = url.pathname.replace(/\/+$/, "");
  const isAzureOpenAI = url.hostname.endsWith(".openai.azure.com");

  if (isAzureOpenAI) {
    url.pathname = `${pathname}/openai/deployments/${deployment}/chat/completions`;
  } else if (!pathname.endsWith("/chat/completions")) {
    url.pathname = pathname.endsWith("/models")
      ? `${pathname}/chat/completions`
      : `${pathname}/models/chat/completions`;
  }

  if (!url.searchParams.has("api-version")) {
    url.searchParams.set("api-version", apiVersion);
  }

  return { isAzureOpenAI, url };
}

function getModelConfig(model: CouncilModel) {
  const envKey = modelEnvKeys[model];
  const endpoint =
    getEnv(`AZURE_AI_FOUNDRY_${envKey}_ENDPOINT`) ||
    getEnv("AZURE_AI_FOUNDRY_ENDPOINT");
  const apiKey =
    getEnv(`AZURE_AI_FOUNDRY_${envKey}_API_KEY`) ||
    getEnv("AZURE_AI_FOUNDRY_API_KEY");
  const deployment =
    getEnv(`AZURE_AI_FOUNDRY_${envKey}_DEPLOYMENT`) ||
    getEnv(`AZURE_AI_FOUNDRY_${envKey}_MODEL`) ||
    fallbackDeployments[model];
  const apiVersion =
    getEnv(`AZURE_AI_FOUNDRY_${envKey}_API_VERSION`) ||
    getEnv("AZURE_AI_FOUNDRY_API_VERSION") ||
    "2024-05-01-preview";

  return { apiKey, apiVersion, deployment, endpoint };
}

function buildMessages(mode: RequestMode, message: string) {
  if (mode === "synthesizer") {
    return [
      {
        role: "system",
        content:
          "You are the AI Council chair. Read the council member responses and produce one short, professional final answer. Resolve contradictions, avoid repetition, and answer the user's original query directly.",
      },
      { role: "user", content: message },
    ];
  }

  return [
    {
      role: "system",
      content:
        "You are one member of AI Council. Answer clearly and concisely. Give your own useful perspective without mentioning implementation details.",
    },
    { role: "user", content: message },
  ];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    mode?: unknown;
    model?: unknown;
  } | null;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const mode: RequestMode = body?.mode === "synthesizer" ? "synthesizer" : "member";

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (!isCouncilModel(body?.model)) {
    return NextResponse.json({ error: "Unknown model selected." }, { status: 400 });
  }

  const { apiKey, apiVersion, deployment, endpoint } = getModelConfig(body.model);

  if (!endpoint || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Azure AI Foundry endpoint or API key is missing. Add the required values to .env.",
      },
      { status: 500 },
    );
  }

  const { isAzureOpenAI, url } = buildChatUrl(endpoint, deployment, apiVersion);
  const requestBody = {
    messages: buildMessages(mode, message),
    ...(isAzureOpenAI ? {} : { model: deployment }),
    temperature: mode === "synthesizer" ? 0.35 : 0.7,
    max_tokens: mode === "synthesizer" ? 900 : 700,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json().catch(() => null)) as
    | AzureChatResponse
    | null;

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          payload?.error?.message ||
          `Azure AI request failed with status ${response.status}.`,
      },
      { status: response.status },
    );
  }

  return NextResponse.json({
    answer: payload?.choices?.[0]?.message?.content || "",
  });
}
