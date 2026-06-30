import { NextResponse } from "next/server";

type CouncilModel = "Kimi" | "Mistral" | "OpenAI" | "Grok" | "DeepSeek";
type RequestMode = "member" | "synthesizer" | "discussion";

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

const languageNames: Record<string, string> = {
  en: "English",
  hinglish: "Hinglish with Hindi words in Devanagari script and English words in Latin script, like 'Radha Radha बरसाने वाली Radha'",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  bn: "Bengali",
  gu: "Gujarati",
  pa: "Punjabi",
};

languageNames.hinglish =
  "Hinglish with Hindi words in Devanagari script and English words in Latin script, like Radha Radha बरसाने वाली Radha";

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

function buildMessages(mode: RequestMode, message: string, language: string) {
  const languageInstruction = `Reply only in ${language}. If the language is Hinglish, never romanize Hindi words; write Hindi words in Devanagari and keep only English words in Latin script.`;

  if (mode === "synthesizer") {
    return [
      {
        role: "system",
        content:
          `You are the AI Council chair. Give a short, simple, accurate final answer. Use easy words a normal user can understand. Avoid bookish or complex wording. If uncertain, say so directly. ${languageInstruction}`,
      },
      { role: "user", content: message },
    ];
  }

  if (mode === "discussion") {
    return [
      {
        role: "system",
        content:
          `Write a natural AI council discussion between five male members: Kimi, Mistral, OpenAI, Grok, and DeepSeek. OpenAI is the president who manages turns. Return exactly 10 lines. Format each line exactly as Model | type: opinion/agree/disagree/question/final | say: spoken sentence | show: public bubble text. Keep model names in English in the prefix only. Every model must give an independent opinion first, then later agree or disagree with a reason. If any model has not agreed or disagreed yet, OpenAI must directly ask that model, like "Mistral, what do you say?" or "DeepSeek, do you agree or not?" Members should explain why an answer is good, why they agree, or why they do not agree. The final two lines must state whether the council mostly agrees or disagrees, and why. No court, judge, verdict, case, or legal language. Use easy words, no bookish language. The show text should be clean and short for the bubble. Keep each say and show under 16 words. No markdown. ${languageInstruction}`,
      },
      { role: "user", content: message },
    ];
  }

  return [
    {
      role: "system",
      content:
        `You are one male member of AI Council. Answer short, simple, and accurate. Give your own useful opinion in easy words. Avoid bookish or complex wording. If uncertain, say so directly. ${languageInstruction}`,
    },
    { role: "user", content: message },
  ];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    mode?: unknown;
    model?: unknown;
    language?: unknown;
  } | null;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const language =
    typeof body?.language === "string" && languageNames[body.language]
      ? languageNames[body.language]
      : "English";
  const mode: RequestMode =
    body?.mode === "synthesizer"
      ? "synthesizer"
      : body?.mode === "discussion"
        ? "discussion"
        : "member";

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
    messages: buildMessages(mode, message, language),
    ...(isAzureOpenAI ? {} : { model: deployment }),
    temperature: mode === "synthesizer" ? 0.35 : mode === "discussion" ? 0.8 : 0.7,
    max_tokens: mode === "synthesizer" ? 260 : mode === "discussion" ? 420 : 180,
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
