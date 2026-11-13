// The title page controller's line to the worker: the five fiche messages, each answer checked field by
// field before the controller sees it. The send function is injected (the entry binds chrome.runtime), so
// nothing here touches chrome.*. A lost, refused or malformed answer is `undefined`, never a throw.

import {
  parseFicheInfo,
  parseLinkAnswer,
  parseMineAnswer,
  parseRateAnswer,
  parseSeasonAnswer,
} from "../ext/fiche-answers";
import type { FicheMessage } from "../ext/fiche-messages";
import type { FichePorts } from "./fiche-ports";

export type SendFiche = (msg: FicheMessage) => Promise<unknown>;

type WorkerPart = Pick<
  FichePorts,
  "info" | "season" | "mine" | "rate" | "link"
>;

export function createFicheWorkerPort(send: SendFiche): WorkerPart {
  async function askChecked<T>(
    msg: FicheMessage,
    parse: (raw: unknown) => T,
  ): Promise<T | undefined> {
    try {
      return parse(await send(msg));
    } catch {
      return undefined;
    }
  }

  return {
    info: (msg) => askChecked(msg, parseFicheInfo),
    season: (msg) => askChecked(msg, parseSeasonAnswer),
    mine: (msg) => askChecked(msg, parseMineAnswer),
    rate: (msg) => askChecked(msg, parseRateAnswer),
    link: (msg) => askChecked(msg, parseLinkAnswer),
  };
}
