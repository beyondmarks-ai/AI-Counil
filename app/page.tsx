"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

const hotspots = [
  { name: "Microsoft", x: 13.5, y: 46.4, size: 8.2 },
  { name: "Mistral", x: 29.4, y: 42.8, size: 8.2 },
  { name: "OpenAI", x: 50.1, y: 40.3, size: 8.2 },
  { name: "Grok", x: 72.1, y: 41.9, size: 8.2 },
  { name: "DeepSeek", x: 87.4, y: 46.6, size: 8.2 },
];

export default function Home() {
  const [welcomeState, setWelcomeState] = useState<
    "visible" | "opening" | "hidden"
  >("visible");
  const [promptValue, setPromptValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [bubbleMessage, setBubbleMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState(hotspots[2].name);

  function handleHotspotClick(modelName: string) {
    window.alert(`${modelName} selected`);
  }

  function handleEnter() {
    setWelcomeState("opening");
    window.setTimeout(() => setWelcomeState("hidden"), 950);
  }

  function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!promptValue.trim()) {
      return;
    }

    setBubbleMessage(promptValue.trim().toLowerCase() === "hi" ? "Hi" : "");
    setIsThinking(true);
  }

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
      {isThinking && (
        <div className="bubble-layer" aria-label="Model response indicators">
          {hotspots
            .filter((hotspot) => hotspot.name === selectedModel)
            .map((hotspot) => (
              <div
                className="model-bubble"
                key={`${hotspot.name}-bubble`}
                style={
                  {
                    "--x": `${hotspot.x}%`,
                    "--y": `${hotspot.y - 10.2}%`,
                  } as CSSProperties
                }
              >
                {bubbleMessage ? (
                  <strong>{bubbleMessage}</strong>
                ) : (
                  <>
                    <span />
                    <span />
                    <span />
                  </>
                )}
              </div>
            ))}
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
          placeholder="Describe edits"
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
              setIsThinking(false);
            }}
            value={selectedModel}
          >
            {hotspots.map((hotspot) => (
              <option key={hotspot.name} value={hotspot.name}>
                {hotspot.name}
              </option>
            ))}
          </select>
        </label>
        <button className="prompt-bar__submit" aria-label="Submit" type="submit">
          &uarr;
        </button>
      </form>
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
