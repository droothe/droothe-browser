import { invoke } from "@tauri-apps/api/core";
import { FormEvent, useEffect, useRef, useState } from "react";

type BrowserTab = {
  id: string;
  title: string;
  url: string;
};

const HOME_URL = "https://duckduckgo.com";

function resolveAddress(input: string): string {
  const value = input.trim();
  if (!value) return HOME_URL;

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(value) || value.startsWith("localhost")) {
    return `https://${value}`;
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

function App() {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const nextId = useRef(1);

  const activeTab = tabs.find((tab) => tab.id === activeId);

  async function activateTab(tab: BrowserTab) {
    setError("");
    setActiveId(tab.id);
    setAddress(tab.url);
    await invoke("open_tab", { tabId: tab.id, url: tab.url });
  }

  async function createTab() {
    const tab: BrowserTab = {
      id: String(nextId.current++),
      title: "Yeni sekme",
      url: HOME_URL,
    };
    setTabs((current) => [...current, tab]);
    try {
      await activateTab(tab);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function closeTab(tabId: string) {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const remaining = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remaining);

    try {
      await invoke("close_tab", { tabId });
      if (activeId === tabId) {
        const nextTab = remaining[Math.max(0, index - 1)];
        if (nextTab) {
          await activateTab(nextTab);
        } else {
          setActiveId(null);
          setAddress("");
          await createTab();
        }
      }
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function navigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeId) return;

    const url = resolveAddress(address);
    setAddress(url);
    setTabs((current) =>
      current.map((tab) => (tab.id === activeId ? { ...tab, url, title: url } : tab)),
    );
    setError("");
    try {
      await invoke("navigate_tab", { tabId: activeId, url });
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function runHistoryAction(action: "goBack" | "goForward" | "reload") {
    if (!activeId) return;
    try {
      await invoke("history_tab", { tabId: activeId, action });
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  }

  useEffect(() => {
    void createTab();
  }, []);

  return (
    <header className="flex h-[76px] w-full flex-col overflow-hidden border-b border-slate-800 bg-browser-base text-slate-100">
      <div className="flex h-9 min-h-9 items-center gap-1 border-b border-slate-800/80 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex h-7 max-w-52 min-w-28 cursor-pointer items-center gap-2 rounded-t-md border px-3 text-xs transition ${
                activeId === tab.id
                  ? "border-slate-700 border-b-browser-indigo bg-browser-panel text-white"
                  : "border-transparent text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
              onClick={() => void activateTab(tab).catch((reason) => setError(String(reason)))}
              title={tab.url}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-browser-cyan" />
              <span className="truncate">{tab.title}</span>
              <button
                type="button"
                aria-label="Sekmeyi kapat"
                className="ml-auto rounded px-1 text-slate-500 hover:bg-slate-700 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label="Yeni sekme"
          onClick={() => void createTab()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          +
        </button>
      </div>

      <form className="flex h-10 min-h-10 items-center gap-2 px-3" onSubmit={navigate}>
        <div className="flex items-center gap-1">
          <ToolbarButton label="Geri" onClick={() => void runHistoryAction("goBack")}>
            ←
          </ToolbarButton>
          <ToolbarButton label="İleri" onClick={() => void runHistoryAction("goForward")}>
            →
          </ToolbarButton>
          <ToolbarButton label="Yenile" onClick={() => void runHistoryAction("reload")}>
            ↻
          </ToolbarButton>
        </div>
        <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-slate-700 bg-browser-panel px-3 transition focus-within:border-browser-indigo focus-within:ring-1 focus-within:ring-browser-indigo/40">
          <span className="mr-2 text-[10px] text-browser-cyan">●</span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Adres veya arama girin"
            aria-label="Adres veya arama"
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
          />
          {error && (
            <span className="ml-2 max-w-56 truncate text-[10px] text-rose-400" title={error}>
              {error}
            </span>
          )}
        </div>
        <span className="hidden max-w-32 truncate text-[10px] text-slate-500 sm:block">
          {activeTab?.title ?? "Droothe"}
        </span>
      </form>
    </header>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
}: {
  children: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-base text-slate-400 transition hover:bg-slate-800 hover:text-white"
    >
      {children}
    </button>
  );
}

export default App;
