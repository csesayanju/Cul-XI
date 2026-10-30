/**
 * Trivia pages: title, game switcher, the game, then its table. On wide screens the title and
 * switcher span the top and the table sits beside the game (sticky), instead of below it.
 * Children order matters: [title, switcher, game, table].
 */
export const GAME_PAGE =
  "mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-8 " +
  "lg:[&>*:nth-child(-n+2)]:col-span-2 lg:[&>section:last-child]:sticky " +
  "lg:[&>section:last-child]:top-20 lg:[&>section:last-child]:mt-0";
