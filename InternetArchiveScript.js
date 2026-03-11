const PLATFORM = "Internet Archive";
const BASE_URL = "https://archive.org";
const SEARCH_URL = BASE_URL + "/advancedsearch.php";
const METADATA_URL = BASE_URL + "/metadata/";
const IMAGE_URL = BASE_URL + "/services/img/";
const DETAILS_PATH = "/details/";
const DOWNLOAD_PATH = "/download/";

let config = {};
let pluginSettings = {};

const SEARCH_ROWS = 20;
const CHANNEL_ROWS = 20;
const SEARCH_FIELDS = [
  "identifier",
  "title",
  "creator",
  "mediatype",
  "description",
  "date",
  "publicdate",
  "downloads",
  "item_size",
  "collection"
];

const AUDIO_EXTENSIONS = {
  mp3: { container: "audio/mpeg", codec: "mp3" },
  m4a: { container: "audio/mp4", codec: "mp4a.40.2" },
  flac: { container: "audio/flac", codec: "flac" },
  ogg: { container: "audio/ogg", codec: "vorbis" },
  oga: { container: "audio/ogg", codec: "vorbis" },
  opus: { container: "audio/ogg", codec: "opus" },
  wav: { container: "audio/wav", codec: "pcm" }
};

const VIDEO_EXTENSIONS = {
  mp4: { container: "video/mp4", codec: "h264" },
  m4v: { container: "video/mp4", codec: "h264" },
  webm: { container: "video/webm", codec: "vp9" },
  ogv: { container: "video/ogg", codec: "theora" },
  mkv: { container: "video/x-matroska", codec: "unknown" },
  avi: { container: "video/x-msvideo", codec: "unknown" },
  mpg: { container: "video/mpeg", codec: "mpeg" },
  mpeg: { container: "video/mpeg", codec: "mpeg" },
  mov: { container: "video/quicktime", codec: "unknown" }
};

const TEXT_LIKE_EXTENSIONS = {
  txt: true,
  xml: true,
  json: true,
  sqlite: true,
  jpg: true,
  jpeg: true,
  png: true,
  gif: true,
  webp: true,
  torrent: true,
  pdf: true
};

source.enable = function(conf, settings, savedState) {
  config = conf ?? {};
  pluginSettings = settings ?? {};
};

source.getHome = function(continuationToken) {
  const page = getPageFromToken(continuationToken);
  const sort = getHomeSort();
  const query = buildMediaQuery();
  const url = buildAdvancedSearchUrl(query, SEARCH_ROWS, page, sort);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformVideo).filter(Boolean);
  return new InternetArchiveVideoPager(results, hasMoreResults(response, page, SEARCH_ROWS), {
    kind: "home",
    page: page + 1
  });
};

source.searchSuggestions = function(query) {
  if (!query || query.length < 2) {
    return [];
  }
  const searchQuery = 'title:(' + quoteQuery(query + "*") + ') AND (mediatype:movies OR mediatype:audio)';
  const url = buildAdvancedSearchUrl(searchQuery, 10, 1, ["downloads desc"]);
  try {
    const response = apiGetJson(url);
    const docs = getDocs(response);
    return docs.map(function(doc) {
      return safeString(doc.title);
    }).filter(function(title, index, self) {
      return title && self.indexOf(title) === index;
    });
  } catch (e) {
    return [];
  }
};

source.getSearchCapabilities = function() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Video, Type.Feed.Audio],
    sorts: [Type.Order.Chronological, "Most Downloaded"],
    filters: []
  };
};

source.search = function(query, type, order, filters, continuationToken) {
  const page = getPageFromToken(continuationToken);
  const searchQuery = buildSearchQuery(query, type);
  let sort = null;
  if (order === Type.Order.Chronological) {
    sort = ["publicdate desc"];
  } else if (order === "Most Downloaded") {
    sort = ["downloads desc"];
  }

  const url = buildAdvancedSearchUrl(searchQuery, SEARCH_ROWS, page, sort);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformVideo).filter(Boolean);
  return new InternetArchiveVideoPager(results, hasMoreResults(response, page, SEARCH_ROWS), {
    kind: "search",
    query: query,
    type: type,
    order: order,
    page: page + 1
  });
};

