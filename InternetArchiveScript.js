const platform = {
  name: "Internet Archive",
  baseUrl: "https://archive.org",
  searchUrl: "https://archive.org/advancedsearch.php",
  metadataUrl: "https://archive.org/metadata/",
  imageUrl: "https://archive.org/services/img/",
  bannerUrl: "https://dn710002.ca.archive.org/0/items/ad-18-e-478-1133-4-dc-2-9-ab-6-41-ec-22-bc-7493/AD18E478-1133-4DC2-9AB6-41EC22BC7493.png",
  icon: "https://archive.org/images/glogo.jpg",
  detailsPath: "/details/",
  downloadPath: "/download/"
};

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
  "year",
  "publicdate",
  "downloads",
  "item_size",
  "collection",
  "language",
  "subject",
  "runtime"
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
  // Use a simple fulltext search sorted by downloads — IA's Solr wildcard prefix
  // queries are unreliable and often return 0 results for short terms.
  const searchQuery = '(mediatype:movies OR mediatype:audio) AND -mediatype:(collection) AND (' + quoteQuery(query) + ')';
  const url = buildAdvancedSearchUrl(searchQuery, 8, 1, ["downloads desc"]);
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
    types: [Type.Feed.Mixed, Type.Feed.Videos, Type.Feed.Videos],
    sorts: [Type.Order.Chronological, "Most Downloaded"],
    filters: [
      new FilterGroup("Language", [
        new FilterCapability("English", "English", "language"),
        new FilterCapability("Spanish", "Spanish", "language"),
        new FilterCapability("French", "French", "language"),
        new FilterCapability("German", "German", "language"),
        new FilterCapability("Portuguese", "Portuguese", "language"),
        new FilterCapability("Russian", "Russian", "language"),
        new FilterCapability("Chinese", "Chinese", "language"),
        new FilterCapability("Japanese", "Japanese", "language"),
        new FilterCapability("Italian", "Italian", "language"),
        new FilterCapability("Silent", "Silent", "language")
      ], false, "language")
    ]
  };
};

source.search = function(query, type, order, filters, continuationToken) {
  const page = getPageFromToken(continuationToken);
  const searchQuery = buildSearchQuery(query, type, filters);
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
    filters: filters,
    page: page + 1
  });
};

source.getSearchChannelContentsCapabilities = function() {
  return {
    types: [Type.Feed.Mixed, Type.Feed.Videos, Type.Feed.Videos],
    sorts: [Type.Order.Chronological, "Most Downloaded"],
    filters: []
  };
};

source.searchChannelContents = function(channelUrl, query, type, order, filters, continuationToken) {
  const creatorName = extractCreatorIdentifier(channelUrl);
  const page = getPageFromToken(continuationToken);
  const creatorQuery = buildCreatorQuery(creatorName, query, type, filters);
  // Default to original date descending (newest first) for creator channels
  let sort = ["date desc"];
  if (order === "Most Downloaded") {
    sort = ["downloads desc"];
  }

  const url = buildAdvancedSearchUrl(creatorQuery, CHANNEL_ROWS, page, sort);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformVideo).filter(Boolean);
  return new InternetArchiveVideoPager(results, hasMoreResults(response, page, CHANNEL_ROWS), {
    kind: "searchChannelContents",
    url: channelUrl,
    query: query,
    type: type,
    order: order,
    filters: filters,
    page: page + 1
  });
};

source.searchChannels = function(query, continuationToken) {
  const page = getPageFromToken(continuationToken);
  // Search for items with creators matching the query, then extract unique creators
  const creatorSearchQuery = buildCreatorSearchQuery(query);
  const url = buildAdvancedSearchUrl(creatorSearchQuery, CHANNEL_ROWS, page, ["downloads desc"]);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  
  // Extract unique creators from the search results
  const creators = extractUniqueCreators(docs);
  const results = creators.map(creatorNameToPlatformChannel).filter(Boolean);
  
  return new InternetArchiveChannelPager(results, hasMoreResults(response, page, CHANNEL_ROWS), {
    kind: "searchChannels",
    query: query,
    page: page + 1
  });
};

