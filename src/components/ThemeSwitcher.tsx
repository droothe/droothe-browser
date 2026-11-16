import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { browserThemes, useBrowserTheme } from "../theme/BrowserThemeContext";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useBrowserTheme();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function dismissPopover(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", dismissPopover);
    return () => document.removeEventListener("pointerdown", dismissPopover);
  }, []);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        aria-label="Change theme"
        aria-expanded={open}
        title="Change theme"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Palette size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-2xl">
          {browserThemes.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setTheme(option.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              {option.label}
              {theme === option.id && <Check size={14} className="text-[var(--accent-primary)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