source.getSearchChannelContentsCapabilities = function() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Video, Type.Feed.Audio],
    sorts: [Type.Order.Chronological, "Most Downloaded"],
    filters: []
  };
};

source.searchChannelContents = function(channelUrl, query, type, order, filters, continuationToken) {
  const identifier = extractCollectionIdentifier(channelUrl);
  const page = getPageFromToken(continuationToken);
  const collectionQuery = buildCollectionQuery(identifier, query, type);
  let sort = null;
  if (order === Type.Order.Chronological) {
    sort = ["publicdate desc"];
  } else if (order === "Most Downloaded") {
    sort = ["downloads desc"];
  }

  const url = buildAdvancedSearchUrl(collectionQuery, CHANNEL_ROWS, page, sort);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformVideo).filter(Boolean);
  return new InternetArchiveVideoPager(results, hasMoreResults(response, page, CHANNEL_ROWS), {
    kind: "searchChannelContents",
    url: channelUrl,
    query: query,
    type: type,
    order: order,
    page: page + 1
  });
};

source.searchChannels = function(query, continuationToken) {
  const page = getPageFromToken(continuationToken);
  const collectionQuery = buildCollectionSearchQuery(query);
  const url = buildAdvancedSearchUrl(collectionQuery, CHANNEL_ROWS, page, ["downloads desc"]);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformChannel).filter(Boolean);
  return new InternetArchiveChannelPager(results, hasMoreResults(response, page, CHANNEL_ROWS), {
    kind: "searchChannels",
    query: query,
    page: page + 1
  });
};

source.isChannelUrl = function(url) {
  return /^https:\/\/archive\.org\/details\/[^?#]+#collection$/.test(url || "");
};

source.getChannel = function(url) {
  const identifier = extractCollectionIdentifier(url);
  const payload = apiGetJson(METADATA_URL + encodeURIComponent(identifier));
  return metadataToPlatformChannel(payload);
};

source.getChannelContents = function(url, type, order, filters, continuationToken) {
  const identifier = extractCollectionIdentifier(url);
  const page = getPageFromToken(continuationToken);
  const query = buildCollectionQuery(identifier, null, type);
  let sort = null;
  if (order === Type.Order.Chronological) {
    sort = ["publicdate desc"];
  } else if (order === "Most Downloaded") {
    sort = ["downloads desc"];
  }

  const searchUrl = buildAdvancedSearchUrl(query, CHANNEL_ROWS, page, sort);
  const response = apiGetJson(searchUrl);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformVideo).filter(Boolean);
  return new InternetArchiveVideoPager(results, hasMoreResults(response, page, CHANNEL_ROWS), {
    kind: "channelContents",
    url: url,
    type: type,
    order: order,
    page: page + 1
  });
};