source.isChannelUrl = function(url) {
  return /^https:\/\/archive\.org\/details\/[^?#]+#creator$/.test(url || "");
};

source.getChannel = function(url) {
  const creatorName = extractCreatorIdentifier(url);
  return new PlatformChannel({
    id: makePlatformId("creator:" + creatorName),
    name: creatorName,
    thumbnail: platform.imageUrl + encodeURIComponent(creatorName),
    banner: platform.bannerUrl,
    subscribers: 0,
    description: "Videos by " + creatorName,
    url: normalizeCreatorUrl(creatorName),
    links: []
  });
};

source.getChannelContents = function(url, type, order, filters, continuationToken) {
  const creatorName = extractCreatorIdentifier(url);
  const page = getPageFromToken(continuationToken);
  const query = buildCreatorQuery(creatorName, null, type, filters);
  // Default to original date descending (newest first) for creator channels
  let sort = ["date desc"];
  if (order === "Most Downloaded") {
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
    filters: filters,
    page: page + 1
  });
};

source.isContentDetailsUrl = function(url) {
  return /^https:\/\/archive\.org\/details\/[^?#]+(?:\?[^#]*)?$/.test(url || "") && !source.isChannelUrl(url);
};

source.getContentDetails = function(url) {
  const identifier = extractDetailsIdentifier(url);
  const payload = apiGetJson(platform.metadataUrl + encodeURIComponent(identifier));
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
    subtitles: subtitles,
    getContentRecommendations: function () {
      return getSimilarVideosPager(identifier, payload);
    }
  });
};

source.getRelatedContent = function(url, continuationToken) {
  const identifier = extractDetailsIdentifier(url);
  const payload = apiGetJson(platform.metadataUrl + encodeURIComponent(identifier));
  const metadata = payload.metadata || {};
  const mediatype = safeString(metadata.mediatype);
  const collection = pickPrimaryCollection(metadata.collection);

  let query = 'mediatype:("' + mediatype + '") AND -identifier:("' + identifier + '")';
  if (collection) {
    query += ' AND collection:("' + escapeQueryValue(collection) + '")';
  } else {
    const subjects = safeString(metadata.subject).split(";")[0].trim();
    if (subjects) {
      query += ' AND subject:("' + escapeQueryValue(subjects) + '")';
    }
  }

  const searchUrl = buildAdvancedSearchUrl(query, 10, 1, ["downloads desc"]);
  const response = apiGetJson(searchUrl);
  const docs = getDocs(response);
  const results = docs.map(docToPlatformVideo).filter(Boolean);

  return new VideoPager(results, false);
};

function getSimilarVideosPager(identifier, payload) {
  const metadata = payload.metadata || {};
  const mediatype = safeString(metadata.mediatype);
  const collection = pickPrimaryCollection(metadata.collection);
  const subjects = safeString(metadata.subject);
  const creator = pickPrimaryCreator(metadata.creator);
  
  // Build query for similar videos
  let queryParts = ['mediatype:("' + mediatype + '")', '-mediatype:(collection)', '-identifier:("' + identifier + '")'];
  
  // Prioritize by collection
  if (collection) {
    queryParts.push('collection:("' + escapeQueryValue(collection) + '")');
  }
  
  // Add subject matching
  if (subjects) {
    const subjectList = subjects.split(";").map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    if (subjectList.length > 0) {
      const subjectQueries = subjectList.slice(0, 3).map(function(s) { return 'subject:("' + escapeQueryValue(s) + '")'; });
      queryParts.push('(' + subjectQueries.join(" OR ") + ')');
    }
  }
  
  // Add creator matching as fallback
  if (creator && !collection) {
    queryParts.push('creator:("' + escapeQueryValue(creator) + '")');
  }
  
  const query = queryParts.join(" AND ");
  const searchUrl = buildAdvancedSearchUrl(query, 15, 1, ["downloads desc"]);
  
  try {
    const response = apiGetJson(searchUrl);
    const docs = getDocs(response);
    const results = docs.map(docToPlatformVideo).filter(Boolean);
    return new VideoPager(results, false);
  } catch (e) {
    return new VideoPager([], false);
  }
}

