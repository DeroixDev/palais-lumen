export type Cleanup = void | (() => void);
/** A page renders into `root`; it may return a cleanup that runs when the user navigates away. */
export type Page = (root: HTMLElement, args: string[]) => Cleanup;

/** Standard page header. */
export function pageHead(title: string, sub = '', right = ''): string {
  return `<div class="phead"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="phead-r">${right}</div>` : ''}</div>`;
}
