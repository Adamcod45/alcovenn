"use client";

import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { BIBLE, type Book } from "./bibledata";
import { PEOPLE, type Person } from "./biblepeople";

/* react-pageflip's default export can arrive wrapped one level deeper depending on the bundler.
   This unwraps it either way. next/dynamic doesn't forward refs, so the ref goes in as a normal
   prop called `flipRef` and is attached to the real component here. */
const HTMLFlipBook = dynamic(
  () =>
    import("react-pageflip").then((mod) => {
      const outer = (mod as unknown as { default?: unknown }).default;
      const inner = (outer as { default?: unknown } | undefined)?.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Book = (inner ?? outer ?? mod) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Wrapped = ({ flipRef, ...props }: any) => <Book ref={flipRef} {...props} />;
      return Wrapped;
    }),
  { ssr: false }
);

const MIN_MENTIONS = 5; // the A–Z list shows people named in at least this many verses; the tree can still reach everyone

/* ------------------------------------------------------------------ */
/* STYLES (inline).                                                    */
/* Bible styles, built on the Quran's page: same paper, same book, same rows.
   Only the accent changes: crimson (--bible) takes the place of green (--quran). */
/* ------------------------------------------------------------------ */

const DISPLAY = "var(--font-display), Georgia, serif";
/* The colours the page needs. They were global CSS variables before; now they live on the shell. */
const PALETTE = {
  "--bg": "#120d0e",
  "--ink": "#f3ece0",
  "--muted": "#a99a90",
  "--line": "rgba(243,236,224,.14)",
  "--surface": "#1d1517",
  "--gold": "#d4af6a",
  "--bible": "#8c1c2c",
  "--blossom": "#e7a7b5",
  "--bibleText": "#d98a93",
} as Record<string, string>;

/* Every book gets a cover colour by its group, so the shelf reads like a real set of bindings. */
function coverOf(id: number): { color: string; group: string } {
  if (id <= 5) return { color: "#7a1f2b", group: "The Law" };
  if (id <= 17) return { color: "#2f4f6f", group: "History" };
  if (id <= 22) return { color: "#6b4e1e", group: "Wisdom" };
  if (id <= 27) return { color: "#4a2c6b", group: "Major Prophets" };
  if (id <= 39) return { color: "#2f5d4e", group: "Minor Prophets" };
  if (id <= 43) return { color: "#8c1c2c", group: "Gospels" };
  if (id === 44) return { color: "#a04a1e", group: "Acts" };
  if (id <= 57) return { color: "#1f4a5c", group: "Epistles of Paul" };
  if (id <= 65) return { color: "#5a3a3a", group: "General Epistles" };
  return { color: "#3b1a4a", group: "Revelation" };
}
const coverBg = (color: string) =>
  `linear-gradient(to right, rgba(0,0,0,.4), rgba(0,0,0,.08) 14%, transparent 30%), radial-gradient(80% 60% at 50% 100%, rgba(255,255,255,.14), transparent 70%), ${color}`;

const GOLD_LINE = "color-mix(in srgb, var(--gold) 60%, transparent)";

/* Inline styles can't express pseudo-elements, :hover, ::-webkit-scrollbar or <option> styling,
   so those few rules live in this tiny <style> block, tied to the b* class names below. */
const EXTRA_CSS = `
.bn::before, .bn::after { content: ""; position: absolute; inset: 5px; border: 1px solid var(--gold); border-radius: 3px; opacity: .7; }
.bn::after { transform: rotate(45deg); }
.bcover::before { content: ""; position: absolute; inset: 14px; border: 3px double var(--gold); border-radius: 6px; pointer-events: none; }
.bpc { scrollbar-width: none; }
.bpc::-webkit-scrollbar { display: none; }
.brow:hover .bnm { color: var(--gold) !important; }
.bchap:hover { border-color: var(--gold) !important; color: var(--gold) !important; }
.bcard:not(.bfocus):hover { border-color: var(--gold) !important; transform: translateY(-2px) !important; }
.bspeed option { background: var(--surface); color: var(--ink); }
`;

