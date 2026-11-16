import { ArrowDown, ArrowUp, Globe, Plus, Search, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { isNewTabUrl, resolveAddress } from "../utils/address";
import DrootheLogo from "./DrootheLogo";

type PinnedSite = {
  id: string;
  name: string;
  url: string;
};

type NewTabViewProps = {
  onNavigate: (url: string) => void;
  onError: (message: string) => void;
};

const STORAGE_KEY = "droothe_pinned_sites";
const DEFAULT_SITES: PinnedSite[] = [
  { id: "github", name: "GitHub", url: "https://github.com" },
  { id: "vercel", name: "Vercel", url: "https://vercel.com" },
  { id: "supabase", name: "Supabase", url: "https://supabase.com/dashboard" },
  { id: "chatgpt", name: "ChatGPT / AI", url: "https://chatgpt.com" },
  { id: "youtube", name: "YouTube", url: "https://youtube.com" },
  { id: "droothe-design", name: "Droothe Design", url: "https://droothedesign.com.tr" },
];

function isPinnedSite(value: unknown): value is PinnedSite {
  if (!value || typeof value !== "object") return false;
  const site = value as Record<string, unknown>;
  if (typeof site.id !== "string" || typeof site.name !== "string" || typeof site.url !== "string") {
    return false;
  }
  try {
    return ["http:", "https:"].includes(new URL(site.url).protocol);
  } catch {
    return false;
  }
}

function loadPinnedSites(): PinnedSite[] {
  let storedSites: string | null;
  try {
    storedSites = window.localStorage.getItem(STORAGE_KEY);
  } catch (reason) {
    console.error("Could not read pinned sites.", reason);
    return DEFAULT_SITES;
  }
  if (storedSites === null) return DEFAULT_SITES;

  try {
    const parsed: unknown = JSON.parse(storedSites);
    if (!Array.isArray(parsed) || !parsed.every(isPinnedSite)) {
      throw new Error("Saved shortcuts have an invalid format.");
    }
    return parsed;
  } catch (reason) {
    console.error("Could not load pinned sites.", reason);
    return DEFAULT_SITES;
  }
}

function SiteFavicon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  let faviconUrl = "";

  try {
    const domain = new URL(url).hostname;
    faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  } catch {
    faviconUrl = "";
  }

  if (failed || !faviconUrl) {
    return <Globe size={22} strokeWidth={1.7} className="text-[var(--text-secondary)]" />;
  }

  return (
    <img
      src={faviconUrl}
      alt={`${name} favicon`}
      className="h-6 w-6 rounded-md"
      onError={() => setFailed(true)}
    />
  );
}

function normalizeSiteUrl(input: string): string {
  const value = input.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error("Only HTTP and HTTPS shortcuts are supported.");
  }
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS shortcuts are supported.");
  }
  return url.toString();
}

