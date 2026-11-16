import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import NavigationBar from "./components/NavigationBar";
import TitleTabBar, { BrowserTab } from "./components/TitleTabBar";

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
  const [loadingByTab, setLoadingByTab] = useState<Record<string, boolean>>({});
  const nextId = useRef(1);

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const activeLoading = activeId ? Boolean(loadingByTab[activeId]) : false;

  const handleError = useCallback((message: string) => setError(message), []);

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

  async function runHistoryAction(action: "goBack" | "goForward" | "reload" | "stop") {
    if (!activeId) return;
    try {
      await invoke("history_tab", { tabId: activeId, action });
      if (action === "stop") {
        setLoadingByTab((current) => ({ ...current, [activeId]: false }));
      }
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<string>("tab-load-state", (event) => {
      const [tabId, loading] = event.payload.split("|");
      if (!tabId) return;
      setLoadingByTab((current) => ({ ...current, [tabId]: loading === "true" }));
    }).then((stopListening) => {
      if (cancelled) {
        stopListening();
      } else {
        unlisten = stopListening;
      }
    }).then(() => {
      if (!cancelled) {
        void createTab();
      }
    }).catch((reason) => setError(String(reason)));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <header className="flex h-[84px] w-full flex-col overflow-hidden text-[var(--text-primary)]">
      <TitleTabBar
        tabs={tabs}
        activeId={activeId}
        onActivate={(tab) => void activateTab(tab).catch((reason) => setError(String(reason)))}
        onClose={(tabId) => void closeTab(tabId)}
        onCreate={() => void createTab()}
        onError={handleError}
      />
      <NavigationBar
        address={address}
        activeId={activeId}
        loading={activeLoading}
        error={error}
        onAddressChange={setAddress}
        onSubmit={navigate}
        onHistoryAction={(action) => void runHistoryAction(action)}
      />
      {activeTab && <span className="sr-only">{activeTab.title}</span>}
    </header>
  );
}

export default App;