const S = {
  shell: { position: "relative", minHeight: "100svh", overflowX: "hidden", background: "var(--bg)", color: "var(--ink)", ...PALETTE } as CSSProperties,
  glow: {
    position: "fixed", left: "-20%", right: "-20%", bottom: "-35%", height: "70%", pointerEvents: "none",
    background: "radial-gradient(55% 65% at 50% 100%, color-mix(in srgb, var(--bible) 45%, transparent), transparent 70%)",
  } as CSSProperties,
  wrap: { position: "relative", maxWidth: 680, margin: "0 auto", padding: "0 18px 80px" } as CSSProperties,

  /* home */
  hero: { display: "flex", alignItems: "center", gap: 16, padding: "34px 0 18px" } as CSSProperties,
  logo: {
    flex: "none", width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--gold)", background: "var(--surface)",
    overflow: "hidden", display: "grid", placeItems: "center",
  } as CSSProperties,
  logoGlyph: { fontSize: "1.9rem", color: "var(--gold)", lineHeight: 1 } as CSSProperties,
  h1: { margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: "2.3rem", lineHeight: 1 } as CSSProperties,
  tagline: { margin: "2px 0 0", color: "var(--muted)", fontSize: ".85rem" } as CSSProperties,
  tabs: { display: "flex", gap: 8, margin: "4px 0 6px" } as CSSProperties,
  tab: {
    padding: "9px 18px", borderRadius: 999, borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", fontSize: ".9rem",
  } as CSSProperties,
  tabOn: { borderColor: "var(--gold)", color: "var(--gold)", background: "color-mix(in srgb, var(--gold) 12%, transparent)" } as CSSProperties,
  letter: {
    padding: "18px 4px 6px", color: "var(--gold)", fontFamily: DISPLAY, fontSize: "1.1rem",
    borderBottom: "1px solid color-mix(in srgb, var(--gold) 35%, transparent)",
  } as CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } as CSSProperties,
  row: {
    display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
    padding: "13px 4px", borderBottom: "1px solid var(--line)",
  } as CSSProperties,
  num: {
    width: 38, height: 38, display: "grid", placeItems: "center", fontSize: ".8rem", color: "var(--gold)", position: "relative", fontFamily: DISPLAY,
  } as CSSProperties,
  numI: { position: "relative", fontStyle: "normal" } as CSSProperties,
  nm: { fontWeight: 500 } as CSSProperties,
  sub: { color: "var(--muted)", fontSize: ".82rem" } as CSSProperties,
  go: { color: "var(--gold)" } as CSSProperties,
  credit: { color: "var(--muted)", fontSize: ".75rem", textAlign: "center", padding: "30px 0 0" } as CSSProperties,

  miniCover: {
    width: 32, height: 44, borderRadius: "3px 6px 6px 3px", display: "grid", placeItems: "center", position: "relative",
    boxShadow: "0 3px 8px rgba(0,0,0,.45), inset 3px 0 0 rgba(0,0,0,.3)", border: "1px solid color-mix(in srgb, var(--gold) 55%, transparent)",
    color: "var(--gold)", fontFamily: DISPLAY, fontSize: ".75rem",
  } as CSSProperties,

  /* chapters */
  bigCover: {
    width: 150, height: 210, margin: "26px auto 0", borderRadius: "4px 10px 10px 4px", position: "relative", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 16px",
    boxShadow: "0 18px 40px rgba(0,0,0,.55), inset 6px 0 0 rgba(0,0,0,.3)", border: "1px solid color-mix(in srgb, var(--gold) 55%, transparent)",
  } as CSSProperties,
  bigCoverName: { fontFamily: DISPLAY, fontSize: "1.35rem", lineHeight: 1.15, color: "var(--gold)" } as CSSProperties,
  bigCoverGroup: { marginTop: 10, fontSize: ".62rem", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(243,236,224,.7)" } as CSSProperties,
  ornament: { margin: "14px auto 0", width: 46, height: 1, background: "var(--gold)", opacity: 0.8 } as CSSProperties,
  chapHint: { padding: "22px 4px 0", color: "var(--muted)", fontSize: ".85rem", textAlign: "center" } as CSSProperties,
  chapters: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 10, padding: "22px 0 0" } as CSSProperties,
  chap: {
    height: 56, display: "grid", placeItems: "center", borderRadius: 14, border: "1px solid var(--line)", background: "var(--surface)",
    fontFamily: DISPLAY, fontSize: "1.15rem", transition: "border-color .15s, color .15s",
  } as CSSProperties,

  /* bar */
  bar: {
    position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 6, padding: "10px 0",
    background: "color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--line)",
  } as CSSProperties,
  title: { flex: 1, textAlign: "center", fontWeight: 500 } as CSSProperties,
  titleSmall: { display: "block", color: "var(--muted)", fontWeight: 400, fontSize: ".75rem" } as CSSProperties,
  ib: { minWidth: 40, height: 40, borderRadius: 999, border: "1px solid var(--line)", display: "grid", placeItems: "center" } as CSSProperties,
  ibGhost: { minWidth: 40, height: 40, borderRadius: 999, border: "1px solid transparent", display: "grid", placeItems: "center" } as CSSProperties,

  /* read-aloud controls (speed + play/stop) sit in the right of the bar */
  tools: { display: "flex", gap: 6 } as CSSProperties,
  toolBtn: { padding: "0 10px", fontSize: "1.1rem" } as CSSProperties,
  toolOff: { opacity: 0.35, cursor: "default" } as CSSProperties,
  speed: {
    appearance: "none", WebkitAppearance: "none", background: "transparent", color: "inherit", fontFamily: "inherit",
    fontSize: ".85rem", textAlign: "center", textAlignLast: "center", cursor: "pointer", padding: "0 10px",
  } as CSSProperties,

  /* book: paper is the palette's --ink, text is --bg, so the curl reads against the dark room */
  book: { display: "flex", justifyContent: "center", alignItems: "center", padding: "18px 0 0", minHeight: "calc(100svh - 80px)" } as CSSProperties,
  flip: { margin: "0 auto" } as CSSProperties,

  /* the paper: warm, with a soft shade where the page meets the spine */
  page: {
    background: "linear-gradient(to right, rgba(0,0,0,.14), rgba(0,0,0,.04) 14px, transparent 42px), linear-gradient(180deg, #f6f2ea, #ece6d8)",
    color: "var(--bg)", overflow: "hidden", willChange: "transform",
  } as CSSProperties,
  pageContent: { height: "100%", padding: "36px 28px 22px", display: "flex", flexDirection: "column", overflowY: "auto" } as CSSProperties,
  verse: { minHeight: "100%", display: "flex", flexDirection: "column" } as CSSProperties,
  vText: {
    margin: "auto 0 0", textAlign: "center", fontFamily: DISPLAY, fontSize: "clamp(1.25rem, 4.8vw, 1.7rem)", lineHeight: 1.65, color: "#2b2a24",
  } as CSSProperties,
  vRef: {
    marginTop: "auto", paddingTop: 26, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: ".78rem", color: "#6b5a2c",
  } as CSSProperties,
  vn: {
    display: "inline-grid", placeItems: "center", minWidth: "2em", height: "2em", padding: "0 .3em", border: "1px solid #8a6d2f",
    borderRadius: 999, color: "#6b5a2c", fontFamily: DISPLAY, fontSize: ".95rem",
  } as CSSProperties,

  /* word-by-word highlight while a verse is read aloud.
     The paper is light, so the highlight is a gold wash behind dark text. */
  w: { padding: "0 .08em", borderRadius: 5, transition: "background .12s, color .12s, box-shadow .12s" } as CSSProperties,
  wOn: {
    background: "color-mix(in srgb, var(--gold) 38%, transparent)", color: "#000",
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--gold) 38%, transparent)",
  } as CSSProperties,

  /* cover: a rigid board that swings open (data-density="hard"), crimson all the way to the edge */
  coverPage: {
    background:
      "linear-gradient(to right, rgba(0,0,0,.35), transparent 30px), radial-gradient(80% 60% at 50% 100%, color-mix(in srgb, var(--bible) 60%, transparent), transparent 70%), color-mix(in srgb, var(--bible) 30%, var(--bg))",
    color: "var(--ink)",
  } as CSSProperties,
  cover: { position: "relative", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "40px 30px" } as CSSProperties,
  coverName: { fontFamily: DISPLAY, fontSize: "2.4rem", lineHeight: 1.15, color: "var(--gold)" } as CSSProperties,
  coverCh: { fontFamily: DISPLAY, fontSize: "1.5rem", marginTop: 14 } as CSSProperties,
  coverSub: { color: "var(--muted)", marginTop: 8, fontSize: ".82rem", letterSpacing: ".12em", textTransform: "uppercase" } as CSSProperties,

  /* family tree */
  tree: { display: "flex", flexDirection: "column", alignItems: "center", padding: "26px 0 0" } as CSSProperties,
  label: { margin: "0 0 10px", color: "var(--muted)", fontSize: ".72rem", letterSpacing: ".18em", textTransform: "uppercase" } as CSSProperties,
  couple: { display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 8 } as CSSProperties,
  contents: { display: "contents" } as CSSProperties,
  join: {
    width: 26, height: 26, flex: "none", borderRadius: "50%", border: `1px solid ${GOLD_LINE}`, color: "var(--gold)",
    display: "grid", placeItems: "center", fontSize: ".8rem", background: "var(--surface)",
  } as CSSProperties,
  stem: { width: 1, height: 26, background: GOLD_LINE } as CSSProperties,
  stub: { width: 1, height: 16, background: GOLD_LINE, margin: "0 auto" } as CSSProperties,
  scroller: { width: "100%", overflowX: "auto", paddingBottom: 6 } as CSSProperties,
  kids: { display: "flex", alignItems: "flex-start", width: "max-content", margin: "0 auto" } as CSSProperties,
  kid: { padding: "0 5px", backgroundRepeat: "no-repeat", backgroundImage: `linear-gradient(${GOLD_LINE}, ${GOLD_LINE})` } as CSSProperties,
  kidMid: { backgroundSize: "100% 1px", backgroundPosition: "0 0" } as CSSProperties,
  kidFirst: { backgroundSize: "50% 1px", backgroundPosition: "100% 0" } as CSSProperties,
  kidLast: { backgroundSize: "50% 1px", backgroundPosition: "0 0" } as CSSProperties,
  kidOnly: { backgroundImage: "none" } as CSSProperties,
  card: {
    display: "block", minWidth: 112, maxWidth: 156, padding: "10px 14px", textAlign: "center", borderRadius: 14,
    borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", background: "var(--surface)", transition: "border-color .15s, transform .15s",
  } as CSSProperties,
  cardM: { borderColor: "color-mix(in srgb, var(--gold) 55%, transparent)" } as CSSProperties,
  cardF: { borderColor: "color-mix(in srgb, var(--blossom) 55%, transparent)" } as CSSProperties,
  cardFocus: {
    cursor: "default", minWidth: 150, padding: "14px 20px", borderWidth: 2, borderColor: "var(--gold)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--bible) 30%, var(--surface)), var(--surface))",
    boxShadow: "0 8px 30px color-mix(in srgb, var(--bible) 40%, transparent)", transform: "none",
  } as CSSProperties,
  cardName: { display: "block", fontFamily: DISPLAY, fontSize: "1.05rem", lineHeight: 1.25 } as CSSProperties,
  cardNameFocus: { fontSize: "1.45rem" } as CSSProperties,
  cardYears: { display: "block", marginTop: 2, color: "var(--muted)", fontSize: ".72rem" } as CSSProperties,
  cardWith: { display: "block", marginTop: 2, color: "var(--bibleText)", fontSize: ".7rem" } as CSSProperties,
  empty: { color: "var(--muted)", padding: "28px 4px", textAlign: "center" } as CSSProperties,
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                             */
/* ------------------------------------------------------------------ */

