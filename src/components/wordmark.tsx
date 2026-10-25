/** Original text wordmark for Culé XI. Deliberately not based on any club crest. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-black tracking-tight ${className}`}>
      <span>Culé</span>
      <span className="rounded-md bg-gradient-to-br from-garnet-500 to-blaugrana-700 px-1.5 text-gold-400">
        XI
      </span>
    </span>
  );
}
