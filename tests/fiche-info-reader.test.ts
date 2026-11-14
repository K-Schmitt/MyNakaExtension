import { describe, expect, it } from "vitest";
import { askInfo, retryInfo } from "../src/content/fiche-info-reader";
import { type FicheScope, newPage } from "../src/content/fiche-page";
import type { FichePorts } from "../src/content/fiche-ports";
import { createReadQueue } from "../src/content/fiche-read-queue";
import type { FicheInfoMessage } from "../src/ext/fiche-messages";

const MSG: FicheInfoMessage = {
  type: "fiche-info",
  contentId: 5,
  tmdbId: 9005,
  mediaType: "movie",
  title: "Solaris",
};

// A scope whose fiche-info reads never answer: each one stays on its way.
function pendingReads() {
  const sent: FicheInfoMessage[] = [];
  const ports = {
    info: (msg: FicheInfoMessage) => {
      sent.push(msg);
      return new Promise<undefined>(() => undefined);
    },
  } as unknown as FichePorts;
  const page = newPage({ mediaType: "movie", tmdbId: 9005 });
  page.infoMessage = MSG;
  const scope: FicheScope = {
    ports,
    page,
    reads: createReadQueue(),
    live: () => true,
    show: () => undefined,
  };
  return { scope, sent };
}

describe("« Réessayer » while a read of the info is on its way", () => {
  it("sends no second fiche-info, even with the failed flag an older read left", () => {
    const { scope, sent } = pendingReads();
    void askInfo(scope);
    scope.page.infoFailed = true;

    retryInfo(scope);

    expect(sent).toHaveLength(1);
  });
});
