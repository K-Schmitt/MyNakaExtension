// The order of the owner's own episode ratings reads: the asked episodes whose boxes are on screen first,
// then the others, each group in the asked order. Pure: the boxes on screen come in as their numbers.

export function visibleFirstOrder(
  numbers: readonly number[],
  visible: readonly (number | undefined)[],
): number[] {
  return [
    ...numbers.filter((n) => visible.includes(n)),
    ...numbers.filter((n) => !visible.includes(n)),
  ];
}