//#region playlists
source.isPlaylistUrl = function(url) {
  // IA collections are treated as playlists
  // Format: https://archive.org/details/collection-name
  // Exclude creator channels (#creator) and regular items
  return /^https:\/\/archive\.org\/details\/[^?#]+$/.test(url || "");
};

source.getPlaylist = function(url) {
  const identifier = extractDetailsIdentifier(url);
  const payload = apiGetJson(platform.metadataUrl + encodeURIComponent(identifier));
  
  if (!payload || !payload.metadata) {
    throw new ScriptException("Unable to load playlist metadata");
  }
  
  const metadata = payload.metadata;
  const isCollection = payload.is_collection || safeString(metadata.mediatype) === "collection";
  
  if (!isCollection) {
    throw new ScriptException("Not a valid playlist/collection");
  }
  
  // Get videos in this collection
  const collectionVideos = getCollectionVideos(identifier, 1);
  
  return new PlatformPlaylistDetails({
    id: makePlatformId("playlist:" + identifier),
    name: firstNonEmpty(metadata.title, identifier),
    thumbnails: new Thumbnails([new Thumbnail(platform.imageUrl + encodeURIComponent(identifier), 0)]),
    author: new PlatformAuthorLink(
      makePlatformId("archiveorg"),
      "Internet Archive",
      platform.baseUrl,
      platform.imageUrl + "internetarchive"
    ),
    url: url,
    thumbnail: platform.imageUrl + encodeURIComponent(identifier),
    videoCount: collectionVideos.videoCount,
    contents: new PlaylistContentsPager(collectionVideos.videos, collectionVideos.hasMore, {
      identifier: identifier,
      page: 2
    })
  });
};

source.searchPlaylists = function(query, type, order, filters, continuationToken) {
  const page = getPageFromToken(continuationToken);
  // Search for collections matching the query
  const collectionQuery = 'mediatype:("collection") AND (' + quoteQuery(query) + ')';
  const searchUrl = buildAdvancedSearchUrl(collectionQuery, SEARCH_ROWS, page, ["downloads desc"]);
  const response = apiGetJson(searchUrl);
  const docs = getDocs(response);
  
  const results = docs.map(docToPlatformPlaylist).filter(Boolean);
  const hasMore = hasMoreResults(response, page, SEARCH_ROWS);
  
  return new PlaylistSearchPager(results, hasMore, {
    query: query,
    page: page + 1
  });
};
//#endregion

source.getComments = function(url, continuationToken) {
  if (continuationToken) {
    return new CommentPager([], false);
  }
  const identifier = extractDetailsIdentifier(url);
  const payload = apiGetJson(platform.metadataUrl + encodeURIComponent(identifier));
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
        platform.baseUrl + "/details/" + authorId,
        platform.icon
      ),
      message: message,
      date: toUnixTimestamp(review.reviewdate || review.createdate),
      replyCount: 0,
      rating: (function() {
        const stars = toNumber(review.stars);
        if (stars > 0) return new RatingScaler(stars / 5);
        return new RatingLikes(0);
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
      return source.search(this.context.query, this.context.type || Type.Feed.Mixed, this.context.order, this.context.filters || {}, this.context.page);
    }
    if (this.context.kind === "channelContents") {
      return source.getChannelContents(this.context.url, this.context.type || Type.Feed.Mixed, this.context.order, this.context.filters || {}, this.context.page);
    }
    if (this.context.kind === "searchChannelContents") {
      return source.searchChannelContents(this.context.url, this.context.query, this.context.type || Type.Feed.Mixed, this.context.order, this.context.filters || {}, this.context.page);
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

class PlaylistContentsPager extends VideoPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }

  nextPage() {
    const nextPageResults = getCollectionVideos(this.context.identifier, this.context.page);
    this.results = nextPageResults.videos;
    this.hasMore = nextPageResults.hasMore;
    this.context.page++;
    return this;
  }
}

class PlaylistSearchPager extends VideoPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }

  nextPage() {
    return source.searchPlaylists(this.context.query, null, null, null, this.context.page);
  }
}

function getHomeSort() {
  const option = safeString(pluginSettings.homeSortIndex, "0");
  return option === "1" ? ["publicdate desc"] : ["downloads desc"];
}

function buildMediaQuery() {
  return getMediaTypeQuery(pluginSettings.homeMediaTypeIndex) + " AND -mediatype:(collection)";
}

function buildSearchQuery(query, type, filters) {
  const text = quoteQuery(query);
  let mediaQuery = getMediaTypeQuery();
  if (type === Type.Feed.Videos) {
    mediaQuery = 'mediatype:("movies")';
  } else if (type === Type.Feed.Videos) {
    mediaQuery = 'mediatype:("audio")';
  }

  let fullQuery = mediaQuery + " AND -mediatype:(collection) AND (" + text + ")";
  if (filters) {
    const langVal = filters && filters['language'] && filters['language'][0];
    if (langVal) {
      fullQuery += ' AND language:(' + escapeQueryValue(langVal) + ')';
    }
  }
  return fullQuery;
}