const era = (y: number) => `${Math.abs(y)} ${y < 0 ? "BC" : "AD"}`;
function years(p: Person): string {
  const { born: b, died: d } = p;
  if (b === undefined && d === undefined) return "";
  if (b !== undefined && d !== undefined) {
    if (b < 0 === d < 0) return `${Math.abs(b)}–${era(d)}`;
    return `${era(b)} – ${era(d)}`;
  }
  return b !== undefined ? `b. ${era(b)}` : `d. ${era(d as number)}`;
}

/* ------------------------------------------------------------------ */

function hintFor(p: Person, byId: Map<string, Person>): string {
  const father = p.father ? byId.get(p.father) : undefined;
  const mother = p.mother ? byId.get(p.mother) : undefined;
  const partner = p.partners?.[0] ? byId.get(p.partners[0]) : undefined;
  const child = p.children?.[0] ? byId.get(p.children[0]) : undefined;
  const kid = p.gender === "F" ? "daughter" : p.gender === "M" ? "son" : "child";
  if (father) return `${kid} of ${father.name}`;
  if (mother) return `${kid} of ${mother.name}`;
  if (partner) return `${p.gender === "F" ? "wife" : p.gender === "M" ? "husband" : "partner"} of ${partner.name}`;
  if (child) return `parent of ${child.name}`;
  return "";
}

