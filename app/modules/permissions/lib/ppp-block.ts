import { getTierForCountry } from "~/lib/ppp";
import type { Course } from "./permissions";

export type PppBlock = { purchaseCountry: string; currentCountry: string };

/**
 * A Student who paid a regional (discounted) price may only view the course
 * from the country they bought it in (ADR-0009). Returns the block, or null
 * when they may view it.
 *
 * No block for free or PPP-disabled courses, for purchases with no recorded
 * country, for full-price (Tier 1) purchases, or when the current country is
 * unknown (ADR-0012).
 */
export function findPppBlock(
  course: Pick<Course, "price" | "pppEnabled">,
  purchaseCountry: string | null,
  currentCountry: string | null
): PppBlock | null {
  if (course.price <= 0 || !course.pppEnabled) return null;
  if (!purchaseCountry || !currentCountry) return null;
  if (getTierForCountry(purchaseCountry) === 1) return null;
  if (currentCountry === purchaseCountry) return null;
  return { purchaseCountry, currentCountry };
}