function buildCollectionSearchQuery(query) {
  return 'mediatype:("collection") AND (' + quoteQuery(query) + ")";
}

function buildCreatorSearchQuery(query) {
  // Search for items with creators matching the query text
  return '(mediatype:("movies") OR mediatype:("audio")) AND -mediatype:(collection) AND creator:("' + escapeQueryValue(query) + '")';
}

function extractUniqueCreators(docs) {
  const seen = {};
  const creators = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (!doc || !doc.creator) continue;
    
    const creatorList = Array.isArray(doc.creator) ? doc.creator : [doc.creator];
    for (let j = 0; j < creatorList.length; j++) {
      const creatorName = safeString(creatorList[j]);
      if (creatorName && !seen[creatorName]) {
        seen[creatorName] = true;
        creators.push(creatorName);
      }
    }
  }
  return creators;
}

function creatorNameToPlatformChannel(creatorName) {
  if (!creatorName) return null;
  return new PlatformChannel({
    id: makePlatformId("creator:" + creatorName),
    name: creatorName,
    thumbnail: platform.imageUrl + encodeURIComponent(creatorName),
    banner: platform.bannerUrl,
    subscribers: 0,
    description: "Videos by " + creatorName,
    url: normalizeCreatorUrl(creatorName),
    links: []
  });
}

function buildCollectionQuery(identifier, query, type, filters) {
  let mediaQuery = getMediaTypeQuery();
  if (type === Type.Feed.Videos) {
    mediaQuery = 'mediatype:("movies")';
  } else if (type === Type.Feed.Videos) {
    mediaQuery = 'mediatype:("audio")';
  }
  let base = mediaQuery + ' AND -mediatype:(collection) AND collection:("' + escapeQueryValue(identifier) + '")';
  if (query && safeString(query).length > 0) {
    base += " AND (" + quoteQuery(query) + ")";
  }
  const colLangVal = filters && filters['language'] && filters['language'][0];
  if (colLangVal) {
    base += ' AND language:(' + escapeQueryValue(colLangVal) + ')';
  }
  return base;
}

function buildCreatorQuery(creatorName, query, type, filters) {
  let mediaQuery = getMediaTypeQuery();
  if (type === Type.Feed.Videos) {
    mediaQuery = 'mediatype:("movies")';
  } else if (type === Type.Feed.Videos) {
    mediaQuery = 'mediatype:("audio")';
  }
  let base = mediaQuery + ' AND -mediatype:(collection) AND creator:("' + escapeQueryValue(creatorName) + '")';
  if (query && safeString(query).length > 0) {
    base += " AND (" + quoteQuery(query) + ")";
  }
  const langVal = filters && filters['language'] && filters['language'][0];
  if (langVal) {
    base += ' AND language:(' + escapeQueryValue(langVal) + ')';
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

  let url = platform.searchUrl +
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
    duration: parseRuntime(doc.runtime) || 0,
    viewCount: toNumber(doc.downloads),
    url: normalizeDetailsUrl(identifier),
    isLive: false
  });
}

function parseRuntime(runtime) {
  if (!runtime) return null;
  // IA runtime can be "HH:MM:SS", "MM:SS", or even just minutes
  const parts = String(runtime).split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1 && !isNaN(parts[0])) {
    return parts[0] * 60;
  }
  return null;
}

function docToPlatformChannel(doc) {
  if (!doc || !doc.identifier) {
    return null;
  }
  const identifier = safeString(doc.identifier);
  return new PlatformChannel({
    id: makePlatformId("collection:" + identifier),
    name: firstNonEmpty(doc.title, identifier),
    thumbnail: platform.imageUrl + encodeURIComponent(identifier),
    banner: platform.imageUrl + encodeURIComponent(identifier),
    subscribers: toNumber(doc.downloads),
    description: stringifyDescription(doc.description),
    url: normalizeCollectionUrl(identifier),
    links: []
  });
}

function docToPlatformPlaylist(doc) {
  if (!doc || !doc.identifier) {
    return null;
  }
  const identifier = safeString(doc.identifier);
  return new PlatformPlaylist({
    id: makePlatformId("playlist:" + identifier),
    name: firstNonEmpty(doc.title, identifier),
    thumbnail: platform.imageUrl + encodeURIComponent(identifier),
    videoCount: toNumber(doc.items_count || doc.downloads),
    url: normalizeCollectionUrl(identifier)
  });
}

