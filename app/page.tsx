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

type BubbleStatus = "loading" | "done" | "error";

type BubbleState = {
  progress: number;
  status: BubbleStatus;
  text: string;
};

type BubbleMap = Record<string, BubbleState>;

type CouncilMessage = {
  model: string;
  status: Exclude<BubbleStatus, "loading">;
  text: string;
};

type CouncilStatus = "idle" | "running" | "synthesizing" | "complete" | "error";

function clampProgress(progress: number) {
  return Math.min(95, Math.max(5, progress));
}

export default function Home() {
  const [welcomeState, setWelcomeState] = useState<
    "visible" | "opening" | "hidden"
  >("visible");
  const [promptValue, setPromptValue] = useState("");
  const [selectedModel, setSelectedModel] = useState("OpenAI");
  const [bubbles, setBubbles] = useState<BubbleMap>({});
  const [isCouncilResultOpen, setIsCouncilResultOpen] = useState(false);
  const [councilMessages, setCouncilMessages] = useState<CouncilMessage[]>([]);
  const [councilStatus, setCouncilStatus] = useState<CouncilStatus>("idle");
  const [finalAnswer, setFinalAnswer] = useState("");
  const runIdRef = useRef(0);
  const progressTimersRef = useRef<number[]>([]);

  function stopProgressTimers() {
    progressTimersRef.current.forEach((timer) => window.clearInterval(timer));
    progressTimersRef.current = [];
  }

  function resetCouncil() {
    stopProgressTimers();
    setBubbles({});
    setCouncilMessages([]);
    setCouncilStatus("idle");
    setFinalAnswer("");
    setIsCouncilResultOpen(false);
  }

  function handleHotspotClick(modelName: string) {
    setSelectedModel(modelName);
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

  async function askModel(model: string, message: string, runId: number) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, model, mode: "member" }),
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
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    stopProgressTimers();
    setFinalAnswer("");
    setCouncilMessages([]);
    setCouncilStatus(selectedModel === "All" ? "running" : "idle");
    setIsCouncilResultOpen(selectedModel === "All");
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
      return;
    }

    stopProgressTimers();

    if (selectedModel === "All") {
      await synthesizeCouncilAnswer(prompt, responses, runId);
    }
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
      {Object.keys(bubbles).length > 0 && (
        <div className="bubble-layer" aria-label="Model responses">
          {hotspots
            .filter((hotspot) => bubbles[hotspot.name])
            .map((hotspot) => {
              const bubble = bubbles[hotspot.name];

              return (
                <div
                  className={`model-bubble model-bubble--${bubble.status}`}
                  key={`${hotspot.name}-bubble`}
                  style={
                    {
                      "--x": `${hotspot.x}%`,
                      "--y": `${hotspot.y - 11.5}%`,
                    } as CSSProperties
                  }
                >
                  {bubble.status === "loading" ? (
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
      )}
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
      <button
        className="council-result-button"
        onClick={() => setIsCouncilResultOpen((isOpen) => !isOpen)}
        type="button"
      >
        Council Result
      </button>
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
