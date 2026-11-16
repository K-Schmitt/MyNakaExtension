# Privacy policy

[Français](PRIVACY.fr.md)

Last updated: 2026-11-16. Applies to MyNakaExtension 1.0.0 and later.

MyNakaExtension has no server. The developer receives none of your data, and the extension contains no
analytics, no tracking, no advertising and no third-party code.

## What is stored

The extension keeps five entries in the browser's extension storage (`chrome.storage.local`):

| Key | What it holds |
| --- | --- |
| `state` | The titles the extension handled: the links between a Naka title and its SensCritique page, the titles you finished, the open questions ("which title is this?", "remove it too?"), the titles it could not link, and what both watchlists held at the last sync. |
| `settings` | Your settings (simulation mode, finish thresholds, pause block), the linked accounts (your SensCritique username and your Naka account identifier, used to stop if another account signs in), the result of the last sync and of the last finish, and hourly write counters. |
| `ratings` | The ratings waiting to be given (the « À noter » list). |
| `ficheLinks` | Links between a Naka title page and a SensCritique title that you made by hand, for display. |
| `ficheUndo` | The last rating given from a Naka title page and what it replaced, so « Annuler » can put it back (10 minutes). |

**Tokens are never stored.** The SensCritique session token is read from your logged-in session at the
moment of each request and kept in memory only; the Naka token stays in the extension's script inside the Naka tab. Neither is
written to storage, a log, an error message or an export. The extension sets no cookies of its own.

## Where it is stored

On your computer only, in your browser profile's extension storage. It is not synchronised to other
devices and is not readable by websites.

## Where data is sent

Only to `naka.cx` and `senscritique.com` (`www` and `apollo`), on your behalf and to do what you asked:
read your watchlists, mark a title as seen, give a rating, add or remove a title from a list. These
requests use your existing session on each site, exactly as if you made them yourself. Nothing is sent
anywhere else, and nothing is sent to the developer.

## How long it is kept

Until you erase it from the extension's page (« Réinitialiser », « Oublier les comptes liés », see
below), or until you remove the extension, which deletes its storage.

## Your rights

All on the extension's page, Réglages tab, « Données enregistrées » section:

- **Access and portability**: « Exporter mes données » downloads a JSON file with the five entries above.
- **Erasure**: « Oublier les comptes liés » forgets the linked accounts; « Réinitialiser » erases the
  sync state, the ratings waiting, the display links and the undo record (your settings, the mode and
  the linked accounts are kept). Removing the extension erases everything.

## Contact

Questions about this policy: open an issue on the project's GitHub repository.