source.isContentDetailsUrl = function(url) {
  return /^https:\/\/archive\.org\/details\/[^?#]+(?:\?[^#]*)?$/.test(url || "") && !source.isChannelUrl(url);
};

source.getContentDetails = function(url) {
  const identifier = extractDetailsIdentifier(url);
  const payload = apiGetJson(METADATA_URL + encodeURIComponent(identifier));
  if (!payload || !payload.metadata) {
    throw new ScriptException("Unable to load Internet Archive item metadata");
  }
  if (payload.is_collection || safeString(payload.metadata.mediatype) === "collection") {
    throw new ScriptException("Collections should be opened as channels");
  }

  const sources = buildSources(identifier, payload.files || []);
  if (sources.video.length === 0 && sources.audio.length === 0 && sources.hls.length === 0 && sources.dash.length === 0) {
    logFailedItemDiagnostics(identifier, payload);
    throw new ScriptException(buildNoPlayableMediaMessage(identifier, payload));
  }

  const mediaDescriptor = createMediaDescriptor(sources);
  const hlsSource = sources.hls.length > 0 ? sources.hls[0] : null;
  const dashSource = sources.dash.length > 0 ? sources.dash[0] : null;
  const subtitles = buildSubtitles(identifier, payload.files || []);

  let description = stringifyDescription(payload.metadata.description);
  const subjects = safeString(payload.metadata.subject);
  if (subjects) {
    description += "\n\nTags: " + subjects;
  }

  return new PlatformVideoDetails({
    id: makePlatformId(identifier),
    name: firstNonEmpty(payload.metadata.title, identifier),
    thumbnails: buildThumbnails(identifier),
    author: buildAuthorLink(identifier, payload.metadata.creator, payload.metadata.collection),
    datetime: toUnixTimestamp(payload.metadata.date || payload.metadata.publicdate),
    uploadDate: toUnixTimestamp(payload.metadata.date || payload.metadata.publicdate),
    duration: Math.round(sources.duration || 0),
    viewCount: toNumber(payload.metadata.downloads),
    url: normalizeDetailsUrl(identifier),
    isLive: false,
    description: description,
    video: mediaDescriptor,
    hls: hlsSource,
    dash: dashSource,
    live: null,
    subtitles: subtitles
  });
};

source.getComments = function(url, continuationToken) {
  if (continuationToken) {
    return new CommentPager([], false);
  }
  const identifier = extractDetailsIdentifier(url);
  const payload = apiGetJson(METADATA_URL + encodeURIComponent(identifier));
  const reviews = payload.reviews || [];

  const results = reviews.map(function(review) {
    const authorName = safeString(review.reviewer);
    const authorId = safeString(review.reviewer_itemname || review.reviewer);
    const title = safeString(review.reviewtitle);
    const body = safeString(review.reviewbody);
    const stars = safeString(review.stars);

    let message = "";
    if (title) {
      message += title + "\n\n";
    }
    if (stars) {
      message += "Rating: " + stars + "/5 stars\n";
    }
    message += body;

    return new Comment({
      contextUrl: url,
      author: new PlatformAuthorLink(
        makePlatformId("reviewer:" + authorId),
        authorName,
        BASE_URL + "/details/" + authorId,
        null
      ),
      message: message,
      timestamp: toUnixTimestamp(review.reviewdate || review.createdate),
      replyCount: 0,
      rating: (function() {
        const stars = toNumber(review.stars);
        if (stars >= 4) return new Rating(1, 0);
        if (stars <= 2) return new Rating(0, 1);
        return new Rating(0, 0);
      })()
    });
  });

  return new CommentPager(results, false);
};

source.getSubComments = function(comment) {
  return new CommentPager([], false);
};

class InternetArchiveVideoPager extends VideoPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }

  nextPage() {
    if (this.context.kind === "home") {
      return source.getHome(this.context.page);
    }
    if (this.context.kind === "search") {
      return source.search(this.context.query, this.context.type || Type.Feed.Mixed, this.context.order, {}, this.context.page);
    }
    if (this.context.kind === "channelContents") {
      return source.getChannelContents(this.context.url, this.context.type || Type.Feed.Mixed, this.context.order, {}, this.context.page);
    }
    if (this.context.kind === "searchChannelContents") {
      return source.searchChannelContents(this.context.url, this.context.query, this.context.type || Type.Feed.Mixed, this.context.order, {}, this.context.page);
    }
    return new VideoPager([], false);
  }
}

class InternetArchiveChannelPager extends ChannelPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }

  nextPage() {
    return source.searchChannels(this.context.query, this.context.page);
  }
}

function getHomeSort() {
  const option = safeString(pluginSettings.homeSortIndex, "0");
  return option === "1" ? ["publicdate desc"] : ["downloads desc"];
}

function buildMediaQuery() {
  return getMediaTypeQuery(pluginSettings.homeMediaTypeIndex) + " AND -mediatype:(collection)";
}

function buildSearchQuery(query, type) {
  const text = quoteQuery(query);
  let mediaQuery = getMediaTypeQuery();
  if (type === Type.Feed.Video) {
    mediaQuery = 'mediatype:("movies")';
  } else if (type === Type.Feed.Audio) {
    mediaQuery = 'mediatype:("audio")';
  }
  return mediaQuery + " AND -mediatype:(collection) AND (" + text + ")";
}

