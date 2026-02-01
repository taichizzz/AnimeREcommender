"use client";

import { useEffect, useMemo, useState } from "react";

type SearchItem = {
  id: number;
  title: string;
  synopsis: string | null;
  imageUrl: string | null;
  score: number | null;
  year: number | null;
};

type RecommendationItem = {
  id: number;
  title: string;
  imageUrl: string | null;
  score: number | null;
  year: number | null;
  reason: string;
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //store the user's selected favorites (max 3)
  const [selected, setSelected] = useState<SearchItem[]>([]);

  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  //fast lookup set so we can check "is selected?" quickly
  const selectedIds = useMemo(() => new Set(selected.map((a) => a.id)), [selected]);

  // Clear old recommendations whenever the selected anime changes
  useEffect(() => {
    setRecs([]);
  }, [selectedIds]);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Search failed");
        setResults([]);
        return;
      }

      setResults(data.results);
    } catch {
      setError("Network error while searching");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  //add an anime to selected (if not already selected and < 3)
  function addToSelected(item: SearchItem) {
    // already selected? do nothing
    if (selectedIds.has(item.id)) return;

    // max 3 rule
    if (selected.length >= 3) {
      setError("You can select up to 3 anime only.");
      return;
    }

    setError(null);
    setSelected((prev) => [...prev, item]);
  }

  //remove an anime from selected
  function removeFromSelected(id: number) {
    setError(null);
    setSelected((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleRecommend() {
  if (selected.length === 0) return;

  setRecLoading(true);
  setError(null);

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        likedAnimeIds: selected.map((a) => a.id),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data?.error ?? "Recommendation failed");
      setRecs([]);
      return;
    }

    setRecs(data.results);
  } catch {
    setError("Network error while recommending");
    setRecs([]);
  } finally {
    setRecLoading(false);
  }
}

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Anime Recommender</h1>
      <p style={{ opacity: 0.8 }}>
        Search anime, then select up to 3 that you like. We’ll use them to recommend new shows.
      </p>

      {/*Selected section */}
      <section
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Selected ({selected.length}/3)</h2>
          <button
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: selected.length === 0 ? "not-allowed" : "pointer",
              opacity: selected.length === 0 ? 0.5 : 1,
            }}
          >
            Clear
          </button>
        </div>

        {selected.length === 0 ? (
          <p style={{ marginTop: 8, opacity: 0.75 }}>
            No anime selected yet. Search and click “Select”.
          </p>
        ) : (
          <ul style={{ marginTop: 10, paddingLeft: 18 }}>
            {selected.map((a) => (
              <li key={a.id} style={{ marginBottom: 6 }}>
                <strong>{a.title}</strong>{" "}
                <button
                  onClick={() => removeFromSelected(a.id)}
                  style={{
                    marginLeft: 8,
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={handleRecommend}
          disabled={selected.length === 0 || recLoading}
          style={{
            marginTop: 10,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: selected.length === 0 ? "not-allowed" : "pointer",
            opacity: selected.length === 0 ? 0.5 : 1,
          }}
        >
          {recLoading ? "Recommending..." : "Get Recommendations"}
        </button>
      </section>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: naruto, attack on titan, frieren..."
          style={{
            flex: 1,
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {results.map((a) => {
          const isSelected = selectedIds.has(a.id);

          return (
            <div
              key={a.id}
              style={{
                display: "flex",
                gap: 12,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                alignItems: "flex-start",
              }}
            >
              {a.imageUrl ? (
                <img
                  src={a.imageUrl}
                  alt={a.title}
                  width={80}
                  height={110}
                  style={{ borderRadius: 8, objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 80,
                    height: 110,
                    borderRadius: 8,
                    background: "#eee",
                  }}
                />
              )}

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{a.title}</h2>
                  <span style={{ opacity: 0.7 }}>
                    {a.year ?? "?"} • ⭐ {a.score ?? "?"}
                  </span>
                </div>

                <p style={{ marginTop: 6, opacity: 0.85 }}>
                  {(a.synopsis ?? "No synopsis.").slice(0, 220)}
                  {a.synopsis && a.synopsis.length > 220 ? "..." : ""}
                </p>
              </div>

              {/*/Remove button */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {isSelected ? (
                  <button
                    onClick={() => removeFromSelected(a.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ccc",
                      cursor: "pointer",
                    }}
                  >
                    Selected ✓
                  </button>
                ) : (
                  <button
                    onClick={() => addToSelected(a)}
                    disabled={selected.length >= 3}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ccc",
                      cursor: selected.length >= 3 ? "not-allowed" : "pointer",
                      opacity: selected.length >= 3 ? 0.5 : 1,
                    }}
                  >
                    Select
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {recs.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recommendations</h2>

          <div style={{ display: "grid", gap: 12 }}>
            {recs.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  gap: 12,
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt={r.title}
                    width={80}
                    height={110}
                    style={{ borderRadius: 8, objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 80,
                      height: 110,
                      background: "#eee",
                      borderRadius: 8,
                    }}
                  />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <h3 style={{ margin: 0 }}>{r.title}</h3>
                    <span style={{ opacity: 0.7 }}>
                      {r.year ?? "?"} • ⭐ {r.score ?? "?"}
                    </span>
                  </div>

                  <p style={{ marginTop: 6, opacity: 0.9 }}>
                    <strong>Reason:</strong> {r.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
