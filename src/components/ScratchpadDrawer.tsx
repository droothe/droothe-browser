import { Check, Clipboard, FilePlus2, StickyNote, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ScratchpadSlot = 0 | 1 | 2;
type ScratchpadNotes = [string, string, string];
type SaveStatus = "saving" | "saved" | "error";

type ScratchpadDrawerProps = {
  currentPage: { title: string; url: string } | null;
  onClose: () => void;
  onError: (message: string) => void;
};

const STORAGE_KEY = "droothe_scratchpad_notes";
const SLOT_LABELS = ["Not 1", "Not 2", "Kod / Komut"];

function isScratchpadNotes(value: unknown): value is ScratchpadNotes {
  return (
    Array.isArray(value) &&
    value.length === SLOT_LABELS.length &&
    value.every((note): note is string => typeof note === "string")
  );
}

export default function ScratchpadDrawer({
  currentPage,
  onClose,
  onError,
}: ScratchpadDrawerProps) {
  const [notes, setNotes] = useState<ScratchpadNotes>(["", "", ""]);
  const [activeSlot, setActiveSlot] = useState<ScratchpadSlot>(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (!isScratchpadNotes(parsed)) {
          throw new Error("Saved scratchpad notes have an invalid format.");
        }
        setNotes(parsed);
      }
    } catch (reason) {
      onError(`Could not load scratchpad notes: ${String(reason)}`);
    }
    textareaRef.current?.focus();
  }, [onError]);

  useEffect(() => {
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        setSaveStatus("saved");
      } catch (reason) {
        setSaveStatus("error");
        onError(`Could not save scratchpad notes: ${String(reason)}`);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [notes, onError]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function updateActiveNote(value: string) {
    setNotes((current) => {
      const next: ScratchpadNotes = [current[0], current[1], current[2]];
      next[activeSlot] = value;
      return next;
    });
  }

  function addCurrentPage() {
    if (!currentPage) return;
    const pageLink = `[${currentPage.title}](${currentPage.url})`;
    updateActiveNote(notes[activeSlot] ? `${notes[activeSlot]}\n${pageLink}` : pageLink);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }

  async function copyAll() {
    const content = notes
      .map((note, index) => `## ${SLOT_LABELS[index]}\n${note}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch (reason) {
      onError(`Could not copy scratchpad notes: ${String(reason)}`);
    }
  }

  return (
    <aside
      aria-label="Hızlı Notlar"
      className="absolute bottom-0 right-0 top-[84px] z-30 flex w-[360px] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <StickyNote size={16} className="text-[var(--accent-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Hızlı Notlar</h2>
          <kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            "
          </kbd>
        </div>
        <button
          type="button"
          aria-label="Close scratchpad"
          title="Close"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <button
          type="button"
          disabled={!currentPage}
          onClick={addCurrentPage}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/50 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FilePlus2 size={14} className="shrink-0" />
          <span className="truncate">+ Geçerli Sayfayı Ekle</span>
        </button>
        <button
          type="button"
          onClick={() => void copyAll()}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Clipboard size={14} />}
          {copied ? "Kopyalandı" : "Copy All"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)] px-3 pt-2">
        {SLOT_LABELS.map((label, index) => {
          const slot = index as ScratchpadSlot;
          const active = activeSlot === slot;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveSlot(slot)}
              className={`rounded-t-lg border-b-2 px-3 py-2 text-xs transition-colors ${
                active
                  ? "border-[var(--accent-primary)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <textarea
        ref={textareaRef}
        value={notes[activeSlot]}
        onChange={(event) => updateActiveNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        aria-label={SLOT_LABELS[activeSlot]}
        placeholder="Hızlıca not al..."
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:font-sans placeholder:text-[var(--text-muted)]"
      />

      <footer className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2.5 text-[11px] text-[var(--text-muted)]">
        <span>
          {saveStatus === "saving"
            ? "Kaydediliyor..."
            : saveStatus === "error"
              ? "Kaydedilemedi"
              : "Kaydedildi"}
        </span>
        <span>{notes[activeSlot].length} karakter</span>
      </footer>
    </aside>
  );
}
