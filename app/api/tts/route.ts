import { NextResponse } from "next/server";

type SarvamTtsResponse = {
  audios?: string[];
  error?: {
    message?: string;
  };
};

const modelEnvKeys: Record<string, string> = {
  Kimi: "KIMI",
  Mistral: "MISTRAL",
  OpenAI: "OPENAI",
  Grok: "GROK",
  DeepSeek: "DEEPSEEK",
};

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    languageCode?: unknown;
    model?: unknown;
    text?: unknown;
  } | null;

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const model = typeof body?.model === "string" ? body.model : "";
  const envKey = modelEnvKeys[model];
  const apiKey = getEnv("SARVAM_API_KEY");
  const languageCode =
    typeof body?.languageCode === "string" && body.languageCode.trim()
      ? body.languageCode.trim()
      : getEnv("SARVAM_TTS_LANGUAGE_CODE") || "en-IN";

  if (!text || !envKey) {
    return NextResponse.json({ error: "Text and model are required." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "SARVAM_API_KEY is missing." }, { status: 500 });
  }

  const speaker = (
    getEnv(`SARVAM_TTS_${envKey}_VOICE`) ||
    getEnv("SARVAM_TTS_VOICE") ||
    "shubh"
  ).toLowerCase();
  const outputCodec = getEnv("SARVAM_TTS_OUTPUT_AUDIO_CODEC") || "wav";

  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      target_language_code: languageCode,
      model: getEnv("SARVAM_TTS_MODEL") || "bulbul:v3",
      speaker,
      pace: Number(getEnv("SARVAM_TTS_PACE") || 1),
      output_audio_codec: outputCodec,
    }),
  });

  const payload = (await response.json().catch(() => null)) as SarvamTtsResponse | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: payload?.error?.message || `Sarvam TTS failed with status ${response.status}.` },
      { status: response.status },
    );
  }

  return NextResponse.json({
    audio: payload?.audios?.join("") || "",
    codec: outputCodec,
  });
}
