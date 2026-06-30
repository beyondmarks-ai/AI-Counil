"use client";

import { useRef, useState, type CSSProperties, type FormEvent } from "react";

const hotspots = [
  { name: "Kimi", x: 13.5, y: 46.4, size: 8.2 },
  { name: "Mistral", x: 29.4, y: 42.8, size: 8.2 },
  { name: "OpenAI", x: 50.1, y: 40.3, size: 8.2 },
  { name: "Grok", x: 72.1, y: 41.9, size: 8.2 },
  { name: "DeepSeek", x: 87.4, y: 46.6, size: 8.2 },
];

const modelOptions = ["All", ...hotspots.map((hotspot) => hotspot.name)];
const languageOptions = [
  { code: "en", label: "English", sarvamCode: "en-IN" },
  { code: "hinglish", label: "Hinglish", sarvamCode: "hi-IN" },
  { code: "hi", label: "Hindi", sarvamCode: "hi-IN" },
  { code: "ta", label: "Tamil", sarvamCode: "ta-IN" },
  { code: "te", label: "Telugu", sarvamCode: "te-IN" },
  { code: "kn", label: "Kannada", sarvamCode: "kn-IN" },
  { code: "ml", label: "Malayalam", sarvamCode: "ml-IN" },
  { code: "mr", label: "Marathi", sarvamCode: "mr-IN" },
  { code: "bn", label: "Bengali", sarvamCode: "bn-IN" },
  { code: "gu", label: "Gujarati", sarvamCode: "gu-IN" },
  { code: "pa", label: "Punjabi", sarvamCode: "pa-IN" },
];

type BubbleStatus = "loading" | "done" | "error";

type BubbleState = {
  progress: number;
  status: BubbleStatus;
  text: string;
  type?: DiscussionLineType;
};

type BubbleMap = Record<string, BubbleState>;

type CouncilMessage = {
  model: string;
  status: Exclude<BubbleStatus, "loading">;
  text: string;
};

type CouncilStatus = "idle" | "running" | "synthesizing" | "complete" | "error";
type DiscussionStatus = "idle" | "preparing" | "playing" | "paused";
type DiscussionLineType =
  | "opinion"
  | "opening"
  | "argument"
  | "objection"
  | "rebuttal"
  | "question"
  | "final"
  | "verdict"
  | "main"
  | "interject"
  | "agree"
  | "disagree";

type DiscussionLine = {
  type: DiscussionLineType;
  model: string;
  displayText: string;
  text: string;
};

function clampProgress(progress: number) {
  return Math.min(95, Math.max(5, progress));
}

function getDiscussionLabel(type?: DiscussionLineType) {
  if (!type) {
    return "";
  }

  const labels: Record<DiscussionLineType, string> = {
    agree: "Agree",
    argument: "Argument",
    disagree: "Disagree",
    final: "Final View",
    interject: "Opinion",
    main: "Opinion",
    objection: "Disagree",
    opening: "Opinion",
    opinion: "Opinion",
    question: "Question",
    rebuttal: "Disagree",
    verdict: "Final View",
  };

  return labels[type];
}

function isInterruptingType(type: DiscussionLineType) {
  return (
    type === "objection" ||
    type === "rebuttal" ||
    type === "interject" ||
    type === "disagree" ||
    type === "question"
  );
}

function isHandoffOnly(text: string) {
  const normalized = text.toLowerCase();

  return (
    /\b(your turn|you continue|you speak|you finish|i pass|i will continue later)\b/.test(
      normalized,
    ) &&
    !/\b(because|but|my view|i think|i feel|i suggest|i object|i disagree|what is your opinion|what do you think|your opinion|said this)\b/.test(
      normalized,
    )
  );
}