function buildCollectionSearchQuery(query) {
  return 'mediatype:("collection") AND (' + quoteQuery(query) + ")";
}

function buildCollectionQuery(identifier, query, type) {
  let mediaQuery = getMediaTypeQuery();
  if (type === Type.Feed.Video) {
    mediaQuery = 'mediatype:("movies")';
  } else if (type === Type.Feed.Audio) {
    mediaQuery = 'mediatype:("audio")';
  }
  let base = mediaQuery + ' AND -mediatype:(collection) AND collection:("' + escapeQueryValue(identifier) + '")';
  if (query && safeString(query).length > 0) {
    base += " AND (" + quoteQuery(query) + ")";
  }
  return base;
}

function getMediaTypeQuery(settingValue) {
  const option = safeString(settingValue, "0");
  if (option === "1") {
    return 'mediatype:("movies")';
  }
  if (option === "2") {
    return 'mediatype:("audio")';
  }
  return '(mediatype:("movies") OR mediatype:("audio"))';
}

function buildAdvancedSearchUrl(query, rows, page, sort) {
  const fields = SEARCH_FIELDS.map(function(field) {
    return "fl[]=" + encodeURIComponent(field);
  }).join("&");

  let url = SEARCH_URL +
    "?q=" + encodeURIComponent(query) +
    "&" + fields +
    "&rows=" + rows +
    "&page=" + page +
    "&output=json";

  if (sort && sort.length > 0) {
    for (let i = 0; i < sort.length; i += 1) {
      url += "&sort[]=" + encodeURIComponent(sort[i]);
    }
  }
  return url;
}

function apiGetJson(url) {
  const response = http.GET(url, {}, false);
  if (!response.isOk) {
    throw new ScriptException("Internet Archive request failed: " + url);
  }
  return JSON.parse(response.body);
}

function getDocs(payload) {
  if (!payload || !payload.response || !payload.response.docs) {
    return [];
  }
  return payload.response.docs;
}

function hasMoreResults(payload, currentPage, rows) {
  const total = payload && payload.response ? toNumber(payload.response.numFound) : 0;
  return currentPage * rows < total;
}

function docToPlatformVideo(doc) {
  if (!doc || !doc.identifier || !looksPlayableDoc(doc) || shouldSkipDocFromFeed(doc)) {
    return null;
  }
  const identifier = safeString(doc.identifier);
  return new PlatformVideo({
    id: makePlatformId(identifier),
    name: firstNonEmpty(doc.title, identifier),
    thumbnails: buildThumbnails(identifier),
    author: buildAuthorLink(identifier, doc.creator, doc.collection),
    uploadDate: toUnixTimestamp(doc.date || doc.publicdate),
    duration: 0,
    viewCount: toNumber(doc.downloads),
    url: normalizeDetailsUrl(identifier),
    isLive: false
  });
}

function docToPlatformChannel(doc) {
  if (!doc || !doc.identifier) {
    return null;
  }
  const identifier = safeString(doc.identifier);
  return new PlatformChannel({
    id: makePlatformId("collection:" + identifier),
    name: firstNonEmpty(doc.title, identifier),
    thumbnail: IMAGE_URL + encodeURIComponent(identifier),
    banner: IMAGE_URL + encodeURIComponent(identifier),
    subscribers: toNumber(doc.downloads),
    description: stringifyDescription(doc.description),
    url: normalizeCollectionUrl(identifier),
    links: []
  });
}

function metadataToPlatformChannel(payload) {
  const metadata = payload.metadata || {};
  const identifier = safeString(metadata.identifier);
  return new PlatformChannel({
    id: makePlatformId("collection:" + identifier),
    name: firstNonEmpty(metadata.title, identifier),
    thumbnail: IMAGE_URL + encodeURIComponent(identifier),
    banner: IMAGE_URL + encodeURIComponent(identifier),
    subscribers: toNumber(metadata.downloads),
    description: stringifyDescription(metadata.description),
    url: normalizeCollectionUrl(identifier),
    links: []
  });
}