function getCollectionVideos(identifier, page) {
  // Query for items in this collection, sorted by date (newest first)
  const query = '(mediatype:("movies") OR mediatype:("audio")) AND -mediatype:(collection) AND collection:("' + escapeQueryValue(identifier) + '")';
  const url = buildAdvancedSearchUrl(query, CHANNEL_ROWS, page, ["date desc"]);
  const response = apiGetJson(url);
  const docs = getDocs(response);
  const videos = docs.map(docToPlatformVideo).filter(Boolean);
  const total = response && response.response ? toNumber(response.response.numFound) : 0;
  const hasMore = page * CHANNEL_ROWS < total;
  
  return {
    videos: videos,
    hasMore: hasMore,
    videoCount: total
  };
}

function metadataToPlatformChannel(payload) {
  const metadata = payload.metadata || {};
  const identifier = safeString(metadata.identifier);
  return new PlatformChannel({
    id: makePlatformId("collection:" + identifier),
    name: firstNonEmpty(metadata.title, identifier),
    thumbnail: platform.imageUrl + encodeURIComponent(identifier),
    banner: platform.imageUrl + encodeURIComponent(identifier),
    subscribers: toNumber(metadata.downloads),
    description: stringifyDescription(metadata.description),
    url: normalizeCollectionUrl(identifier),
    links: []
  });
}

function buildAuthorLink(identifier, creator, collections) {
  const creatorName = pickPrimaryCreator(creator);
  const collectionId = pickPrimaryCollection(collections);
  const authorName = firstNonEmpty(creatorName, collectionId, identifier);
  // Prefer creator channel if available, fallback to collection
  const channelUrl = creatorName ? normalizeCreatorUrl(creatorName) : normalizeCollectionUrl(collectionId || identifier);
  const thumbnailUrl = collectionId ? platform.imageUrl + encodeURIComponent(collectionId) : platform.imageUrl + encodeURIComponent(identifier);
  return new PlatformAuthorLink(
    makePlatformId(creatorName ? "creator:" + creatorName : "collection:" + (collectionId || identifier)),
    authorName,
    channelUrl,
    thumbnailUrl,
    0
  );
}

function pickPrimaryCreator(creator) {
  if (Array.isArray(creator) && creator.length > 0) {
    return safeString(creator[0]);
  }
  if (typeof creator === "string" && creator.length > 0) {
    return creator;
  }
  return null;
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
    new Thumbnail(platform.imageUrl + encodeURIComponent(identifier), 512)
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
      const subUrl = buildDownloadUrl(identifier, file.name);
      subs.push({
        name: safeString(file.title || file.name),
        url: subUrl,
        format: lowerName.endsWith(".srt") ? "srt" : "vtt",
        getSubtitles: function() {
          const resp = http.GET(subUrl, {}, false);
          return resp.isOk ? resp.body : "";
        }
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
  return platform.baseUrl + platform.downloadPath + encodeURIComponent(identifier) + "/" + encodePath(fileName);
}

function createMediaDescriptor(sources) {
  const hasVideo = sources.video.length > 0;
  const hasAudio = sources.audio.length > 0;

  if (hasVideo && hasAudio) {
    // Truly separate video + audio tracks (rare on IA) — use UnMux
    return new UnMuxVideoSourceDescriptor(sources.video, sources.audio);
  }
  if (hasVideo) {
    // Muxed video files (mp4, avi, ogv, etc) — audio is already embedded
    return new VideoSourceDescriptor(sources.video);
  }
  if (hasAudio) {
    // Audio-only items (mp3, ogg, flac) — Grayjay plays these via VideoSourceDescriptor
    return new VideoSourceDescriptor(sources.audio);
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
  return platform.baseUrl + platform.detailsPath + encodeURIComponent(identifier);
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

function extractCreatorIdentifier(url) {
  return extractDetailsIdentifier(url).replace(/#creator$/, "");
}

function normalizeCreatorUrl(creatorName) {
  return platform.baseUrl + platform.detailsPath + encodeURIComponent(creatorName) + "#creator";
}

function makePlatformId(id) {
  return new PlatformID(platform.name, id, config.id);
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
