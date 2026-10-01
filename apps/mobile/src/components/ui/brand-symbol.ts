/**
 * Balanced Horizon V2, the master symbol: the three paths of
 * `assets/brand/kuyara-symbol-master.svg`, character for character, in its 1024 viewBox.
 * The geometry never changes; `brand-symbol.test.mjs` holds this copy equal to the master.
 */
export const brandSymbolViewBox = 1024;

export const brandSymbolPaths = Object.freeze([
  'M250 500 C370 512 462 474 552 430 C623 395 686 384 750 391 C767 393 777 376 767 359 L720 281 C707 260 684 248 659 248 L406 248 C380 248 358 260 342 281 L230 449 C216 470 225 498 250 500 Z',
  'M390 560 C501 526 583 488 655 466 C716 447 772 448 810 460 C827 465 836 484 828 501 L786 590 C776 613 755 629 734 626 C628 606 520 598 413 608 C393 610 377 590 382 572 C384 566 387 562 390 560 Z',
  'M257 684 C408 674 560 678 714 696 C734 698 744 714 735 730 L686 786 C670 804 648 812 621 812 L386 812 C366 812 347 805 332 792 L259 729 C244 716 242 701 251 689 C253 686 255 684 257 684 Z',
] as const);
