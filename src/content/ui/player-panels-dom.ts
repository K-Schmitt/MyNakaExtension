// Naka's own panels over the player, read from its DOM: the episode list and the settings panel. They exist
// only while open (owner's captures of 2026-11-22), so their presence is the state. The rating column hides
// while one is open: both sit on the right of the player.

export const NAKA_PANELS = "div.nk-epd, div.nk-settings-panel";

type PanelsDoc = Pick<Document, "querySelector" | "body">;
type Observe = (target: Node, onMutation: () => void) => () => void;

export function watchPlayerPanels(
  doc: PanelsDoc,
  observe: Observe,
  onChange: (open: boolean) => void,
): () => void {
  let open = false;
  const check = (): void => {
    const now = doc.querySelector(NAKA_PANELS) !== null;
    if (now === open) return;
    open = now;
    onChange(open);
  };
  const stop = observe(doc.body, check);
  check();
  return stop;
}

export function observeBody(target: Node, onMutation: () => void): () => void {
  const observer = new MutationObserver(onMutation);
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}
