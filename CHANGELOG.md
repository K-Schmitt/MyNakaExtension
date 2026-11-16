# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-16

First public release.

### Added

- **Finishes**: a film or episode watched past its threshold (90% for films, 80% for episodes,
  adjustable), past the start of the credits, or ticked « vu » on Naka is marked seen on SensCritique
  with the local date; a finished film leaves the SensCritique watchlist, a series never does. Unticking
  « vu » on Naka forgets the title. A finish that could not run for lack of a Naka tab is kept and
  retried, and can be cancelled.
- **Ratings from Naka**: a rating block at the end of a title and on pause (optionally from a set
  percentage), an « À traiter » row on Naka's home page with the ratings waiting and the open questions,
  and the SensCritique average and your rating in the info panel of each title page, with stars for each
  episode. Seasons and series are offered once finished, with the average of your ratings; a season
  still airing is not taken as finished. A rating from a title page can be undone for 10 minutes.
- **Watchlist sync** both ways between Naka's « Ma liste » and the SensCritique watchlist, on opening
  Naka, after a change to « Ma liste » or on « Resynchroniser »: the first sync only adds, removals
  become questions, ambiguous titles are asked, at most 10 writes per sync.
- **Questions and links**: "which title is this?" and "remove it too?" asked in the blocks and on
  the extension's page; titles not linked can be searched and linked by hand, including from a title
  page when SensCritique finds nothing.
- **Extension page** with an Activité tab (last sync, last finish, questions, titles not linked, titles
  handled) and a Réglages tab (simulation mode, thresholds, pause block, stored data).
- **Simulation mode** in Réglages: list syncs show the writes they would make instead of making them.
- **Data export**: « Exporter mes données » downloads the stored data as a JSON file.
- « Oublier les comptes liés » and « Réinitialiser » on the extension's page.
- Naka's colours in every block, read live from the page.
- A fresh install starts with writes on, and its first sync waits for a click on « Resynchroniser »;
  « Réinitialiser » keeps the mode, and the next sync after it also waits for a click.
- Icons, MIT license, privacy policy and READMEs in English and French.

### Security

- Session tokens are never stored: the SensCritique token is read per call from the logged-in session,
  the Naka token stays in the extension's script in the Naka tab.
- A finish counts only for the title playing, after real playback; a « vu » ticked outside the player
  counts only within 3 s of a real click, one click each.
- Every control that writes to a site ignores clicks unless it has been visible for 300 ms.
- Strict parsers on every message between contexts and every stored value; write budgets per sync and
  per hour; the jobs stop when another account is signed in on either site.

[1.0.0]: https://github.com/K-Schmitt/MyNakaExtension/releases/tag/v1.0.0
