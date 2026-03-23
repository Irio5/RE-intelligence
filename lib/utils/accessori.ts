/** Returns true if garage/cantina field represents a real accessory (not false/null/empty). */
export function hasAcc(v: string | boolean | null | undefined): boolean {
  return v !== false && v !== "FALSE" && v !== "false" && v != null && v !== "";
}
