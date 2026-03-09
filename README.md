# Internet Archive Grayjay MVP

Copyright (C) 2026 Wesley Swank

Licensed under AGPL-3.0-or-later. See `LICENSE`.

This is a Grayjay plugin MVP for Internet Archive.

Current scope:

- Home feed using popular or recent public audio/video items
- Search for audio/video items
- Search collections as channels
- Open collections as channels and browse their contents
- Open item details and play direct derivative media files
- Prefer cleaner direct derivatives and fall back to HLS/DASH manifests when available
- Limit duplicate and non-playable candidates in item details

Intentional v1 limits:

- No comments
- No books/software/text support
- No login/auth
- No collection deep-link detection outside the plugin-generated `#collection` URL form
- No aggressive per-item metadata enrichment

## Files

- `/Users/wesley/Documents/New project/internet-archive-grayjay/InternetArchiveConfig.json`
- `/Users/wesley/Documents/New project/internet-archive-grayjay/InternetArchiveScript.js`

## Dev test flow

1. Serve the folder over your LAN.
2. Load the config in Grayjay DevServer.
3. Test:
   - search: `big buck bunny`
   - content details: `https://archive.org/details/BigBuckBunny_124`
   - channel: `https://archive.org/details/opensource_movies#collection`

Example:

```sh
cd /Users/wesley/Documents/New\ project/internet-archive-grayjay
python3 -m http.server 8123 --bind 192.168.10.128
```

Then load:

```text
http://192.168.10.128:8123/InternetArchiveConfig.json
```

If your Mac IP changes, update `sourceUrl` in the config to match before reinjecting.

## Before public release

- Replace `sourceUrl` with the real hosted config URL
- Add script signing fields
- Bump `version`
- Narrow `allowUrls` further if you decide to pin to specific Archive hosts
