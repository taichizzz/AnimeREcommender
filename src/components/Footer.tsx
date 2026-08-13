import Link from "next/link";

/**
 * Site footer, shown on every page.
 *
 * The attribution line isn't decoration: the catalogue (titles, synopses, cover
 * art, genres, tags) comes from AniList and the scores from MyAnimeList, and
 * both expect credit without implying endorsement.
 */
export function Footer({ width = "max-w-4xl" }: { width?: string }) {
  return (
    <footer className="border-t border-line mt-20">
      {/* `width` mirrors the page's own <main> container so the footer lines up
          with the content above it — the pages don't all use the same width. */}
      <div className={`${width} mx-auto px-6 py-8 space-y-2 text-center`}>
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-paper-2">
          <span>&copy;2026 Animer</span>
          <span className="text-paper-3">·</span>
          <span>Built by taichizzz</span>
          <span className="text-paper-3">·</span>
          <Link href="/about" className="hover:text-paper transition-colors duration-200">
            About
          </Link>
          <span className="text-paper-3">·</span>
          <a
            href="https://github.com/taichizzz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-paper transition-colors duration-200"
          >
            Contact
          </a>
        </p>
        <p className="text-xs text-paper-3 leading-relaxed">
          Anime data from AniList. Community scores from MyAnimeList. Not affiliated with either.
        </p>
      </div>
    </footer>
  );
}