function buildAuthorLink(identifier, creator, collections) {
  const collectionId = pickPrimaryCollection(collections) || identifier;
  const authorName = firstNonEmpty(normalizeNameValue(creator), collectionId);
  return new PlatformAuthorLink(
    makePlatformId("collection:" + collectionId),
    authorName,
    normalizeCollectionUrl(collectionId),
    IMAGE_URL + encodeURIComponent(collectionId),
    0
  );
}

function pickPrimaryCollection(collections) {
  if (Array.isArray(collections) && collections.length > 0) {
    return safeString(collections[0]);
  }
  if (typeof collections === "string" && collections.length > 0) {
    return collections;
  }
  return null;
}

function buildThumbnails(identifier) {
  return new Thumbnails([
    new Thumbnail(IMAGE_URL + encodeURIComponent(identifier), 512)
  ]);
}

function buildSubtitles(identifier, files) {
  const subs = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!file || !file.name) {
      continue;
    }
    const lowerName = file.name.toLowerCase();
    let mime = "";
    if (lowerName.endsWith(".srt")) {
      mime = "text/srt";
    } else if (lowerName.endsWith(".vtt")) {
      mime = "text/vtt";
    }

    if (mime) {
      subs.push({
        name: safeString(file.title || file.name),
        url: buildDownloadUrl(identifier, file.name),
        mime: mime,
        format: lowerName.endsWith(".srt") ? "srt" : "vtt"
      });
    }
  }
  return subs;
}

function buildSources(identifier, files) {
  const result = { video: [], audio: [], hls: [], dash: [], duration: 0 };
  const strictCandidates = (files || []).filter(function(file) {
    return isUsableFile(file, true);
  });
  const relaxedCandidates = strictCandidates.length > 0 ? strictCandidates : (files || []).filter(function(file) {
    return isUsableFile(file, false);
  });
  const sortedFiles = relaxedCandidates.slice().sort(scoreFile).reverse();
  const seen = {};
  const maxSources = getMaxSourceCount();

  for (let i = 0; i < sortedFiles.length; i += 1) {
    const file = sortedFiles[i];
    if (!isUsableFile(file)) {
      continue;
    }

    const extension = getExtension(file.name);
    const directUrl = buildDownloadUrl(identifier, file.name);
    if (seen[directUrl]) {
      continue;
    }
    seen[directUrl] = true;

    const length = toFloat(file.length);
    if (length > result.duration) {
      result.duration = length;
    }

    if (extension === "m3u8") {
      result.hls.push(new HLSSource({
        name: buildSourceName(file),
        duration: length,
        url: directUrl
      }));
      continue;
    }

    if (extension === "mpd") {
      result.dash.push(new DashSource({
        name: buildSourceName(file),
        duration: length,
        url: directUrl
      }));
      continue;
    }

    if (VIDEO_EXTENSIONS[extension]) {
      const descriptor = VIDEO_EXTENSIONS[extension];
      result.video.push(new VideoUrlSource({
        width: toNumber(file.width),
        height: toNumber(file.height),
        container: descriptor.container,
        codec: descriptor.codec,
        name: buildSourceName(file),
        bitrate: 0,
        duration: length,
        url: directUrl
      }));
    } else if (AUDIO_EXTENSIONS[extension]) {
      const audio = AUDIO_EXTENSIONS[extension];
      result.audio.push(new AudioUrlSource({
        container: audio.container,
        name: buildSourceName(file),
        bitrate: 0,
        codecs: audio.codec,
        duration: length,
        url: directUrl,
        language: "Unknown"
      }));
    }

    if (result.video.length >= maxSources && result.audio.length >= maxSources) {
      break;
    }
  }
  return result;
}

function buildSourceName(file) {
  const parts = [];
  if (file.format) {
    parts.push(safeString(file.format));
  }
  if (file.width && file.height) {
    parts.push(file.width + "x" + file.height);
  }
  return parts.length > 0 ? parts.join(" ") : safeString(file.name);
}

function buildDownloadUrl(identifier, fileName) {
  return BASE_URL + DOWNLOAD_PATH + encodeURIComponent(identifier) + "/" + encodePath(fileName);
}

