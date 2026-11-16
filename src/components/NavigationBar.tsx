import {
  ArrowLeft,
  ArrowRight,
  Info,
  KeyRound,
  RotateCw,
  Settings,
  ShieldCheck,
  StickyNote,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, RefObject } from "react";
import ThemeSwitcher from "./ThemeSwitcher";

type NavigationBarProps = {
  address: string;
  addressInputRef: RefObject<HTMLInputElement | null>;
  activeId: string | null;
  isNewTab: boolean;
  loading: boolean;
  scratchpadOpen: boolean;
  error: string;
  onAddressChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onHistoryAction: (action: "goBack" | "goForward" | "reload" | "stop") => void;
  onToggleScratchpad: () => void;
};

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:text-[var(--text-muted)] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export default function NavigationBar({
  address,
  addressInputRef,
  activeId,
  isNewTab,
  loading,
  scratchpadOpen,
  error,
  onAddressChange,
  onSubmit,
  onHistoryAction,
  onToggleScratchpad,
}: NavigationBarProps) {
  const isSecure = address.trim().toLowerCase().startsWith("https://");

  return (
    <div className="relative h-11 min-h-11 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <form className="flex h-full items-center gap-3 px-3" onSubmit={onSubmit}>
        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarButton
            label="Back"
            disabled={!activeId || isNewTab}
            onClick={() => onHistoryAction("goBack")}
          >
            <ArrowLeft size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="Forward"
            disabled={!activeId || isNewTab}
            onClick={() => onHistoryAction("goForward")}
          >
            <ArrowRight size={17} />
          </ToolbarButton>
          <ToolbarButton
            label={loading ? "Stop loading" : "Reload"}
            disabled={!activeId || isNewTab}
            onClick={() => onHistoryAction(loading ? "stop" : "reload")}
          >
            {loading ? <X size={16} /> : <RotateCw size={16} />}
          </ToolbarButton>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex h-8 w-full max-w-3xl min-w-0 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-omnibox)] px-2.5 transition duration-150 focus-within:border-[var(--accent-primary)] focus-within:ring-2 focus-within:ring-[var(--accent-glow)]">
            <span
              className="mr-2 flex shrink-0 items-center"
              title={isSecure ? "Secure connection" : "Connection information"}
            >
              {isSecure ? (
                <ShieldCheck size={15} className="text-[var(--accent-secondary)]" />
              ) : (
                <Info size={15} className="text-[var(--text-muted)]" />
              )}
            </span>
            <input
              ref={addressInputRef}
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Google'da ara veya bir URL yaz..."
              aria-label="Google'da ara veya bir URL yaz"
              data-omnibox
              aria-invalid={Boolean(error)}
              title={error || undefined}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--text-primary)] outline-none placeholder:font-sans placeholder:text-[var(--text-muted)]"
            />
            {error && (
              <span className="mr-1 max-w-36 truncate text-[10px] text-rose-400" title={error}>
                {error}
              </span>
            )}
            <div className="ml-2 flex shrink-0 items-center gap-0.5 border-l border-[var(--border-subtle)] pl-1.5">
              <button
                type="button"
                aria-label="Droothe Vault"
                title="Droothe Vault"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-secondary)]"
              >
                <KeyRound size={14} />
              </button>
              <button
                type="button"
                aria-label="Quick Scratchpad"
                title="Quick Scratchpad"
                aria-pressed={scratchpadOpen}
                onClick={onToggleScratchpad}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-hover)] ${
                  scratchpadOpen
                    ? "text-[var(--accent-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--accent-secondary)]"
                }`}
              >
                <StickyNote size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeSwitcher />
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Settings size={16} />
          </button>
        </div>
      </form>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 overflow-hidden ${
          loading ? "opacity-100" : "opacity-0"
        } transition-opacity duration-200`}
      >
        <div className="loading-sweep h-full w-2/5 bg-[linear-gradient(90deg,transparent,var(--accent-secondary),var(--accent-primary),transparent)]" />
      </div>
    </div>
  );
}