export default function Home() {
  const [welcomeState, setWelcomeState] = useState<
    "visible" | "opening" | "hidden"
  >("visible");
  const [promptValue, setPromptValue] = useState("");
  const [selectedModel, setSelectedModel] = useState("OpenAI");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [bubbles, setBubbles] = useState<BubbleMap>({});
  const [isCouncilResultOpen, setIsCouncilResultOpen] = useState(false);
  const [councilMessages, setCouncilMessages] = useState<CouncilMessage[]>([]);
  const [councilStatus, setCouncilStatus] = useState<CouncilStatus>("idle");
  const [finalAnswer, setFinalAnswer] = useState("");
  const [speakingModel, setSpeakingModel] = useState("");
  const [interruptingModel, setInterruptingModel] = useState("");
  const [discussionStatus, setDiscussionStatus] = useState<DiscussionStatus>("idle");
  const runIdRef = useRef(0);
  const progressTimersRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const overlapAudioRef = useRef<HTMLAudioElement | null>(null);
  const discussionLinesRef = useRef<DiscussionLine[]>([]);
  const discussionIndexRef = useRef(0);
  const discussionRunIdRef = useRef(0);
  const discussionTimerRef = useRef<number | null>(null);

  function stopProgressTimers() {
    progressTimersRef.current.forEach((timer) => window.clearInterval(timer));
    progressTimersRef.current = [];
  }

  function stopDiscussion() {
    if (discussionTimerRef.current !== null) {
      window.clearTimeout(discussionTimerRef.current);
      discussionTimerRef.current = null;
    }
    discussionRunIdRef.current += 1;
    discussionLinesRef.current = [];
    discussionIndexRef.current = 0;
    audioRef.current?.pause();
    overlapAudioRef.current?.pause();
    audioRef.current = null;
    overlapAudioRef.current = null;
    setSpeakingModel("");
    setInterruptingModel("");
    setDiscussionStatus("idle");
  }

  function resetCouncil() {
    stopProgressTimers();
    stopDiscussion();
    setBubbles({});
    setCouncilMessages([]);
    setCouncilStatus("idle");
    setFinalAnswer("");
    setIsCouncilResultOpen(false);
  }

  function handleHotspotClick(modelName: string) {
    setSelectedModel(modelName);
    const response = bubbles[modelName];

    if (response?.status === "done" && response.text) {
      stopDiscussion();
      void speakModelResponse(modelName, response.text);
      return;
    }

    const prompt = promptValue.trim();

    if (prompt) {
      void runModels([modelName], prompt, true);
      return;
    }

    resetCouncil();
  }

  function handleEnter() {
    setWelcomeState("opening");
    window.setTimeout(() => setWelcomeState("hidden"), 950);
  }

  function startProgress(model: string, runId: number) {
    const timer = window.setInterval(() => {
      if (runIdRef.current !== runId) {
        window.clearInterval(timer);
        return;
      }

      setBubbles((current) => {
        const bubble = current[model];

        if (!bubble || bubble.status !== "loading") {
          return current;
        }

        return {
          ...current,
          [model]: {
            ...bubble,
            progress: clampProgress(bubble.progress + Math.ceil(Math.random() * 7)),
          },
        };
      });
    }, 650);

    progressTimersRef.current.push(timer);
  }

  function getSarvamLanguageCode() {
    return (
      languageOptions.find((language) => language.code === selectedLanguage)?.sarvamCode ||
      "en-IN"
    );
  }

  async function askModel(model: string, message: string, runId: number) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, model, mode: "member", language: selectedLanguage }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "The selected model did not respond.");
      }

      const text = payload.answer?.trim() || "No response.";

      if (runIdRef.current !== runId) {
        return { model, status: "error" as const, text: "Ignored stale response." };
      }

      setBubbles((current) => ({
        ...current,
        [model]: { progress: 100, status: "done", text },
      }));
      setCouncilMessages((current) => [...current, { model, status: "done", text }]);

      return { model, status: "done" as const, text };
    } catch (error) {
      const text = error instanceof Error ? error.message : "The model request failed.";

      if (runIdRef.current !== runId) {
        return { model, status: "error" as const, text: "Ignored stale response." };
      }

      setBubbles((current) => ({
        ...current,
        [model]: { progress: 100, status: "error", text },
      }));
      setCouncilMessages((current) => [...current, { model, status: "error", text }]);

      return { model, status: "error" as const, text };
    }
  }

  async function createModelAudio(model: string, text: string) {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        text,
        languageCode: getSarvamLanguageCode(),
      }),
    });

    const payload = (await response.json()) as {
      audio?: string;
      codec?: string;
      error?: string;
    };

    if (!response.ok || !payload.audio) {
      setCouncilMessages((current) => [
        ...current,
        {
          model,
          status: "error",
          text: payload.error || "Sarvam voice failed.",
        },
      ]);
      return;
    }

    return new Audio(`data:audio/${payload.codec || "wav"};base64,${payload.audio}`);
  }

  async function speakModelResponse(model: string, text: string) {
    const audio = await createModelAudio(model, text);

    if (!audio) {
      return;
    }

    audioRef.current?.pause();
    audioRef.current = audio;
    setSpeakingModel(model);
    await new Promise<void>((resolve) => {
      const audio = audioRef.current;

      if (!audio) {
        setSpeakingModel("");
        resolve();
        return;
      }

      audio.onended = () => {
        setSpeakingModel("");
        resolve();
      };
      audio.onerror = () => {
        setSpeakingModel("");
        resolve();
      };
      audio.play().catch(() => {
        setSpeakingModel("");
        resolve();
      });
    });
  }

  function parseDiscussionLines(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .map((line) => {
        const structuredMatch = line.match(
          /^(Kimi|Mistral|OpenAI|Grok|DeepSeek)\s*\|\s*type:\s*(opinion|opening|argument|objection|rebuttal|question|final|verdict|main|interject|agree|disagree)\s*\|\s*say:\s*(.+?)\s*\|\s*show:\s*(.+)$/i,
        );
        const fallbackMatch = line.match(/^(Kimi|Mistral|OpenAI|Grok|DeepSeek)\s*:\s*(.+)$/i);
        const match = structuredMatch || fallbackMatch;

        if (!match) {
          return null;
        }

        const model = hotspots.find(
          (hotspot) => hotspot.name.toLowerCase() === match[1].toLowerCase(),
        )?.name;

        if (!model) {
          return null;
        }

        const lineType = structuredMatch
          ? (match[2].toLowerCase() as DiscussionLineType)
          : "opinion";
        const rawSpokenText = (structuredMatch ? match[3] : match[2]).trim();
        if (isHandoffOnly(rawSpokenText)) {
          return null;
        }

        const spokenText = rawSpokenText;
        const rawDisplayText = (structuredMatch ? match[4] : spokenText)
          .replace(/\b(Kimi|Mistral|OpenAI|Grok|DeepSeek)\b[:,]?\s*/gi, "")
          .replace(/\bwhat do you think\??/gi, "")
          .replace(/\byour take\??/gi, "")
          .replace(/\bdo you want to continue\??/gi, "")
          .replace(/\byou can continue\.?/gi, "")
          .replace(/\byou finish first;?\s*/gi, "")
          .replace(/\bI will continue after\.?/gi, "")
          .replace(/\bI will continue later\.?/gi, "")
          .trim();
        if (!rawDisplayText || isHandoffOnly(rawDisplayText)) {
          return null;
        }

        const displayText = rawDisplayText;

        return {
          type: lineType,
          model,
          displayText,
          text: spokenText,
        };
      })
      .filter((line): line is DiscussionLine => Boolean(line))
      .slice(0, 10);

    if (lines.length > 0) {
      return lines;
    }

    return [];
  }

  async function generateDiscussionLines(prompt: string) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
          body: JSON.stringify({
            message: prompt,
            language: selectedLanguage,
            model: "OpenAI",
            mode: "discussion",
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Discussion script failed.");
      }

      return parseDiscussionLines(payload.answer || "");
    } catch {
      return [];
    }
  }

  async function playNextDiscussionLine(runId: number) {
    if (discussionRunIdRef.current !== runId) {
      return;
    }

    const line = discussionLinesRef.current[discussionIndexRef.current];

    if (!line) {
      stopDiscussion();
      return;
    }

    setBubbles((current) => ({
      ...current,
      [line.model]: { progress: 100, status: "done", text: line.displayText, type: line.type },
    }));

    const audio = await createModelAudio(line.model, line.text);

    if (discussionRunIdRef.current !== runId) {
      return;
    }

    if (!audio) {
      discussionIndexRef.current += 1;
      playNextDiscussionLine(runId);
      return;
    }

    audioRef.current?.pause();
    overlapAudioRef.current?.pause();
    audioRef.current = audio;
    overlapAudioRef.current = null;
    audio.volume = 1;
    setSpeakingModel(line.model);
    setInterruptingModel("");
    setDiscussionStatus("playing");

    await audio.play().catch(() => undefined);

    const nextLine = discussionLinesRef.current[discussionIndexRef.current + 1];

    if (nextLine && isInterruptingType(nextLine.type)) {
      discussionTimerRef.current = window.setTimeout(() => {
        void playDiscussionOverlap(runId, nextLine);
      }, 900 + Math.floor(Math.random() * 500));
    }

    audio.onended = () => {
      if (discussionRunIdRef.current !== runId) {
        return;
      }

      if (discussionTimerRef.current !== null) {
        window.clearTimeout(discussionTimerRef.current);
        discussionTimerRef.current = null;
      }

      setSpeakingModel("");
      discussionIndexRef.current += 1;
      window.setTimeout(() => playNextDiscussionLine(runId), 350);
    };
    audio.onerror = () => {
      if (discussionRunIdRef.current !== runId) {
        return;
      }

      setSpeakingModel("");
      discussionIndexRef.current += 1;
      playNextDiscussionLine(runId);
    };
  }

  async function playDiscussionOverlap(runId: number, line: DiscussionLine) {
    if (discussionRunIdRef.current !== runId || discussionStatus === "paused") {
      return;
    }

    discussionTimerRef.current = null;
    const mainAudio = audioRef.current;

    if (!mainAudio || mainAudio.ended) {
      return;
    }

    setBubbles((current) => ({
      ...current,
      [line.model]: { progress: 100, status: "done", text: line.displayText, type: line.type },
    }));

    const overlapAudio = await createModelAudio(line.model, line.text);

    if (discussionRunIdRef.current !== runId || !overlapAudio) {
      return;
    }

    mainAudio.onended = null;
    mainAudio.onerror = null;
    mainAudio.pause();
    audioRef.current = overlapAudio;
    overlapAudioRef.current = null;
    discussionIndexRef.current += 1;
    setSpeakingModel("");
    setInterruptingModel(line.model);
    setDiscussionStatus("playing");

    await overlapAudio.play().catch(() => undefined);

    overlapAudio.onended = () => {
      if (discussionRunIdRef.current !== runId) {
        return;
      }

      audioRef.current = null;
      setInterruptingModel("");
      discussionIndexRef.current += 1;
      window.setTimeout(() => playNextDiscussionLine(runId), 300);
    };
    overlapAudio.onerror = () => {
      if (discussionRunIdRef.current !== runId) {
        return;
      }

      audioRef.current = null;
      setInterruptingModel("");
      discussionIndexRef.current += 1;
      playNextDiscussionLine(runId);
    };
  }

  function pauseDiscussion() {
    const audio = audioRef.current;

    if (discussionTimerRef.current !== null) {
      window.clearTimeout(discussionTimerRef.current);
      discussionTimerRef.current = null;
    }
    audio?.pause();
    overlapAudioRef.current?.pause();
    setDiscussionStatus("paused");
  }

  async function resumeDiscussion() {
    const audio = audioRef.current;
    const runId = discussionRunIdRef.current;

    if (!audio) {
      setDiscussionStatus("playing");
      playNextDiscussionLine(runId);
      return;
    }

    setDiscussionStatus("playing");
    await audio.play().catch(() => undefined);
    await overlapAudioRef.current?.play().catch(() => undefined);
  }

  async function listenToCouncil() {
    if (discussionStatus === "preparing") {
      return;
    }

    if (discussionStatus === "playing") {
      pauseDiscussion();
      return;
    }

    if (discussionStatus === "paused") {
      await resumeDiscussion();
      return;
    }

    const prompt = promptValue.trim();

    if (!prompt) {
      return;
    }

    stopDiscussion();
    const runId = discussionRunIdRef.current + 1;
    discussionRunIdRef.current = runId;
    setDiscussionStatus("preparing");
    setFinalAnswer("");
    setCouncilMessages([]);
    setBubbles({});

    const lines = await generateDiscussionLines(prompt);

    if (discussionRunIdRef.current !== runId) {
      return;
    }

    if (lines.length === 0) {
      setDiscussionStatus("idle");
      return;
    }

    discussionLinesRef.current = lines;
    discussionIndexRef.current = 0;
    playNextDiscussionLine(runId);
  }

  async function synthesizeCouncilAnswer(
    prompt: string,
    responses: CouncilMessage[],
    runId: number,
  ) {
    const successfulResponses = responses.filter((response) => response.status === "done");

    if (successfulResponses.length === 0) {
      setCouncilStatus("error");
      setFinalAnswer("The council could not produce a final answer because every model failed.");
      return;
    }

    setCouncilStatus("synthesizing");

    const councilContext = successfulResponses
      .map((response) => `${response.model}: ${response.text}`)
      .join("\n\n");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "OpenAI",
          mode: "synthesizer",
          language: selectedLanguage,
          message: `User query:\n${prompt}\n\nCouncil member responses:\n${councilContext}`,
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "The council chair could not synthesize the result.");
      }

      if (runIdRef.current !== runId) {
        return;
      }

      setFinalAnswer(payload.answer?.trim() || "No final council answer was produced.");
      setCouncilStatus("complete");
    } catch (error) {
      if (runIdRef.current !== runId) {
        return;
      }

      setFinalAnswer(
        error instanceof Error
          ? error.message
          : "The council chair could not synthesize the result.",
      );
      setCouncilStatus("error");
    }
  }

  async function runModels(targetModels: string[], prompt: string, speakFirstResponse = false) {
    stopDiscussion();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    stopProgressTimers();
    setFinalAnswer("");
    setCouncilMessages([]);
    setCouncilStatus(targetModels.length > 1 ? "running" : "idle");
    setIsCouncilResultOpen(false);
    setBubbles(
      targetModels.reduce<BubbleMap>((nextBubbles, model) => {
        nextBubbles[model] = { progress: 5, status: "loading", text: "" };
        return nextBubbles;
      }, {}),
    );
    targetModels.forEach((model) => startProgress(model, runId));

    const responses = await Promise.all(
      targetModels.map((model) => askModel(model, prompt, runId)),
    );

    if (runIdRef.current !== runId) {
      return [];
    }

    stopProgressTimers();

    if (speakFirstResponse) {
      const firstDone = responses.find((response) => response.status === "done");

      if (firstDone) {
        await speakModelResponse(firstDone.model, firstDone.text);
      }
    }

    if (targetModels.length > 1) {
      await synthesizeCouncilAnswer(prompt, responses, runId);
    }

    return responses;
  }

  async function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = promptValue.trim();

    if (!prompt) {
      return;
    }

    const targetModels =
      selectedModel === "All"
        ? hotspots.map((hotspot) => hotspot.name)
        : [selectedModel];

    await runModels(targetModels, prompt);
  }

  const councilHeader =
    councilStatus === "running"
      ? "Council is discussing..."
      : councilStatus === "synthesizing"
        ? "Council chair is evaluating..."
        : councilStatus === "complete"
          ? "Council Result"
          : councilStatus === "error"
            ? "Council Result"
            : "Council Result";

  return (
    <main className="council-page" aria-label="AI Council meeting room">
      <div className="image-stage" aria-hidden="true" />
      <div className="hotspot-layer" aria-label="Model hotspots">
        {hotspots.map((hotspot) => (
          <button
            aria-label={hotspot.name}
            className="hotspot"
            data-label={hotspot.name}
            key={hotspot.name}
            onClick={() => handleHotspotClick(hotspot.name)}
            style={
              {
                "--x": `${hotspot.x}%`,
                "--y": `${hotspot.y}%`,
                "--size": `${hotspot.size}%`,
              } as CSSProperties
            }
            type="button"
          />
        ))}
      </div>
      <div className="bubble-layer" aria-label="Model responses">
        {hotspots.map((hotspot) => {
          const bubble = bubbles[hotspot.name];
          const isSpeaking = hotspot.name === speakingModel;
          const isInterrupting = hotspot.name === interruptingModel;

          return (
            <div
              className={`model-bubble ${
                bubble ? `model-bubble--${bubble.status}` : "model-bubble--idle"
              }${isSpeaking && bubble ? " model-bubble--speaking" : ""}${
                isInterrupting && bubble ? " model-bubble--interrupting" : ""
              }${
                bubble?.type === "objection" || bubble?.type === "rebuttal"
                  ? " model-bubble--court-action"
                  : ""
              }${
                isSpeaking && !bubble ? " model-bubble--voice-only" : ""
              }${
                isInterrupting && !bubble ? " model-bubble--voice-only" : ""
              }`}
              key={`${hotspot.name}-bubble`}
              style={
                {
                  "--x": `${hotspot.x}%`,
                  "--y": `${hotspot.y - 11.5}%`,
                } as CSSProperties
              }
            >
              {!bubble ? (
                <>
                  <span className="model-bubble__indicator" />
                  {isSpeaking && <strong>Speaking</strong>}
                </>
              ) : bubble.status === "loading" ? (
                <strong>{bubble.progress}%</strong>
              ) : (
                <>
                  <strong>{hotspot.name}</strong>
                  <p>{bubble.text}</p>
                </>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="prompt-bar"
        aria-label="Council prompt"
        onSubmit={handlePromptSubmit}
      >
        <button className="prompt-bar__icon" aria-label="Add" type="button">
          +
        </button>
        <input
          aria-label="Prompt"
          className="prompt-bar__input"
          onChange={(event) => setPromptValue(event.target.value)}
          placeholder="Ask the council"
          type="text"
          value={promptValue}
        />
        <label className="model-select-wrap">
          <span className="sr-only">Select model</span>
          <select
            aria-label="Select model"
            className="model-select"
            onChange={(event) => {
              setSelectedModel(event.target.value);
              resetCouncil();
            }}
            value={selectedModel}
          >
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <button className="prompt-bar__submit" aria-label="Submit" type="submit">
          &uarr;
        </button>
      </form>
      <div className="council-actions">
        <label className="language-select-wrap">
          <span className="sr-only">Select language</span>
          <select
            aria-label="Select language"
            className="language-select"
            onChange={(event) => {
              stopDiscussion();
              setSelectedLanguage(event.target.value);
            }}
            value={selectedLanguage}
          >
            {languageOptions.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="council-action-button"
          onClick={() => setIsCouncilResultOpen((isOpen) => !isOpen)}
          type="button"
        >
          Council Result
        </button>
        <button
          className="council-action-button"
          disabled={!promptValue.trim() && discussionStatus === "idle"}
          onClick={() => void listenToCouncil()}
          type="button"
        >
          {discussionStatus === "preparing"
            ? "Preparing..."
            : discussionStatus === "playing"
              ? "Pause Council"
              : discussionStatus === "paused"
                ? "Resume Council"
                : "Listen to Council"}
        </button>
      </div>
      {isCouncilResultOpen && (
        <section className="council-result" aria-label="Council result">
          <div className="council-result__header">
            <strong>{councilHeader}</strong>
            <button
              aria-label="Close council result"
              onClick={() => setIsCouncilResultOpen(false)}
              type="button"
            >
              x
            </button>
          </div>
          <div className="council-result__list">
            {Object.keys(bubbles).length === 0 ? (
              <article className="council-result__item">
                <strong>No result yet</strong>
                <p>Ask the council to see model responses here.</p>
              </article>
            ) : (
              <>
                {hotspots
                  .filter((hotspot) => bubbles[hotspot.name]?.status === "loading")
                  .map((hotspot) => {
                    const bubble = bubbles[hotspot.name];

                    return (
                      <article className="council-result__item" key={`${hotspot.name}-progress`}>
                        <strong>{hotspot.name}</strong>
                        <p>Answering... {bubble.progress}%</p>
                      </article>
                    );
                  })}
                {councilMessages.map((message, index) => (
                  <article
                    className={`council-result__item council-result__item--${message.status}`}
                    key={`${message.model}-${index}`}
                  >
                    <strong>{message.model}</strong>
                    <p>{message.text}</p>
                  </article>
                ))}
                {councilStatus === "synthesizing" && (
                  <article className="council-result__item council-result__item--final">
                    <strong>OpenAI Chair</strong>
                    <p>Evaluating council answers... 95%</p>
                  </article>
                )}
                {finalAnswer && (
                  <article
                    className={`council-result__item council-result__item--final${
                      councilStatus === "error" ? " council-result__item--error" : ""
                    }`}
                  >
                    <strong>Final Council Answer</strong>
                    <p>{finalAnswer}</p>
                  </article>
                )}
              </>
            )}
          </div>
        </section>
      )}
      {welcomeState !== "hidden" && (
        <section
          className={`welcome welcome--${welcomeState}`}
          aria-labelledby="welcome-title"
        >
          <div className="welcome__content">
            <h1 id="welcome-title">Welcome to AI Council</h1>
            <button
              className="enter-button"
              disabled={welcomeState === "opening"}
              onClick={handleEnter}
              type="button"
            >
              Enter
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
