// Reads a product's public average (`rating` on the product itself, not the owner's own rating).
// Lenient: anything that is not a finite number from 0 to 10 is null, never a throw.

export function readAverage(product: Record<string, unknown>): number | null {
  let rating: unknown;
  try {
    rating = product.rating;
  } catch {
    return null;
  }
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  if (rating < 0 || rating > 10) return null;
  return Math.round(rating * 10) / 10;
}
