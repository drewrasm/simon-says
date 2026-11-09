/** Reads the host token from a `#token=…` URL fragment. */
export const readHostToken = (hash: string) =>
  new URLSearchParams(hash.replace(/^#/, "")).get("token") || null;

/**
 * Removes the fragment from the address bar so the host token is not shown on
 * a projected screen or copied with the page URL. History length is unchanged.
 */
export const clearHostFragment = () => {
  if (!window.location.hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", pathname + search);
};
