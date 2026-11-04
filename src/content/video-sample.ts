// One sample of the page's first <video>: its position, its duration and the source it plays (B8's
// stale-source rule needs `currentSrc`). A missing or unreadable element is no sample.

import type { VideoSample } from "./naka-tab";

type VideoLike = { currentTime: number; duration: number; currentSrc: string };

export function readVideo(doc: {
  querySelector(selector: string): unknown;
}): VideoSample | undefined {
  try {
    const video = doc.querySelector("video") as VideoLike | null;
    if (video === null) return undefined;
    const { currentTime, duration, currentSrc } = video;
    return { currentTime, duration, src: currentSrc };
  } catch {
    return undefined;
  }
}
