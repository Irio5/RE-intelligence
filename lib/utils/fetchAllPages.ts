import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;

/** Fetches all rows from a Supabase table using cursor-based pagination. */
export async function fetchAllPages<T>(
  table: string,
  select: string,
): Promise<{ data: T[]; error: string | null }> {
  let all: T[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) return { data: [], error: error.message };
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return { data: all, error: null };
}
