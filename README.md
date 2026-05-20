### Grayjay Internet Archive

This plugin adds support for the platform [Internet Archive](https://archive.org/), allowing you to browse and play public audio and video content in Grayjay.

This is a maintained fork of [Wesley Swank's plugin](https://github.com/swankwc/grayjay-source-internet-archive) with significant changes added.

### Installation

You can install the plugin by scanning this QR code:

![QR Code](https://raw.githubusercontent.com/b-risk/grayjay-source-internet-archive/refs/heads/main/Imgs/qr-code.png)

Alternatively, you can add it manually by using this link:
```
grayjay://plugin/https://raw.githubusercontent.com/b-risk/grayjay-source-internet-archive/refs/heads/main/InternetArchiveConfig.json
```

### Features

- [x] Home feed (popular and recently added audio/video)
- [x] Advanced search (media type, sort by downloads/date, year/language filters)
- [x] Search suggestions
- [x] Creators as channels (sorted newest first, with pagination and search)
- [x] Item details (descriptions, subject tags, community reviews)
- [x] Video playback (direct files, HLS, DASH)
- [x] Audio playback (mp3, ogg, flac, and more)
- [x] Subtitles (.srt, .vtt)
- [x] Related content ("More like this")
- [x] Video comments
- [x] Infinite scroll pagination

### Contributions

Contributions are welcome, feel free to submit pull requests if you think you can improve something or fix a bug.

### Signing

```bash
# Generate keypair
ssh-keygen -t rsa -b 2048 -m PEM -f ./private-key.pem

# Encode it in Base64 and set the environment variable
export SIGNING_PRIVATE_KEY="$(base64 -w 0 ./private-key.pem)"

# Run the sign script (use git bash on Windows):
sh ./sign-script.sh ./InternetArchiveScript.js ./InternetArchiveConfig.json
```
