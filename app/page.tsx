"use client";

import { useState } from "react";

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

  function handleHotspotClick(modelName: string) {
    window.alert(`${modelName} selected`);
  }

  function handleEnter() {
    setWelcomeState("opening");
    window.setTimeout(() => setWelcomeState("hidden"), 950);
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
            style={{
              "--x": `${hotspot.x}%`,
              "--y": `${hotspot.y}%`,
              "--size": `${hotspot.size}%`,
            } as React.CSSProperties}
            type="button"
          />
        ))}
      </div>
      <form
        className="prompt-bar"
        aria-label="Council prompt"
        onSubmit={(event) => event.preventDefault()}
      >
        <button className="prompt-bar__icon" aria-label="Add" type="button">
          +
        </button>
        <input
          aria-label="Prompt"
          className="prompt-bar__input"
          placeholder="Describe edits"
          type="text"
        />
        <button className="prompt-bar__submit" aria-label="Submit" type="submit">
          ↑
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
