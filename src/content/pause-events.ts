// The video's pause and play, seen from the document. Naka reuses one <video> across episodes and its
// pause reaches a capture listener on the document, so the listener sits there and acts only when the
// target is the element readVideo samples. It only listens: the extension never pauses, plays or seeks.

import type { VideoSample } from "./video-sample";
import { readVideo } from "./video-sample";

export type PauseDoc = {
  addEventListener(
    type: string,
    fn: (event: { target: unknown }) => void,
    capture: boolean,
  ): void;
  querySelector(selector: string): unknown;
};

type PauseHandlers = { paused(sample: VideoSample): void; resumed(): void };

export function listenToPauses(doc: PauseDoc, handlers: PauseHandlers): void {
  const isTheVideo = (target: unknown): boolean =>
    target !== null && target === doc.querySelector("video");
  doc.addEventListener(
    "pause",
    (event) => {
      if (!isTheVideo(event.target)) return;
      const sample = readVideo(doc);
      if (sample !== undefined) handlers.paused(sample);
    },
    true,
  );
  doc.addEventListener(
    "play",
    (event) => {
      if (isTheVideo(event.target)) handlers.resumed();
    },
    true,
  );
}
