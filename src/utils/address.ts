export const NEW_TAB_URL = "droothe://newtab";
export const NEW_TAB_TITLE = "Yeni Sekme";

export function isNewTabUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return value.trim().replace(/\/+$/, "").toLowerCase() === NEW_TAB_URL;
}

export function fallbackTabTitle(url: string): string {
  if (isNewTabUrl(url)) return NEW_TAB_TITLE;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    if (hostname) return hostname;
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

export function resolveAddress(input: string): string {
  const value = input.trim();
  if (!value) return NEW_TAB_URL;
  if (isNewTabUrl(value)) return NEW_TAB_URL;

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (
    !/\s/.test(value) &&
    (value.includes(".") || value.toLowerCase().startsWith("localhost"))
  ) {
    return `https://${value}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
