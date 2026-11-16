// One sample of the page's first <video>: its position, its duration and the source it plays (the tracker
// drops a sample of a stale source, so it needs `currentSrc`). A missing or unreadable element is no sample.

export type VideoSample = {
  currentTime: number;
  duration: number;
  src: string;
};

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
