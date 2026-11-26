/** Marks every search word inside `text` (case-insensitive). */
export function Highlight({ text, query }: { text: string | null | undefined; query: string }) {
  if (!text) return null;
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return <>{text}</>;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}