function createMediaDescriptor(sources) {
  if (sources.video.length > 0 || sources.audio.length > 0) {
    return new UnMuxVideoSourceDescriptor(sources.video, sources.audio);
  }
  if (sources.hls.length > 0) {
    return new VideoSourceDescriptor([sources.hls[0]]);
  }
  if (sources.dash.length > 0) {
    return new VideoSourceDescriptor([sources.dash[0]]);
  }
  return new VideoSourceDescriptor([]);
}

function normalizeDetailsUrl(identifier) {
  return BASE_URL + DETAILS_PATH + encodeURIComponent(identifier);
}

function normalizeCollectionUrl(identifier) {
  return normalizeDetailsUrl(identifier) + "#collection";
}

function extractDetailsIdentifier(url) {
  const match = /\/details\/([^?#]+)/.exec(url || "");
  if (!match) {
    throw new ScriptException("Invalid Internet Archive details URL");
  }
  return decodeURIComponent(match[1]);
}

function extractCollectionIdentifier(url) {
  return extractDetailsIdentifier(url).replace(/#collection$/, "");
}

function makePlatformId(id) {
  return new PlatformID(PLATFORM, id, config.id);
}

function looksPlayableDoc(doc) {
  const mediatype = safeString(doc.mediatype);
  return mediatype === "audio" || mediatype === "movies";
}

function shouldSkipDocFromFeed(doc) {
  if (!getBooleanSetting("strictFeedFilter")) {
    return false;
  }

  const title = firstNonEmpty(doc.title, "").toLowerCase();
  const identifier = safeString(doc.identifier).toLowerCase();
  const downloads = toNumber(doc.downloads);
  const itemSize = toNumber(doc.item_size);

  if (downloads <= 0 && itemSize <= 0) {
    return true;
  }
  if (title.includes("template") || identifier.includes("template")) {
    return true;
  }
  if (title.includes("capcut") || identifier.includes("capcut")) {
    return true;
  }
  if (title.includes("thumbnail pack") || identifier.includes("thumbnail-pack")) {
    return true;
  }
  return false;
}

function isUsableFile(file, strictMode) {
  if (!file || !file.name) {
    return false;
  }
  if (safeString(file.source) === "metadata") {
    return false;
  }

  const name = safeString(file.name);
  const lowerName = name.toLowerCase();
  const extension = getExtension(name);

  if (TEXT_LIKE_EXTENSIONS[extension]) {
    return false;
  }
  if (lowerName.indexOf(".thumbs/") >= 0 || lowerName.indexOf("_thumb.") >= 0 || lowerName.indexOf("__ia_thumb") >= 0) {
    return false;
  }
  if (lowerName.indexOf("_meta.") >= 0 || lowerName.indexOf("_files.") >= 0 || lowerName.indexOf("_reviews.") >= 0) {
    return false;
  }
  if (strictMode && lowerName.indexOf("sample") >= 0) {
    return false;
  }
  if (strictMode && lowerName.indexOf("trailer") >= 0) {
    return false;
  }

  if (VIDEO_EXTENSIONS[extension] || AUDIO_EXTENSIONS[extension] || extension === "m3u8" || extension === "mpd") {
    return true;
  }

  if (!strictMode) {
    const format = safeString(file.format).toLowerCase();
    if (format.includes("mpeg4") || format.includes("h.264") || format.includes("vbr mp3") || format.includes("ogg video") || format.includes("ogg vorbis")) {
      return true;
    }
    if (safeString(file.source) === "original" && !TEXT_LIKE_EXTENSIONS[extension]) {
      return true;
    }
  }
  return false;
}

function getMaxSourceCount() {
  const option = safeString(pluginSettings.maxSourceCountIndex, "1");
  if (option === "0") {
    return 2;
  }
  if (option === "1") {
    return 4;
  }
  if (option === "2") {
    return 6;
  }
  return 8;
}

function getBooleanSetting(name) {
  return safeString(pluginSettings[name], "false") === "true";
}

function buildNoPlayableMediaMessage(identifier, payload) {
  const metadata = payload && payload.metadata ? payload.metadata : {};
  const mediatype = safeString(metadata.mediatype, "unknown");
  const sample = summarizeCandidateFiles(payload && payload.files ? payload.files : []);
  return "No playable media files found for Internet Archive item '" + identifier + "' (mediatype=" + mediatype + "). Candidates: " + sample;
}

function summarizeCandidateFiles(files) {
  const summary = [];
  for (let i = 0; i < files.length && summary.length < 6; i += 1) {
    const file = files[i];
    if (!file || !file.name) {
      continue;
    }
    summary.push(file.name + (file.format ? " [" + safeString(file.format) + "]" : ""));
  }
  return summary.length > 0 ? summary.join(", ") : "none";
}

function logFailedItemDiagnostics(identifier, payload) {
  if (!getBooleanSetting("verboseFailureDiagnostics")) {
    return;
  }
  const metadata = payload && payload.metadata ? payload.metadata : {};
  const files = payload && payload.files ? payload.files : [];
  const candidateFiles = files
    .filter(function(file) { return file && file.name; })
    .slice(0, 15)
    .map(function(file) {
      return {
        name: file.name,
        format: file.format,
        source: file.source,
        original: file.original,
        size: file.size,
        length: file.length
      };
    });
  safeLog("InternetArchive failure diagnostics: " + JSON.stringify({
    identifier: identifier,
    mediatype: metadata.mediatype,
    title: metadata.title,
    fileCount: files.length,
    candidates: candidateFiles
  }));
}

function safeLog(message) {
  try {
    if (typeof log === "function") {
      log(message);
    }
  } catch (e) {
  }
}

function quoteQuery(value) {
  return '"' + escapeQueryValue(value) + '"';
}

function escapeQueryValue(value) {
  return safeString(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeString(value, fallback) {
  if (value === null || value === undefined) {
    return fallback || "";
  }
  if (Array.isArray(value)) {
    return safeString(value[0], fallback);
  }
  return String(value);
}

function normalizeNameValue(value) {
  if (Array.isArray(value)) {
    return value.map(function(v) { return safeString(v); }).join(", ");
  }
  return safeString(value);
}

function stringifyDescription(value) {
  if (Array.isArray(value)) {
    return value.map(function(v) { return safeString(v); }).join("\n\n");
  }
  return safeString(value, "");
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = safeString(arguments[i], "");
    if (value.length > 0) {
      return value;
    }
  }
  return "";
}

function toUnixTimestamp(value) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(safeString(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function getPageFromToken(token) {
  const page = Number(token);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function encodePath(path) {
  return safeString(path).split("/").map(encodeURIComponent).join("/");
}

function getExtension(path) {
  const match = /\.([A-Za-z0-9]+)$/.exec(safeString(path).toLowerCase());
  return match ? match[1] : "";
}

function scoreFile(a, b) {
  return getFileScore(a) - getFileScore(b);
}

function getFileScore(file) {
  if (!file || !file.name) {
    return -999;
  }
  const extension = getExtension(file.name);
  let score = 0;

  if (safeString(file.format).toLowerCase().indexOf("thumbnail") >= 0) {
    return -999;
  }
  if (safeString(file.original).toLowerCase().endsWith(".torrent")) {
    score += 10;
  }
  if (VIDEO_EXTENSIONS[extension]) {
    score += 50;
  }
  if (AUDIO_EXTENSIONS[extension]) {
    score += 40;
  }
  if (extension === "m3u8") {
    score += 55;
  }
  if (extension === "mpd") {
    score += 54;
  }
  if (safeString(file.source) === "derivative") {
    score += 20;
  }
  if (safeString(file.format).toLowerCase().includes("h.264")) {
    score += 15;
  }
  if (safeString(file.format).toLowerCase().includes("mp3")) {
    score += 15;
  }
  if (safeString(file.format).toLowerCase().includes("64kb")) {
    score -= 5;
  }
  if (safeString(file.name).toLowerCase().includes("sample")) {
    score -= 20;
  }
  score += toNumber(file.width) / 100;
  score += toFloat(file.length) / 1000;
  return score;
}
