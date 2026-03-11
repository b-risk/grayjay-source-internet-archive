# GitHub Pages Deploy

GitHub Pages is free for public repositories, which is the simplest way to host this plugin.

## Recommended repo layout

Use a dedicated repository for the plugin and put these files at the repository root:

- `InternetArchiveConfig.json`
- `InternetArchiveScript.js`
- `README.md`

## Publish steps

1. Create a new public GitHub repository.
2. Upload the plugin files to your repository.
3. In GitHub:
   - `Settings` -> `Pages`
   - `Build and deployment`
   - `Source` -> `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
4. Wait for GitHub Pages to publish.

Your Pages URL will look like:

```text
https://swankwc.github.io/grayjay-source-internet-archive/
```

Your plugin config URL will then be:

```text
https://swankwc.github.io/grayjay-source-internet-archive/InternetArchiveConfig.json
```

## Required config updates before release

Update these fields in `InternetArchiveConfig.json`:

- `sourceUrl`
- `repositoryUrl`
- `authorUrl` if you want it to point at your repo/profile

Example:

```json
"sourceUrl": "https://swankwc.github.io/grayjay-source-internet-archive/InternetArchiveConfig.json",
"repositoryUrl": "https://github.com/swankwc/grayjay-source-internet-archive"
```

## Before sharing widely

1. Generate script signing values.
2. Fill in:
   - `scriptSignature`
   - `scriptPublicKey`
3. Increment `version`.
4. Reinstall from the GitHub Pages URL.

## Practical note

If your local IP changes, do not keep using the current `sourceUrl` for anything beyond LAN testing. Replace it with the Pages URL before you treat the plugin as installed/distributed.
