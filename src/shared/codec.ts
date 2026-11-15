// Exported games are their save as JSON in base64 (UTF-8 safe), whichever the phase.
export const encodeSave = (d: unknown): string => btoa(unescape(encodeURIComponent(JSON.stringify(d))));
export const decodeSave = (text: string): unknown => JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