export default function NewTabView({ onNavigate, onError }: NewTabViewProps) {
  const [sites, setSites] = useState<PinnedSite[]>(loadPinnedSites);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    } catch (reason) {
      onError(`Could not save pinned sites: ${String(reason)}`);
    }
  }, [sites, onError]);

  useEffect(() => {
    if (document.activeElement?.hasAttribute("data-omnibox")) return;
    searchRef.current?.focus();
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const target = resolveAddress(value);
    if (isNewTabUrl(target)) return;
    onNavigate(target);
  }

  function removeSite(id: string) {
    setSites((current) => current.filter((site) => site.id !== id));
  }

  function moveSite(index: number, direction: -1 | 1) {
    setSites((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const rawUrl = String(formData.get("url") ?? "").trim();
    if (!name || !rawUrl) {
      setFormError("Enter both a name and a URL.");
      return;
    }

    try {
      const url = normalizeSiteUrl(rawUrl);
      setSites((current) => [
        ...current,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, url },
      ]);
      setFormError("");
      setAddOpen(false);
    } catch (reason) {
      setFormError(String(reason));
    }
  }

  const hour = now.getHours();
  const greeting =
    hour >= 6 && hour < 12
      ? "Günaydın Yavuz, bugün ne inşa ediyoruz?"
      : hour >= 12 && hour < 18
        ? "İyi çalışmalar Yavuz, odak modundasın."
        : hour >= 18
          ? "İyi akşamlar Yavuz, mesai devam ediyor."
          : "Gece mesaisi başladı Yavuz, kahveni aldın mı?";
  const time = now.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = now.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  return (
    <main className="relative flex h-full w-full flex-col items-center overflow-y-auto bg-[var(--bg-shell)] px-5 pt-[min(10vh,80px)]">
      <p className="mb-4 text-center text-sm font-medium text-[var(--text-secondary)] sm:text-base">
        {greeting}
      </p>

      <div className="mb-8 flex flex-col items-center">
        <time
          dateTime={now.toISOString()}
          className="font-mono text-5xl font-medium tabular-nums tracking-tight text-[var(--text-primary)]"
        >
          {time}
        </time>
        <p className="mt-1 text-sm capitalize text-[var(--text-secondary)]">{date}</p>
      </div>

      <div className="mb-7 flex items-center gap-2.5">
        <DrootheLogo size={40} />
        <span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Droothe<span className="text-[var(--accent-primary)]">.</span>
        </span>
      </div>

      <form className="w-full max-w-xl" onSubmit={submitSearch}>
        <div className="flex h-14 w-full items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-omnibox)] px-4 transition duration-150 focus-within:border-[var(--accent-primary)] focus-within:ring-2 focus-within:ring-[var(--accent-glow)]">
          <Search size={19} className="shrink-0 text-[var(--text-secondary)]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Google'da ara veya bir URL yaz..."
            aria-label="Google'da ara veya bir URL yaz"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <span className="hidden rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[10px] text-[var(--text-muted)] sm:inline">
            Google
          </span>
        </div>
      </form>

      <div className="mt-8 grid w-full max-w-xl grid-cols-4 gap-3 sm:grid-cols-5">
        {sites.map((site, index) => (
          <div
            key={site.id}
            className="group relative min-w-0"
          >
            <button
              type="button"
              onClick={() => onNavigate(site.url)}
              title={site.url}
              className="flex min-h-[104px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-4 transition-colors duration-150 hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-hover)]"
            >
              <SiteFavicon key={site.url} url={site.url} name={site.name} />
              <span className="w-full truncate text-center text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                {site.name}
              </span>
            </button>
            <div className="pointer-events-none absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
              <button
                type="button"
                aria-label={`Move ${site.name} up`}
                title="Move up"
                disabled={index === 0}
                onClick={() => moveSite(index, -1)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-shell)]/90 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:hidden"
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                aria-label={`Move ${site.name} down`}
                title="Move down"
                disabled={index === sites.length - 1}
                onClick={() => moveSite(index, 1)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-shell)]/90 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:hidden"
              >
                <ArrowDown size={12} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${site.name}`}
                title="Remove shortcut"
                onClick={() => removeSite(site.id)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-shell)]/90 text-[var(--text-secondary)] hover:bg-rose-500 hover:text-white"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => {
            setFormError("");
            setAddOpen(true);
          }}
          className="flex min-h-[104px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-transparent px-2 py-4 text-[var(--text-muted)] transition-colors hover:border-[var(--accent-primary)]/60 hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current">
            <Plus size={14} />
          </span>
          <span className="text-xs font-medium">Ekle</span>
        </button>
      </div>

      {addOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-shortcut-title"
            onSubmit={addSite}
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="add-shortcut-title" className="text-sm font-semibold text-[var(--text-primary)]">
                Add shortcut
              </h2>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setAddOpen(false)}
                className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mb-3 block text-xs text-[var(--text-secondary)]">
              Name
              <input
                name="name"
                autoFocus
                maxLength={40}
                className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-omnibox)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>
            <label className="mb-4 block text-xs text-[var(--text-secondary)]">
              URL
              <input
                name="url"
                type="text"
                maxLength={2048}
                placeholder="https://example.com"
                className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-omnibox)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </label>
            {formError && <p className="mb-3 text-xs text-rose-400">{formError}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-[var(--accent-primary)] px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add shortcut
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
