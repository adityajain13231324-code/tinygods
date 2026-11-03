// Start-up: show the main menu, or (when the URL says ?start=1) go straight into a game.
// The menu starts a game by reloading the page with the chosen options in the URL, which keeps
// the game code simple (one game per page load) and makes "?seed=..." links shareable.

const params = new URLSearchParams(location.search);

if (params.get('start') === '1') {
  import('./main.js');
} else {
  import('./render/ui/menu.js').then((m) => m.showMenu());
}
