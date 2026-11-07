export const SHOPORA_STYLES = String.raw`
.shopora-storefront {
  --shopora-white: #fff;
  --shopora-ink: #202020;
  --shopora-muted: #777777;
    --shopora-faint: #a2a2a2;
  --shopora-line: #e9e9e9;
  --shopora-soft: #f7f7f7;
  --shopora-peach: #fff0e9;
  --shopora-lavender: #f3f1f9;
  --shopora-accent: #ef8c51;
  --shopora-accent-dark: #b85b2d;
  --shopora-star: #ed9d39;
  --shopora-empty-star: #dedede;
  --shopora-focus: #735b9b;
  --shopora-overlay: rgb(24 20 31 / 48%);
  --shopora-shadow: 0 16px 64px rgb(24 20 31 / 18%);
  --shopora-red: #c75453;
  --shopora-blue: #5383b3;
  --shopora-green: #69856a;
  --shopora-yellow: #e6c66a;
  --shopora-orange: #dd975c;
  --shopora-purple: #9a83bb;
  --shopora-pink: #e8b0bf;
  --shopora-brown: #9c755b;
  --shopora-beige: #d7c7ae;
  --shopora-gray: #a3a3a3;
  --shopora-silver: #c5c9cd;
  --shopora-gold: #c3a357;
  --shopora-font: Inter, "Helvetica Neue", Arial, sans-serif;
  --shopora-radius: 6px;
  --shopora-pill: 999px;
  container: shopora / inline-size;
  isolation: isolate;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  background: var(--shopora-white);
  color: var(--shopora-ink);
  font-family: var(--shopora-font);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.6;
  text-align: left;
  color-scheme: light;
  -webkit-font-smoothing: antialiased;
}
.shopora-storefront *, .shopora-storefront *::before, .shopora-storefront *::after { box-sizing: border-box; }
.shopora-storefront :where(h1, h2, h3, p, ul) { margin: 0; padding: 0; }
.shopora-storefront :where(ul) { list-style: none; }
.shopora-storefront :where(a) { color: inherit; text-decoration: none; }
.shopora-storefront :where(button, input, select) { font: inherit; color: inherit; letter-spacing: inherit; }
.shopora-storefront :where(button) { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: auto; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; cursor: pointer; text-transform: none; }
.shopora-storefront :where(input, select) { width: auto; min-width: 0; height: auto; margin: 0; border: 1px solid var(--shopora-line); border-radius: var(--shopora-radius); background: var(--shopora-white); box-shadow: none; }
.shopora-storefront :where(a, button, input, select, summary):focus-visible { outline: 2px solid var(--shopora-focus); outline-offset: 4px; }
.shopora-storefront :where(a):hover { color: var(--shopora-accent-dark); }
.shopora-storefront button:disabled { opacity: .35; cursor: not-allowed; }
.shopora-storefront .shopora-icon { display: block; flex: 0 0 auto; width: 19px; height: 19px; }
.shopora-storefront .shopora-shell { width: min(1140px, calc(100% - 64px)); margin-inline: auto; }
.shopora-storefront .shopora-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.shopora-storefront .shopora-search { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 450px; min-height: 38px; padding: 0 12px; border: 1px solid var(--shopora-line); border-radius: 3px; background: var(--shopora-white); }
.shopora-storefront .shopora-search input { flex: 1; width: 100%; padding: 9px 0; border: 0; border-radius: 0; background: transparent; outline-offset: 1px; font-size: 12px; }
.shopora-storefront .shopora-search input::placeholder { color: var(--shopora-muted); opacity: 1; }
.shopora-storefront .shopora-search .shopora-icon { width: 17px; height: 17px; }
.shopora-storefront .shopora-search button { flex: 0 0 auto; min-width: 24px; min-height: 28px; }
.shopora-storefront .shopora-action { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.shopora-storefront .shopora-action[aria-pressed="true"] { color: var(--shopora-accent-dark); }
.shopora-storefront .shopora-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 17px; height: 17px; border-radius: var(--shopora-pill); padding: 0 4px; background: var(--shopora-peach); color: var(--shopora-accent-dark); font-size: 10px; }
.shopora-storefront .shopora-catalog { display: grid; grid-template-columns: 270px minmax(0, 1fr); align-items: start; gap: 24px; padding-block: 24px; }
.shopora-storefront .shopora-catalog[data-has-filters="false"] { grid-template-columns: minmax(0, 1fr); }
.shopora-storefront .shopora-sidebar { min-width: 0; padding: 14px; border: 1px solid var(--shopora-line); border-radius: 6px; }
.shopora-storefront .shopora-sidebar-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding-bottom: 16px; border-bottom: 1px solid var(--shopora-line); }
.shopora-storefront .shopora-sidebar-title h2 { font-size: 13px; line-height: 20px; font-weight: 600; letter-spacing: .25px; }
.shopora-storefront .shopora-filter-total { margin-top: 3px; color: var(--shopora-faint); font-size: 11px; }
.shopora-storefront .shopora-text-button { color: var(--shopora-muted); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.shopora-storefront .shopora-text-button:hover { color: var(--shopora-accent-dark); }
.shopora-storefront .shopora-filter { padding: 18px 0; border-bottom: 1px solid var(--shopora-line); }
.shopora-storefront .shopora-filter:last-child { padding-bottom: 3px; border-bottom: 0; }
.shopora-storefront .shopora-filter > summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; }
.shopora-storefront summary::-webkit-details-marker { display: none; }
.shopora-storefront .shopora-filter > summary .shopora-icon { width: 13px; height: 13px; transform: rotate(-90deg); transition: transform 160ms; }
.shopora-storefront .shopora-filter[open] > summary .shopora-icon { transform: rotate(0); }
.shopora-storefront .shopora-filter-options { display: grid; gap: 10px; margin-top: 16px; }
.shopora-storefront .shopora-option { display: flex; align-items: center; gap: 9px; min-height: 21px; cursor: pointer; font-size: 12px; }
.shopora-storefront .shopora-option input { flex: 0 0 auto; width: 13px; height: 13px; padding: 0; accent-color: var(--shopora-ink); cursor: pointer; }
.shopora-storefront .shopora-option-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.shopora-storefront .shopora-option-count { color: var(--shopora-muted); font-size: 11px; }
.shopora-storefront .shopora-option:has(input:checked) .shopora-option-label { font-weight: 600; }
.shopora-storefront .shopora-show-more { justify-content: flex-start; margin-top: 13px; color: var(--shopora-accent-dark); font-size: 11px; }
.shopora-storefront .shopora-swatch { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; flex: 0 0 auto; border: 1px solid var(--shopora-line); border-radius: 50%; background: var(--shopora-soft); font-size: 9px; }
.shopora-storefront .shopora-swatch[data-color="black"] { background: var(--shopora-ink); }
.shopora-storefront .shopora-swatch[data-color="white"] { background: var(--shopora-white); }
.shopora-storefront .shopora-swatch[data-color="red"] { background: var(--shopora-red); }
.shopora-storefront .shopora-swatch[data-color="blue"] { background: var(--shopora-blue); }
.shopora-storefront .shopora-swatch[data-color="green"] { background: var(--shopora-green); }
.shopora-storefront .shopora-swatch[data-color="yellow"] { background: var(--shopora-yellow); }
.shopora-storefront .shopora-swatch[data-color="orange"] { background: var(--shopora-orange); }
.shopora-storefront .shopora-swatch[data-color="purple"] { background: var(--shopora-purple); }
.shopora-storefront .shopora-swatch[data-color="pink"] { background: var(--shopora-pink); }
.shopora-storefront .shopora-swatch[data-color="brown"] { background: var(--shopora-brown); }
.shopora-storefront .shopora-swatch[data-color="beige"] { background: var(--shopora-beige); }
.shopora-storefront .shopora-swatch[data-color="gray"] { background: var(--shopora-gray); }
.shopora-storefront .shopora-swatch[data-color="silver"] { background: var(--shopora-silver); }
.shopora-storefront .shopora-swatch[data-color="gold"] { background: var(--shopora-gold); }
.shopora-storefront .shopora-results { min-width: 0; }
.shopora-storefront .shopora-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; min-height: 37px; margin-bottom: 23px; }
.shopora-storefront .shopora-result-count { color: var(--shopora-muted); font-size: 11px; }
.shopora-storefront .shopora-result-count strong { color: var(--shopora-ink); font-weight: 500; }
.shopora-storefront .shopora-toolbar-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; }
.shopora-storefront .shopora-sort { display: flex; align-items: center; gap: 7px; white-space: nowrap; font-size: 11px; color: var(--shopora-muted); }
.shopora-storefront .shopora-sort select { max-width: 158px; padding: 6px 20px 6px 7px; border-color: transparent; color: var(--shopora-ink); font-size: 11px; cursor: pointer; }
.shopora-storefront .shopora-view-toggle { display: flex; gap: 5px; padding-left: 12px; border-left: 1px solid var(--shopora-line); }
.shopora-storefront .shopora-view-toggle button { width: 27px; height: 28px; color: var(--shopora-muted); border-radius: 2px; }
.shopora-storefront .shopora-view-toggle button[aria-pressed="true"] { color: var(--shopora-ink); background: var(--shopora-soft); }
.shopora-storefront .shopora-view-toggle .shopora-icon { width: 15px; height: 15px; }
.shopora-storefront .shopora-mobile-filter { display: none; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid var(--shopora-line); border-radius: var(--shopora-radius); font-size: 12px; }
.shopora-storefront .shopora-active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: -5px 0 20px; }
.shopora-storefront .shopora-chip { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; padding: 4px 9px; background: var(--shopora-soft); border-radius: var(--shopora-pill); font-size: 11px; overflow-wrap: anywhere; }
.shopora-storefront .shopora-chip .shopora-icon { width: 12px; height: 12px; }
.shopora-storefront .shopora-product-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 16px; row-gap: 28px; }
.shopora-storefront .shopora-product { min-width: 0; min-height: 345px; }
.shopora-storefront .shopora-product-image { position: relative; display: block; width: 100%; aspect-ratio: 200 / 225; overflow: hidden; border-radius: 6px; background: var(--shopora-lavender); }
.shopora-storefront .shopora-image-link { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.shopora-storefront .shopora-image { display: block; width: 100%; height: 100%; max-width: 100%; padding: 17px; object-fit: contain; transition: transform 220ms ease; }
.shopora-storefront .shopora-product-image:hover .shopora-image { transform: scale(1.045); }
.shopora-storefront .shopora-image-fallback { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 100%; min-height: 100px; padding: 15px; text-align: center; color: var(--shopora-muted); font-size: 10px; }
.shopora-storefront .shopora-image-fallback .shopora-icon { width: 35px; height: 35px; opacity: .45; }
.shopora-storefront .shopora-heart { position: absolute; z-index: 1; top: 9px; right: 9px; width: 29px; height: 29px; border-radius: 50%; background: var(--shopora-white); color: var(--shopora-ink); }
.shopora-storefront .shopora-heart .shopora-icon { width: 15px; height: 15px; }
.shopora-storefront .shopora-heart[aria-pressed="true"] { color: var(--shopora-accent-dark); }
.shopora-storefront .shopora-heart[aria-pressed="true"] .shopora-icon { fill: currentColor; }
.shopora-storefront .shopora-quick-view { position: absolute; z-index: 1; bottom: 13px; left: 50%; max-width: calc(100% - 20px); padding: 7px 17px; border-radius: var(--shopora-pill); background: var(--shopora-white); color: var(--shopora-ink); font-size: 10px; font-weight: 500; white-space: nowrap; opacity: 0; transform: translate(-50%, 7px); transition: opacity 160ms, transform 160ms; }
.shopora-storefront .shopora-product-image:hover .shopora-quick-view, .shopora-storefront .shopora-product-image:focus-within .shopora-quick-view { opacity: 1; transform: translate(-50%, 0); }
.shopora-storefront .shopora-product-copy { padding-top: 12px; }
.shopora-storefront .shopora-product-heading { display: block; }
.shopora-storefront .shopora-product h3 { min-width: 0; color: var(--shopora-muted); font-size: 14px; font-weight: 400; line-height: 22px; overflow-wrap: anywhere; }
.shopora-storefront .shopora-price { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 7px; color: var(--shopora-ink); font-size: 16px; line-height: 26px; font-weight: 700; }
.shopora-storefront .shopora-product-heading .shopora-price { margin-top: 4px; }
.shopora-storefront .shopora-price del { color: var(--shopora-faint); font-size: 11px; font-weight: 400; }
.shopora-storefront .shopora-description { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 1; margin-top: 4px; color: var(--shopora-faint); font-size: 12px; line-height: 20px; overflow-wrap: anywhere; }
.shopora-storefront .shopora-rating { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--shopora-muted); font-size: 11px; line-height: 20px; }
.shopora-storefront .shopora-stars { position: relative; display: inline-block; color: var(--shopora-empty-star); font-size: 14px; line-height: 1; letter-spacing: 1px; white-space: nowrap; }
.shopora-storefront .shopora-stars-fill { position: absolute; inset: 0 auto 0 0; overflow: hidden; color: var(--shopora-star); }
.shopora-storefront .shopora-product-grid[data-view="list"] { grid-template-columns: 1fr; gap: 22px; }
.shopora-storefront .shopora-product-grid[data-view="list"] .shopora-product { display: grid; grid-template-columns: 155px minmax(0, 1fr); gap: 24px; min-height: 0; padding-bottom: 22px; border-bottom: 1px solid var(--shopora-line); }
.shopora-storefront .shopora-product-grid[data-view="list"] .shopora-product-copy { align-self: center; padding-top: 0; }
.shopora-storefront .shopora-product-grid[data-view="list"] h3 { font-size: 16px; }
.shopora-storefront .shopora-product-grid[data-view="list"] .shopora-description { margin-top: 10px; font-size: 12px; -webkit-line-clamp: 3; }
.shopora-storefront .shopora-empty { padding: 65px 20px; border: 1px solid var(--shopora-line); text-align: center; }
.shopora-storefront .shopora-empty > .shopora-icon { width: 30px; height: 30px; margin: 0 auto 15px; color: var(--shopora-muted); }
.shopora-storefront .shopora-empty h2 { font-size: 19px; font-weight: 600; }
.shopora-storefront .shopora-empty p { margin: 8px auto 20px; max-width: 310px; color: var(--shopora-muted); }
.shopora-storefront .shopora-primary { padding: 10px 20px; border: 1px solid var(--shopora-ink); border-radius: var(--shopora-radius); background: var(--shopora-ink); color: var(--shopora-white); font-size: 12px; }
.shopora-storefront a.shopora-primary { display: inline-flex; align-items: center; justify-content: center; }
.shopora-storefront .shopora-primary:hover { background: var(--shopora-accent-dark); border-color: var(--shopora-accent-dark); color: var(--shopora-white); }
.shopora-storefront .shopora-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 7px; margin-top: 43px; }
.shopora-storefront .shopora-pagination button { min-width: 31px; height: 32px; padding: 0 7px; border: 1px solid var(--shopora-line); border-radius: 2px; font-size: 11px; }
.shopora-storefront .shopora-pagination button[aria-current="page"] { background: var(--shopora-ink); border-color: var(--shopora-ink); color: var(--shopora-white); }
.shopora-storefront .shopora-pagination .shopora-icon { width: 13px; height: 13px; }
.shopora-storefront .shopora-page-gap { padding: 0 3px; color: var(--shopora-muted); }
.shopora-storefront .shopora-dialog { position: fixed; inset: 16px; width: min(750px, calc(100% - 32px), calc(100cqw - 32px)); max-width: none; max-height: calc(100% - 32px); margin: auto; padding: 0; overflow: auto; border: 0; border-radius: 8px; background: var(--shopora-white); color: var(--shopora-ink); box-shadow: var(--shopora-shadow); font: inherit; }
.shopora-storefront .shopora-dialog::backdrop { background: var(--shopora-overlay); }
.shopora-storefront .shopora-dialog-content { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 30px; }
.shopora-storefront .shopora-dialog-image { aspect-ratio: 1; background: var(--shopora-lavender); border-radius: var(--shopora-radius); overflow: hidden; }
.shopora-storefront .shopora-dialog-copy { align-self: center; min-width: 0; padding-block: 20px; }
.shopora-storefront .shopora-dialog-copy h2 { font-size: 24px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.shopora-storefront .shopora-dialog-copy > .shopora-price { margin-top: 15px; font-size: 18px; }
.shopora-storefront .shopora-dialog-copy > p { margin-block: 18px; font-size: 12px; line-height: 1.9; color: var(--shopora-muted); white-space: pre-line; overflow-wrap: anywhere; }
.shopora-storefront .shopora-dialog-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.shopora-storefront .shopora-dialog-save { padding: 9px 12px; border: 1px solid var(--shopora-line); border-radius: var(--shopora-radius); font-size: 11px; }
.shopora-storefront .shopora-dialog-close { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; background: var(--shopora-white); border-radius: 50%; }
.shopora-storefront .shopora-unavailable { color: var(--shopora-muted); font-size: 11px; }
@container shopora (max-width: 1100px) {
  .shopora-storefront .shopora-catalog { grid-template-columns: 218px minmax(0, 1fr); gap: 24px; }
  .shopora-storefront .shopora-product-grid { gap: 28px 16px; }
  .shopora-storefront .shopora-product { min-height: 0; }
}
@container shopora (max-width: 900px) {
  .shopora-storefront .shopora-shell { width: calc(100% - 40px); }
  .shopora-storefront .shopora-catalog { grid-template-columns: 185px minmax(0, 1fr); gap: 20px; }
  .shopora-storefront .shopora-product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .shopora-storefront .shopora-toolbar { align-items: flex-start; }
  .shopora-storefront .shopora-toolbar-controls { gap: 8px; }
}
@container shopora (max-width: 700px) {
  .shopora-storefront .shopora-search { grid-row: 2; grid-column: 1 / -1; max-width: none; }
  .shopora-storefront .shopora-catalog { grid-template-columns: minmax(0, 1fr); gap: 24px; padding-block: 20px; }
  .shopora-storefront .shopora-sidebar { display: none; padding: 16px; border: 1px solid var(--shopora-line); }
  .shopora-storefront .shopora-sidebar[data-open="true"] { display: block; }
  .shopora-storefront .shopora-filter:last-child { border-bottom: 0; }
  .shopora-storefront .shopora-mobile-filter { display: inline-flex; }
  .shopora-storefront .shopora-mobile-filter-top { grid-row: 1; justify-self: start; }
  .shopora-storefront .shopora-toolbar { gap: 10px; margin-bottom: 20px; }
  .shopora-storefront .shopora-product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .shopora-storefront .shopora-dialog-content { gap: 20px; padding: 26px 20px; }
  .shopora-storefront .shopora-dialog-copy h2 { font-size: 20px; }
}
@container shopora (max-width: 480px) {
  .shopora-storefront .shopora-shell { width: calc(100% - 32px); }
  .shopora-storefront .shopora-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 25px 14px; }
  .shopora-storefront .shopora-product h3 { font-size: 13px; }
  .shopora-storefront .shopora-product-heading .shopora-price { margin-top: 4px; }
  .shopora-storefront .shopora-toolbar-controls { justify-content: space-between; width: 100%; }
  .shopora-storefront .shopora-sort select { max-width: 145px; }
  .shopora-storefront .shopora-product-grid[data-view="list"] .shopora-product { grid-template-columns: 110px minmax(0, 1fr); gap: 16px; }
  .shopora-storefront .shopora-product-grid[data-view="list"] h3 { font-size: 13px; }
  .shopora-storefront .shopora-dialog-content { grid-template-columns: minmax(0, 1fr); }
  .shopora-storefront .shopora-dialog-image { max-height: 240px; }
  .shopora-storefront .shopora-dialog-copy { padding-block: 0; }
}
@media (hover: none) {
  .shopora-storefront .shopora-quick-view { opacity: 1; transform: translate(-50%, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .shopora-storefront *, .shopora-storefront *::before, .shopora-storefront *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
`;
