/**
 * Cleans up text that is about to be pasted.
 *
 * Copied commands usually carry a trailing newline (line selections, web code blocks),
 * and pasting that runs the command instantly, which is an accident when something like
 * `rm -rf` is in there. So **only the trailing newline** is stripped and the text is
 * left on the prompt for the user to run with Enter.
 *
 * Interior newlines are left alone; bracketed paste handles multi-line input.
 */
export function sanitizePasteText(text: string): string {
  return text.replace(/[\r\n]+$/, '');
}

/** An interior newline means a multi-line paste, used to decide on a confirmation. */
export function isMultilinePaste(text: string): boolean {
  return /[\r\n]/.test(sanitizePasteText(text));
}
