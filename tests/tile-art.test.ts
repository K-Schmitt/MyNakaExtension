import { describe, expect, it } from "vitest";
import { artFrame } from "../src/content/ui/tile-art";
import { FakeDoc, type FakeElement } from "./ui-fakes";

const POSTER = "https://image.tmdb.org/t/p/w500/abc.jpg";

const framed = (url: string | undefined): FakeElement =>
  artFrame(new FakeDoc(), url, "mn-art") as FakeElement;

describe("artFrame", () => {
  it("holds an image for an allowed URL, without referrer, lazy and decorative", () => {
    const frame = framed(POSTER);
    expect(frame.tag).toBe("div");
    expect(frame.className).toBe("mn-art");
    const [img] = frame.children as FakeElement[];
    expect(frame.children).toHaveLength(1);
    expect(img?.tag).toBe("img");
    expect(img?.attributes).toEqual({
      src: POSTER,
      referrerpolicy: "no-referrer",
      loading: "lazy",
      decoding: "async",
      alt: "",
    });
  });

  it("an image that fails to load leaves the neutral frame", () => {
    const frame = framed(POSTER);
    const [img] = frame.children as FakeElement[];
    img?.dispatch("error");
    expect(frame.children).toHaveLength(0);
    expect(img?.parentNode).toBeNull();
  });

  it("no URL gives the neutral frame", () => {
    const frame = framed(undefined);
    expect(frame.className).toBe("mn-art");
    expect(frame.children).toHaveLength(0);
  });

  // Review Focus 2: a value that is not what it claims never becomes an <img>.
  it.each([
    "http://image.tmdb.org/t/p/w500/abc.jpg",
    "javascript:alert(1)",
    "https://evil.example/t/p/w500/abc.jpg",
    "https://media.senscritique.com/media/x.jpg", // no SensCritique host allowed yet
    "//image.tmdb.org/t/p/w500/abc.jpg",
    "data:image/png;base64,AAAA",
    "",
  ])("%s gives the neutral frame", (url) => {
    expect(framed(url).children).toHaveLength(0);
  });
});
