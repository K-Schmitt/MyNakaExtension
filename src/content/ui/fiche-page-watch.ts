// The title page's changes, for what must follow Naka's redraws: the panel's place and the episode boxes'
// decorations. A box's rewritten code is a text change, so text changes count too.

export function watchPage(doc: Document, onChange: () => void): () => void {
  const observer = new MutationObserver(() => onChange());
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => observer.disconnect();
}
