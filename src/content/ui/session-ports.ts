// What a rating session needs from the block that owns it: the worker's line, the timer and the clock,
// and the overlay. `onQuestion` is the hand-over to a question block: a title whose rating cannot go
// because its ambiguity waits for an answer (the pause block sets it; the end block never meets this).

import type { AmbiguityOffer } from "../../sw/question-offers";
import type { CardAnswer } from "../../sw/rating-answers";
import type { EndTimer } from "./end-poll";
import type { RatingHandlers } from "./rating-render";
import type { RatingView } from "./rating-view";
import type { WorkerPort } from "./worker-port";

export type SessionPorts = {
  port: Pick<WorkerPort, "askCard" | "rate" | "dismiss">;
  timer: EndTimer;
  now(): number;
  show(view: RatingView, handlers: RatingHandlers): void;
  hide(): void;
  onQuestion?(offer: AmbiguityOffer, answer: CardAnswer): void;
};
