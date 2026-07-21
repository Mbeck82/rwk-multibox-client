import { useMemo, useState } from "react";

// Bundled at build time — each help topic is a scraped-and-condensed markdown
// file in ./help/ (game data from the official help page + jimcav.com guides).
const helpRaw = import.meta.glob("./help/*.md", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

const TOPIC_ORDER = [
  "rwkquest",
  "quests",
  "beasts",
  "special_locations",
  "ash_keeper",
  "ash_collector",
  "specialcraft",
  "chantcrafting",
  "reliccrafting"
];

type Topic = { slug: string; title: string; body: string };

const TOPICS: Topic[] = Object.entries(helpRaw)
  .map(([path, body]) => {
    const slug = path.replace(/^.*\//, "").replace(/\.md$/, "");
    const title = body.match(/^# (.+)$/m)?.[1]?.trim() ?? slug;
    return { slug, title, body };
  })
  .sort((a, b) => {
    const ai = TOPIC_ORDER.indexOf(a.slug);
    const bi = TOPIC_ORDER.indexOf(b.slug);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

/** Bold-only inline markdown, same treatment as the changelog renderer. */
function Inline({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

/** Loose matching: every whitespace-separated query word must appear somewhere (any order). */
function toWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function looseMatch(words: string[], text: string): boolean {
  const lower = text.toLowerCase();
  return words.every((w) => lower.includes(w));
}

const cellStyle: React.CSSProperties = {
  border: "1px solid var(--rwk-border-soft)",
  padding: "0.3rem 0.55rem",
  textAlign: "left",
  verticalAlign: "top",
  fontSize: "0.84rem"
};

/**
 * Minimal block renderer for the help topics' constrained markdown:
 * #/##/### headings, paragraphs, flat "- " bullets, pipe tables, **bold**.
 * With filterWords, big tables collapse to just the rows that loosely match.
 */
function renderHelpMarkdown(md: string, filterWords?: string[]): React.JSX.Element[] {
  const lines = md.split(/\r?\n/);
  const out: React.JSX.Element[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i += 1; continue; }
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) { i += 1; continue; } // topic title rendered separately
    if (trimmed.startsWith("### ")) {
      out.push(<h5 key={key++} style={{ margin: "0.7rem 0 0.25rem", fontSize: "0.86rem", color: "var(--rwk-text)" }}><Inline text={trimmed.slice(4)} /></h5>);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      out.push(
        <h4 key={key++} style={{ margin: "0.9rem 0 0.3rem", fontSize: "0.95rem", color: "var(--rwk-accent)" }}>
          <Inline text={trimmed.slice(3)} />
        </h4>
      );
      i += 1;
      continue;
    }
    if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      const [head, ...allRows] = rows;
      // Filtered view: show only loosely-matching rows, unless nothing matches
      // (then the section matched via prose — keep the table intact).
      let body = allRows;
      let rowNote: string | null = null;
      if (filterWords?.length) {
        const kept = allRows.filter((r) => looseMatch(filterWords, r.join(" ")));
        if (kept.length > 0 && kept.length < allRows.length) {
          body = kept;
          rowNote = `matching ${kept.length} of ${allRows.length} rows — clear the filter for the full table`;
        }
      }
      out.push(
        <div key={key++} style={{ overflowX: "auto", margin: "0.35rem 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            {head && (
              <thead>
                <tr>
                  {head.map((c, ci) => (
                    <th key={ci} style={{ ...cellStyle, fontWeight: 600, color: "#aac6e4", background: "rgba(18, 26, 38, 0.95)" }}>
                      <Inline text={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} style={cellStyle}><Inline text={c} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowNote && (
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--rwk-text-muted)" }}>{rowNote}</p>
          )}
        </div>
      );
      continue;
    }
    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2));
        i += 1;
      }
      out.push(
        <ul key={key++} style={{ margin: "0.25rem 0", paddingLeft: "1.1rem", display: "grid", gap: "0.12rem" }}>
          {items.map((item, ii) => (
            <li key={ii} style={{ fontSize: "0.85rem" }}><Inline text={item} /></li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^Source:\s/.test(trimmed)) {
      out.push(
        <p key={key++} style={{ margin: "0.8rem 0 0", fontSize: "0.74rem", color: "var(--rwk-text-muted)" }}>{trimmed}</p>
      );
      i += 1;
      continue;
    }
    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |- |\|)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(
      <p key={key++} style={{ margin: "0.3rem 0", fontSize: "0.85rem", lineHeight: 1.45 }}>
        <Inline text={para.join(" ")} />
      </p>
    );
  }
  return out;
}

type Section = { topic: Topic; heading: string; text: string };

/** Every "## " section across every topic, for search. */
function buildSections(): Section[] {
  const sections: Section[] = [];
  for (const topic of TOPICS) {
    const chunks = topic.body.split(/^## /m);
    for (const [ci, chunk] of chunks.entries()) {
      if (ci === 0) {
        // Preamble before the first ## — searchable under the topic title itself.
        const text = chunk.replace(/^# .+$/m, "").trim();
        if (text) sections.push({ topic, heading: topic.title, text });
        continue;
      }
      const nl = chunk.indexOf("\n");
      const heading = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
      sections.push({ topic, heading, text: "## " + chunk });
    }
  }
  return sections;
}

const MAX_SEARCH_RESULTS = 25;

export function HelpPanel(): React.JSX.Element {
  const [selected, setSelected] = useState<string>(TOPICS[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const [topicQuery, setTopicQuery] = useState("");
  const sections = useMemo(buildSections, []);

  const qWords = toWords(query);
  const searching = query.trim().length >= 2;
  const matches = searching
    ? sections.filter((s) => looseMatch(qWords, s.heading + "\n" + s.text))
    : [];
  const shown = matches.slice(0, MAX_SEARCH_RESULTS);
  const selectedTopic = TOPICS.find((t) => t.slug === selected) ?? TOPICS[0];

  if (TOPICS.length === 0) {
    return <p className="hint">No help topics bundled in this build.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search all help topics (quests, beasts, crafting, locations…)"
        aria-label="Search help topics"
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {searching ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="hint" style={{ margin: 0 }}>
            {matches.length === 0
              ? `No sections match "${query.trim()}".`
              : `${matches.length} matching section${matches.length === 1 ? "" : "s"}${matches.length > MAX_SEARCH_RESULTS ? ` — showing first ${MAX_SEARCH_RESULTS}, narrow your search` : ""}. Clear the search to browse topics.`}
          </p>
          {shown.map((s, si) => (
            <section
              key={si}
              style={{
                border: "1px solid var(--rwk-border)",
                borderRadius: "10px",
                background: "var(--rwk-bg-panel)",
                padding: "0.6rem 0.8rem"
              }}
            >
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--rwk-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.topic.title}
              </div>
              {renderHelpMarkdown(s.text, qWords)}
            </section>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "185px minmax(0, 1fr)", gap: "0.7rem", alignItems: "start" }}>
          <nav aria-label="Help topics" style={{ display: "grid", gap: "0.25rem", position: "sticky", top: 0 }}>
            {TOPICS.map((t) => (
              <button
                key={t.slug}
                type="button"
                className={`settings-tab${selected === t.slug ? " settings-tab--active" : ""}`}
                style={{ textAlign: "left" }}
                onClick={() => { setSelected(t.slug); setTopicQuery(""); }}
              >
                {t.title}
              </button>
            ))}
          </nav>
          <section
            style={{
              border: "1px solid var(--rwk-border)",
              borderRadius: "10px",
              background: "var(--rwk-bg-panel)",
              padding: "0.75rem 0.95rem",
              minWidth: 0
            }}
          >
            <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem", color: "var(--rwk-accent)" }}>{selectedTopic.title}</h3>
            <input
              type="text"
              value={topicQuery}
              onChange={(e) => setTopicQuery(e.target.value)}
              placeholder={`Filter this page — words in any order, e.g. "fists flames"`}
              aria-label={`Filter ${selectedTopic.title}`}
              style={{ width: "100%", boxSizing: "border-box", margin: "0 0 0.55rem" }}
            />
            {(() => {
              const tWords = toWords(topicQuery);
              if (topicQuery.trim().length < 2) return renderHelpMarkdown(selectedTopic.body);
              const topicMatches = sections.filter(
                (s) => s.topic.slug === selectedTopic.slug && looseMatch(tWords, s.heading + "\n" + s.text)
              );
              if (topicMatches.length === 0) {
                return (
                  <p className="hint" style={{ margin: 0 }}>
                    Nothing on this page matches &ldquo;{topicQuery.trim()}&rdquo; — the search box up top scans every topic.
                  </p>
                );
              }
              return (
                <>
                  <p className="hint" style={{ margin: "0 0 0.3rem" }}>
                    {topicMatches.length} matching section{topicMatches.length === 1 ? "" : "s"} — clear the filter for the whole page.
                  </p>
                  {topicMatches.map((s, si) => (
                    <div key={si}>{renderHelpMarkdown(s.text, tWords)}</div>
                  ))}
                </>
              );
            })()}
          </section>
        </div>
      )}
    </div>
  );
}
