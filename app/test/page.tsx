import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TestPage() {
  const { data, error, count, status, statusText } = await supabase
    .from("transazioni")
    .select("*", { count: "exact" })
    .limit(5);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test connessione Supabase</h1>

      <div className="bg-gray-100 rounded p-4 text-sm font-mono mb-4">
        <p><strong>URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
        <p><strong>HTTP status:</strong> {status} {statusText}</p>
        <p><strong>count:</strong> {count ?? "null"}</p>
        <p><strong>data length:</strong> {data?.length ?? "null"}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded p-4 text-sm font-mono">
          <p className="font-bold text-red-700 mb-2">Errore Supabase:</p>
          <pre className="text-red-600 whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {!error && data !== null && data.length === 0 && (
        <p className="text-yellow-600">Nessun dato restituito (tabella vuota o nome errato).</p>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-4">
          {data.map((row) => (
            <li key={row.attoid} className="border rounded p-4 text-sm font-mono">
              <pre>{JSON.stringify(row, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
