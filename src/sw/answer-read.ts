// A read of the stored data: outside the queue, never saving. An unreadable store is answered
// `undefined` (an invented answer would be worse), so that the tab's ask resolves at once. Chrome's
// responder may throw (its port already closed): that is no error of the worker.

export type Respond = (answer: unknown) => void;

function ignore(): void {}

export function answerRead(
  read: () => Promise<unknown>,
  respond: Respond,
): void {
  read()
    .then(
      (answer) => respond(answer),
      () => respond(undefined),
    )
    .catch(ignore);
}