/* ------------------------------------------------------------------ */
/* ROUTES, kept in the URL hash:  #b43 = a book's chapters, #b43-3 = reading John 3, #pAdam_78 = a family tree */
/* ------------------------------------------------------------------ */
type Route = { k: "home" } | { k: "book"; b: number } | { k: "read"; b: number; c: number } | { k: "tree"; id: string };

function parseHash(byId: Map<string, Person>): Route {
  const h = window.location.hash;
  let m = h.match(/^#b(\d+)-(\d+)$/);
  if (m) {
    const book = BIBLE[Number(m[1]) - 1];
    const c = Number(m[2]);
    if (book && c >= 1 && c <= book.chapters.length) return { k: "read", b: book.id, c };
  }
  m = h.match(/^#b(\d+)$/);
  if (m && BIBLE[Number(m[1]) - 1]) return { k: "book", b: Number(m[1]) };
  m = h.match(/^#p([\w-]+)$/);
  if (m && byId.has(decodeURIComponent(m[1]))) return { k: "tree", id: decodeURIComponent(m[1]) };
  return { k: "home" };
}

const hashOf = (r: Route) => (r.k === "book" ? `#b${r.b}` : r.k === "read" ? `#b${r.b}-${r.c}` : r.k === "tree" ? `#p${r.id}` : "");

export default function Page() {
  return <BibleApp people={PEOPLE} books={BIBLE} />;
}

function BibleApp({ people, books }: { people: Person[]; books: Book[] }) {
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const [route, setRoute] = useState<Route>({ k: "home" });
  const [tab, setTab] = useState<"books" | "people">("books");

  useEffect(() => {
    const read = () => setRoute(parseHash(byId));
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [byId]);

  const go = (r: Route) => {
    window.history.pushState(null, "", r.k === "home" ? window.location.pathname : hashOf(r));
    setRoute(r);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const book = route.k === "book" || route.k === "read" ? books[route.b - 1] : undefined;
  const person = route.k === "tree" ? byId.get(route.id) : undefined;

  return (
    <div style={S.shell}>
      <style>{EXTRA_CSS}</style>
      <div style={S.glow} aria-hidden="true" />
      <div style={S.wrap}>
        {route.k === "read" && book ? (
          <Reader key={`${book.id}-${route.c}`} book={book} chapter={route.c} onBack={() => go({ k: "book", b: book.id })} />
        ) : route.k === "book" && book ? (
          <Chapters book={book} onPick={(c) => go({ k: "read", b: book.id, c })} onBack={() => go({ k: "home" })} />
        ) : person ? (
          <Tree key={person.id} person={person} byId={byId} onOpen={(id) => go({ k: "tree", id })} onBack={() => go({ k: "home" })} />
        ) : (
          <Home
            tab={tab}
            setTab={setTab}
            books={books}
            people={people}
            byId={byId}
            onBook={(b) => go({ k: "book", b })}
            onPerson={(id) => go({ k: "tree", id })}
          />
        )}
      </div>
    </div>
  );
}

/* HOME: Books or Family trees */

function Home({
  tab, setTab, books, people, byId, onBook, onPerson,
}: {
  tab: "books" | "people";
  setTab: (t: "books" | "people") => void;
  books: Book[];
  people: Person[];
  byId: Map<string, Person>;
  onBook: (b: number) => void;
  onPerson: (id: string) => void;
}) {
  return (
    <>
      <header style={S.hero}>
        <div style={S.logo}>
          <span style={S.logoGlyph} aria-hidden="true">✝</span>
        </div>
        <div>
          <h1 style={S.h1}>Bible</h1>
          <p style={S.tagline}>{tab === "books" ? "Choose a book to read" : "Choose a name to see their family tree"}</p>
        </div>
      </header>

      <div style={S.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "books"} style={{ ...S.tab, ...(tab === "books" ? S.tabOn : null) }} onClick={() => setTab("books")}>Books</button>
        <button type="button" role="tab" aria-selected={tab === "people"} style={{ ...S.tab, ...(tab === "people" ? S.tabOn : null) }} onClick={() => setTab("people")}>Family trees</button>
      </div>

      {tab === "books" ? <BookList books={books} onBook={onBook} /> : <PeopleList people={people} byId={byId} onOpen={onPerson} />}
    </>
  );
}

function ListRow({ badge, title, sub, tint, onClick }: { badge: string; title: string; sub?: string; tint?: string; onClick: () => void }) {
  return (
    <button type="button" className="brow" style={S.row} onClick={onClick}>
      {tint ? (
        <span style={{ ...S.miniCover, background: coverBg(tint) }}><i style={S.numI}>{badge}</i></span>
      ) : (
        <span className="bn" style={S.num}><i style={S.numI}>{badge}</i></span>
      )}
      <span>
        <span className="bnm" style={S.nm}>{title}</span>
        {sub && (
          <>
            <br />
            <span style={S.sub}>{sub}</span>
          </>
        )}
      </span>
      <span style={S.go} aria-hidden="true">→</span>
    </button>
  );
}

function BookList({ books, onBook }: { books: Book[]; onBook: (b: number) => void }) {
  return (
    <>
      {([["Old Testament", "old"], ["New Testament", "new"]] as const).map(([title, t]) => (
        <section key={t}>
          <div style={S.letter}>{title}</div>
          <ul style={S.list}>
            {books.filter((b) => b.testament === t).map((b) => (
              <li key={b.id}>
                <ListRow
                  badge={String(b.id)}
                  tint={coverOf(b.id).color}
                  title={b.name}
                  sub={`${b.chapters.length} ${b.chapters.length === 1 ? "chapter" : "chapters"}`}
                  onClick={() => onBook(b.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p style={S.credit}>King James Version (public domain).</p>
    </>
  );
}

function PeopleList({ people, byId, onOpen }: { people: Person[]; byId: Map<string, Person>; onOpen: (id: string) => void }) {
  const listed = useMemo(() => people.filter((p) => p.mentions >= MIN_MENTIONS).sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const dupes = useMemo(() => {
    const n = new Map<string, number>();
    listed.forEach((p) => n.set(p.name, (n.get(p.name) ?? 0) + 1));
    return n;
  }, [listed]);

  return (
    <>
      <ul style={S.list}>
        {listed.map((p, i) => {
          const first = i === 0 || listed[i - 1].name[0].toUpperCase() !== p.name[0].toUpperCase();
          const hint = (dupes.get(p.name) ?? 0) > 1 ? hintFor(p, byId) : "";
          return (
            <li key={p.id}>
              {first && <div style={S.letter} aria-hidden="true">{p.name[0].toUpperCase()}</div>}
              <ListRow badge={p.name[0].toUpperCase()} title={p.name} sub={[hint, years(p)].filter(Boolean).join(" · ")} onClick={() => onOpen(p.id)} />
            </li>
          );
        })}
      </ul>
      <p style={S.credit}>Family data: Theographic Bible Metadata (CC BY-SA 4.0). Dates are approximate.</p>
    </>
  );
}

/* CHAPTERS: pick a chapter of one book */

function Chapters({ book, onPick, onBack }: { book: Book; onPick: (c: number) => void; onBack: () => void }) {
  const n = book.chapters.length;
  return (
    <>
      <div style={S.bar}>
        <button type="button" style={S.ib} onClick={onBack} aria-label="All books">←</button>
        <div style={S.title}>
          {book.name}
          <small style={S.titleSmall}>{n} {n === 1 ? "chapter" : "chapters"}</small>
        </div>
        <span style={S.ibGhost} aria-hidden="true" />
      </div>
      <div style={{ ...S.bigCover, background: coverBg(coverOf(book.id).color) }}>
        <div style={S.bigCoverName}>{book.name}</div>
        <div style={S.ornament} />
        <div style={S.bigCoverGroup}>{coverOf(book.id).group}</div>
      </div>
      <p style={S.chapHint}>Choose a chapter</p>
      <div style={S.chapters}>
        {book.chapters.map((_, i) => (
          <button key={i} type="button" className="bchap" style={S.chap} onClick={() => onPick(i + 1)}>{i + 1}</button>
        ))}
      </div>
    </>
  );
}

/* READER: one verse per page, with the page-curl, same as the Quran.
   Listen reads verse by verse, lights up each word as it is spoken, and turns the page between verses. */

const ReaderCtx = createContext({ current: 0, speakingVerse: -1, activeWord: -1 });
const WINDOW = 3; // only pages this close to the current one mount their text
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]; // reading speeds offered in the dropdown

/* Pick the most refined-sounding English voice the device has.
   Every voice is scored, and the best one wins:
   - premium / enhanced / natural / neural voices are the human-sounding ones
   - warm British voices (Serena, Daniel, Kate, Arthur, Sonia, Ryan...) beat the rest, which suits the KJV
   - novelty and robotic voices are ruled out
   - on-device voices get a small bonus, because they send the word-by-word events */
const BAD_VOICES = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|eddy|flo\b|grandma|grandpa|reed|rocko|sandy|shelley|espeak|robot/i;
const WARM_GB = /serena|daniel|kate|arthur|oliver|stephanie|martha|sonia|ryan|libby|maisie|thomas/i;
const WARM_US = /samantha|ava|allison|susan|zoe|evan|nathan|jenny|aria|guy/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  const label = `${v.name} ${v.voiceURI}`;
  const lang = v.lang.toLowerCase().replace("_", "-");
  if (!lang.startsWith("en") || BAD_VOICES.test(label)) return -1000;

  let s = 0;
  if (lang === "en-gb") s += 40;
  else if (lang === "en-us") s += 20;
  else if (lang === "en-au" || lang === "en-ie") s += 15;

  if (/premium|enhanced|natural|neural|studio/i.test(label)) s += 60;
  if (/compact/i.test(label)) s -= 25;
  if (lang === "en-gb" ? WARM_GB.test(label) : WARM_US.test(label)) s += 35;
  if (/google/i.test(label)) s += 10; // decent quality, but a network voice (word events may be estimated)
  if (v.localService) s += 20;
  return s;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const ranked = window.speechSynthesis
    .getVoices()
    .map((v) => ({ v, s: scoreVoice(v) }))
    .filter((x) => x.s > -1000)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.v;
}

/* Verse text. Reads from context, because the flipbook doesn't re-render its children. */
function VerseText({ text, index }: { text: string; index: number }) {
  const { speakingVerse, activeWord } = useContext(ReaderCtx);
  if (speakingVerse !== index) return <p style={S.vText}>{text}</p>;
  let w = -1;
  return (
    <p style={S.vText}>
      {text.split(/(\s+)/).map((t, k) => {
        if (!t || /^\s+$/.test(t)) return t;
        w++;
        return <span key={k} style={{ ...S.w, ...(w === activeWord ? S.wOn : null) }}>{t}</span>;
      })}
    </p>
  );
}

const FlipPage = forwardRef<
  HTMLDivElement,
  { index: number; children: ReactNode; density?: "hard" | "soft"; pageStyle?: CSSProperties; contentStyle?: CSSProperties; contentClass?: string }
>(({ index, children, density = "soft", pageStyle, contentStyle, contentClass }, ref) => {
  const { current } = useContext(ReaderCtx);
  const near = Math.abs(index - current) <= WINDOW;
  return (
    /* The flipbook library rewrites the outer element's inline style on every frame, which wipes
       any colours set on it. So the outer div stays bare and the paper lives on an inner div. */
    <div ref={ref} data-density={density}>
      <div style={{ ...S.page, width: "100%", height: "100%", ...pageStyle }}>
        <div className={`bpc${contentClass ? ` ${contentClass}` : ""}`} style={{ ...S.pageContent, ...contentStyle }}>{near ? children : null}</div>
      </div>
    </div>
  );
});
FlipPage.displayName = "FlipPage";

function Reader({ book, chapter, onBack }: { book: Book; chapter: number; onBack: () => void }) {
  const [current, setCurrent] = useState(0);
  const verses = book.chapters[chapter - 1];

  /* read-aloud state */
  const [speaking, setSpeaking] = useState(false);
  const [speakingVerse, setSpeakingVerse] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1);
  const [rate, setRate] = useState(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipRef = useRef<any>(null);
  const session = useRef(0);          // bumped on every start/stop so stale callbacks ignore themselves
  const timers = useRef<number[]>([]);
  const expected = useRef(-1);        // the page we expect to be on; a different page means a manual swipe
  const rateRef = useRef(1);
  const speakingRef = useRef(false);
  const pageRef = useRef(0);          // the page we're on, kept current even between renders (0 = cover)

  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const stop = () => {
    session.current++;
    clearTimers();
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingVerse(-1);
    setActiveWord(-1);
  };

  const speakVerse = (i: number) => {
    const synth = window.speechSynthesis;
    const token = ++session.current;
    clearTimers();
    synth.cancel();
    if (i >= verses.length) return stop();

    const text = verses[i];
    const starts = [...text.matchAll(/\S+/g)].map((m) => m.index ?? 0);
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else u.lang = "en-GB";
    u.rate = rateRef.current;

    let gotBoundary = false;
    let t0 = Date.now();

    u.onstart = () => {
      t0 = Date.now();
      /* fallback: if the browser sends no word events, estimate the timing by word length */
      timers.current.push(
        window.setTimeout(() => {
          if (gotBoundary || token !== session.current) return;
          const total = (text.length * 70) / rateRef.current;
          starts.forEach((s, k) => {
            const delay = Math.max(0, (s / text.length) * total - (Date.now() - t0));
            timers.current.push(
              window.setTimeout(() => {
                if (!gotBoundary && token === session.current) setActiveWord(k);
              }, delay)
            );
          });
        }, 1000)
      );
    };

    u.onboundary = (e) => {
      if (token !== session.current) return;
      gotBoundary = true;
      let w = 0;
      while (w + 1 < starts.length && starts[w + 1] <= e.charIndex) w++;
      setActiveWord(w);
    };

    u.onend = () => {
      if (token !== session.current) return;
      const next = i + 1;
      if (next >= verses.length) return stop();
      expected.current = next + 1;
      flipRef.current?.pageFlip()?.flipNext();
      timers.current.push(
        window.setTimeout(() => {
          if (token === session.current) speakVerse(next);
        }, 450)
      );
    };

    u.onerror = () => {
      if (token === session.current) stop();
    };

    setSpeakingVerse(i);
    setActiveWord(0);
    synth.speak(u);
  };

  const listen = () => {
    if (speakingRef.current) return stop();
    speakingRef.current = true;
    setSpeaking(true);
    if (current < 1) {
      /* on the cover: open it and start verse 1 */
      expected.current = 1;
      flipRef.current?.pageFlip()?.flipNext();
      speakVerse(0);
    } else {
      /* otherwise start from the page you're on */
      expected.current = current;
      speakVerse(current - 1);
    }
  };

  /* previous / next verse: turn the page and start reading that verse right away */
  const skip = (dir: 1 | -1) => {
    const from = pageRef.current;
    if (from < 1 && dir < 0) return;                 // nothing before the cover
    const target = from + dir;
    if (target < 1 || target > verses.length) return; // already at the first or last verse
    expected.current = target;
    pageRef.current = target;
    const flip = flipRef.current?.pageFlip();
    if (dir > 0) flip?.flipNext();
    else flip?.flipPrev();
    speakingRef.current = true;
    setSpeaking(true);
    speakVerse(target - 1);
  };

  const changeRate = (next: number) => {
    rateRef.current = next;
    setRate(next);
    /* if it's reading right now, restart the current verse at the new speed */
    if (speakingRef.current && expected.current >= 1) speakVerse(expected.current - 1);
  };

  useEffect(() => {
    window.speechSynthesis?.getVoices(); // nudges Chrome to load its voice list
    return () => {
      /* leaving the chapter silences the voice */
      session.current++;
      timers.current.forEach(clearTimeout);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const prevOff = current <= 1;
  const nextOff = current >= verses.length;

  return (
    <>
      <div style={S.bar}>
        <button type="button" style={S.ib} onClick={onBack} aria-label={`${book.name} chapters`}>←</button>
        <div style={S.title}>
          {book.name} {chapter}
          <small style={S.titleSmall}>{verses.length} verses</small>
        </div>
        {canSpeak ? (
          <div style={S.tools}>
            <select
              className="bspeed"
              style={{ ...S.ib, ...S.speed }}
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              aria-label="Reading speed"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
            <button type="button" style={{ ...S.ib, ...S.toolBtn, ...(prevOff ? S.toolOff : null) }} onClick={() => skip(-1)} disabled={prevOff} aria-label="Previous verse">‹</button>
            <button type="button" style={{ ...S.ib, ...S.toolBtn }} onClick={listen} aria-label={speaking ? "Stop reading" : "Listen"}>
              {speaking ? "■" : "▶"}
            </button>
            <button type="button" style={{ ...S.ib, ...S.toolBtn, ...(nextOff ? S.toolOff : null) }} onClick={() => skip(1)} disabled={nextOff} aria-label="Next verse">›</button>
          </div>
        ) : (
          <span style={S.ibGhost} aria-hidden="true" />
        )}
      </div>

      <div style={S.book}>
        <ReaderCtx.Provider value={{ current, speakingVerse, activeWord }}>
          {/* tap or drag a page to turn it */}
          <HTMLFlipBook
            flipRef={flipRef}
            key={`${book.id}-${chapter}`}
            width={370}
            height={560}
            size="stretch"
            minWidth={280}
            maxWidth={520}
            minHeight={420}
            maxHeight={780}
            maxShadowOpacity={0.4}
            drawShadow={true}
            showCover={true}
            usePortrait={true}
            mobileScrollSupport={true}
            style={S.flip}
            startPage={0}
            flippingTime={900}
            startZIndex={0}
            autoSize={true}
            clickEventForward={true}
            useMouseEvents={true}
            swipeDistance={30}
            showPageCorners={true}
            disableFlipByClick={false}
            renderOnlyPageLengthChange={true}
            onFlip={(e: { data: number }) => {
              setCurrent(e.data);
              pageRef.current = e.data;
              /* a page change we didn't cause means the person swiped: follow them */
              if (speakingRef.current && e.data !== expected.current) {
                if (e.data >= 1) {
                  expected.current = e.data;
                  speakVerse(e.data - 1);
                } else stop();
              }
            }}
          >
            <FlipPage index={0} density="hard" pageStyle={{ ...S.coverPage, background: coverBg(coverOf(book.id).color) }} contentStyle={S.cover} contentClass="bcover">
              <div style={S.coverName}>{book.name}</div>
              <div style={S.ornament} />
              <div style={S.coverCh}>Chapter {chapter}</div>
              <div style={S.coverSub}>{coverOf(book.id).group} · King James Version 2 dbgdgdgddhd</div>
            </FlipPage>

            {verses.map((text, i) => (
              <FlipPage key={i} index={i + 1}>
                <div style={S.verse}>
                  <VerseText text={text} index={i} />
                  <div style={S.vRef}>
                    <span style={S.vn}>{i + 1}</span>
                    {book.name} {chapter}:{i + 1}
                  </div>
                </div>
              </FlipPage>
            ))}
          </HTMLFlipBook>
        </ReaderCtx.Provider>
      </div>
    </>
  );
}

/* FAMILY TREE: parents above, the person and their partners in the middle, children below.
   Tap anyone to move the tree to them. */

function PersonCard({ person, focus = false, note, onOpen }: { person: Person; focus?: boolean; note?: string; onOpen?: (id: string) => void }) {
  const style: CSSProperties = {
    ...S.card,
    ...(person.gender === "M" ? S.cardM : null),
    ...(person.gender === "F" ? S.cardF : null),
    ...(focus ? S.cardFocus : null),
  };
  const body = (
    <>
      <span style={{ ...S.cardName, ...(focus ? S.cardNameFocus : null) }}>{person.name}</span>
      {years(person) && <span style={S.cardYears}>{years(person)}</span>}
      {note && <span style={S.cardWith}>{note}</span>}
    </>
  );
  if (focus) return <div className="bcard bfocus" style={style} aria-current="true">{body}</div>;
  return <button type="button" className="bcard" style={style} onClick={() => onOpen?.(person.id)}>{body}</button>;
}

function Tree({ person, byId, onOpen, onBack }: { person: Person; byId: Map<string, Person>; onOpen: (id: string) => void; onBack: () => void }) {
  const get = (id?: string) => (id ? byId.get(id) : undefined);
  const parents = [get(person.father), get(person.mother)].filter((p): p is Person => !!p);
  const partners = (person.partners ?? []).map(get).filter((p): p is Person => !!p);
  /* oldest first when birth years are known; unknown years keep their order at the end */
  const children = (person.children ?? [])
    .map(get)
    .filter((p): p is Person => !!p)
    .sort((a, b) => (a.born ?? Infinity) - (b.born ?? Infinity));

  /* with several partners, say which one each child was born to */
  const withWhom = (child: Person) => {
    if (partners.length < 2) return undefined;
    const other = get(child.father === person.id ? child.mother : child.father);
    return other ? `with ${other.name}` : undefined;
  };

  const kidStyle = (i: number, n: number): CSSProperties => ({
    ...S.kid,
    ...(n === 1 ? S.kidOnly : i === 0 ? S.kidFirst : i === n - 1 ? S.kidLast : S.kidMid),
  });

  return (
    <>
      <div style={S.bar}>
        <button type="button" style={S.ib} onClick={onBack} aria-label="All people">←</button>
        <div style={S.title}>
          {person.name}
          <small style={S.titleSmall}>{years(person) || "Family tree"}</small>
        </div>
        <span style={S.ibGhost} aria-hidden="true" />
      </div>

      <div style={S.tree}>
        {parents.length > 0 && (
          <>
            <p style={S.label}>Parents</p>
            <div style={S.couple}>
              {parents.map((p, i) => (
                <div key={p.id} style={S.contents}>
                  {i > 0 && <span style={S.join} aria-hidden="true">+</span>}
                  <PersonCard person={p} onOpen={onOpen} />
                </div>
              ))}
            </div>
            <div style={S.stem} />
          </>
        )}

        <div style={S.couple}>
          <PersonCard person={person} focus />
          {partners.map((p) => (
            <div key={p.id} style={S.contents}>
              <span style={S.join} aria-hidden="true">+</span>
              <PersonCard person={p} onOpen={onOpen} />
            </div>
          ))}
        </div>

        {children.length > 0 && (
          <>
            <div style={S.stem} />
            <p style={S.label}>{children.length === 1 ? "Child" : `Children · ${children.length}`}</p>
            <div style={S.scroller}>
              <div style={S.kids}>
                {children.map((c, i) => (
                  <div key={c.id} style={kidStyle(i, children.length)}>
                    <div style={S.stub} />
                    <PersonCard person={c} note={withWhom(c)} onOpen={onOpen} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {parents.length === 0 && partners.length === 0 && children.length === 0 && <p style={S.empty}>No family is recorded for this person.</p>}
      </div>
    </>
  );
}