// The parsers of « Annuler » (fiche-undo) and « Retirer la note » (fiche-remove), sent by a Naka tab
// (fiche-messages holds their types). Ids are positive safe integers, `listByTab` and `vuByTab` booleans, and any
// other key refuses the message.

import type { FicheRemoveMessage, FicheUndoMessage } from "./fiche-messages";
import {
  asBoolean,
  asId,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";

const UNDO_KEYS = valuesOf<keyof FicheUndoMessage>({
  type: true,
  contentId: true,
  productId: true,
  listByTab: true,
  vuByTab: true,
});
const REMOVE_KEYS = valuesOf<keyof FicheRemoveMessage>({
  type: true,
  contentId: true,
  productId: true,
  vuByTab: true,
});

export function parseUndo(record: Record<string, unknown>): FicheUndoMessage {
  onlyKeys(record, UNDO_KEYS, "message");
  const message: FicheUndoMessage = {
    type: "fiche-undo",
    contentId: asId(record.contentId, "contentId"),
    productId: asId(record.productId, "productId"),
  };
  const listByTab = whenPresent(record.listByTab, (v) =>
    asBoolean(v, "listByTab"),
  );
  const vuByTab = whenPresent(record.vuByTab, (v) => asBoolean(v, "vuByTab"));
  return {
    ...message,
    ...(listByTab === undefined ? {} : { listByTab }),
    ...(vuByTab === undefined ? {} : { vuByTab }),
  };
}

export function parseRemove(
  record: Record<string, unknown>,
): FicheRemoveMessage {
  onlyKeys(record, REMOVE_KEYS, "message");
  const vuByTab = whenPresent(record.vuByTab, (v) => asBoolean(v, "vuByTab"));
  return {
    type: "fiche-remove",
    contentId: asId(record.contentId, "contentId"),
    productId: asId(record.productId, "productId"),
    ...(vuByTab === undefined ? {} : { vuByTab }),
  };
}
