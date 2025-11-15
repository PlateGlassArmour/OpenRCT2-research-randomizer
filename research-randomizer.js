/** ==================================================
 * Module: RR.config.core
 * Purpose: Central constants, names, defaults, and keys (per bible).
 * Exports: RR.config
 * Imports: None
 * Version: 3.0.0-alpha.7   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.config = {
 INTERNAL_NAME: "research-randomizer",
 UI_NAME: "Research Randomizer",
 VERSION: "3.0.0-alpha.7",
 CLASS: "rrv3.main",
 COLOURS: [24, 24, 24],
 STORAGE: { SHARED_KEY: "rr.v3.options", PARK_KEY: "rr.v3.park" },
 DEFAULTS: {
  // user-facing options
  excludeCustom: true,
  // Legacy flag kept for migration; categoryMode is now authoritative.
  preserveCategoryRatio: true,
  // "preserve" | "even"
  categoryMode: "preserve",
  researchMultiplier: 1.0,
  // Essential item modes: "ignore" | "researchable" | "start"
  essentialInfoKioskMode: "researchable",
  essentialCashMachineMode: "researchable",
  essentialFirstAidMode: "researchable",
  verboseLogging: false,
  // dev
  seed: 123456,
  automaticallyRandomizeSeed: true,
  disableWarning: false,
 },
}
/* ============= End of RR.config.core ============= */

/** ==================================================
 * Module: RR.helper.core
 * Purpose: Shared helpers (asciiLower, essential mode, category, usage scan, id caches).
 * Exports: RR.helper
 * Imports: RR.config, RR.state, RR.category
 * Version: 3.0.0-alpha.2   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.helper = (function () {
 // -------- asciiLower --------
 function asciiLower(s) {
  s = String(s || "").toLowerCase()
  var o = ""
  for (var i = 0; i < s.length; i++) {
   var c = s.charCodeAt(i)
   o += c >= 32 && c <= 127 ? s.charAt(i) : "?"
  }
  return o
 }

 // -------- Essential mode lookup --------
 var ESS_KEYS = {
  info: "essentialInfoKioskMode",
  cash: "essentialCashMachineMode",
  firstAid: "essentialFirstAidMode",
 }

 // Return "ignore" | "researchable" | "start" for a given essential key.
 function getEssentialModeForKey(key) {
  var o = RR.state && RR.state.options
  var def = "researchable"
  if (!o) {
   return def
  }
  var optKey = ESS_KEYS[key]
  if (!optKey) {
   return def
  }
  var val = o[optKey]
  if (val === "ignore" || val === "researchable" || val === "start") {
   return val
  }
  return def
 }

 // -------- Category-from-item helper --------
 function categoryFromItem(it) {
  if (!it) {
   return "rollercoaster"
  }
  // Delegate to RR.category.fromItem; it already handles non-ride items safely.
  return RR.category.fromItem(it)
 }

 // -------- Usage scanning (rides + scenery) --------
 function scanRideObjectIndices() {
  var used = {}
  try {
   if (typeof map === "undefined" || !map || !map.rides) {
    return used
   }
   var rides = map.rides
   for (var i = 0; i < rides.length; i++) {
    var r = rides[i]
    if (!r || !r.object) {
     continue
    }
    var obj = r.object
    var idx = obj && typeof obj.index === "number" ? obj.index : null
    if (idx !== null) {
     used[idx] = true
    }
   }
  } catch (_) {}
  return used
 }

 function scanSceneryIdentifiers() {
  var used = {}
  try {
   if (typeof map === "undefined" || !map || !map.size || typeof map.getTile !== "function") {
    return used
   }
   if (typeof objectManager === "undefined" || !objectManager) {
    return used
   }

   var size = map.size
   var maxX = size.x || 0
   var maxY = size.y || 0

   function mark(type, index) {
    if (index === null || index === undefined || index < 0) {
     return
    }
    var lo
    try {
     lo = objectManager.getObject(type, index)
    } catch (_) {
     lo = null
    }
    if (lo && lo.identifier) {
     used[lo.identifier] = true
    }
   }

   for (var x = 0; x < maxX; x++) {
    for (var y = 0; y < maxY; y++) {
     var tile
     try {
      tile = map.getTile(x, y)
     } catch (_) {
      continue
     }
     if (!tile || !tile.elements) {
      continue
     }
     var elements = tile.elements
     for (var ei = 0; ei < elements.length; ei++) {
      var el = elements[ei]
      if (!el) {
       continue
      }
      var t = el.type
      if (t === "small_scenery") {
       mark("small_scenery", el.object)
      } else if (t === "large_scenery") {
       mark("large_scenery", el.object)
      } else if (t === "wall") {
       mark("wall", el.object)
      } else if (t === "banner") {
       mark("banner", el.object)
      } else if (t === "footpath") {
       if (el.object != null) {
        mark("footpath", el.object)
       }
       if (el.addition != null) {
        mark("footpath_addition", el.addition)
       }
       if (el.surfaceObject != null) {
        mark("footpath_surface", el.surfaceObject)
       }
       if (el.railingsObject != null) {
        mark("footpath_railings", el.railingsObject)
       }
      }
     }
    }
   }
  } catch (_) {}
  return used
 }

 function computeSceneryGroupIndices(usedSceneryIdentifiers) {
  var used = {}
  if (!usedSceneryIdentifiers || typeof objectManager === "undefined" || !objectManager) {
   return used
  }
  try {
   var groups = objectManager.getAllObjects("scenery_group") || []
   for (var i = 0; i < groups.length; i++) {
    var sg = groups[i]
    if (!sg || !sg.items) {
     continue
    }
    var items = sg.items
    var anyUsed = false
    for (var j = 0; j < items.length; j++) {
     if (usedSceneryIdentifiers[items[j]]) {
      anyUsed = true
      break
     }
    }
    if (anyUsed) {
     used[sg.index] = true
    }
   }
  } catch (_) {}
  return used
 }

 // -------- Identifier -> index caches --------
 var _rideIndexById = null
 var _groupIndexById = null

 function _buildIndexCaches() {
  _rideIndexById = {}
  _groupIndexById = {}

  if (typeof objectManager === "undefined" || !objectManager || !objectManager.getAllObjects) {
   return
  }

  try {
   var rides = objectManager.getAllObjects("ride") || []
   for (var i = 0; i < rides.length; i++) {
    var ro = rides[i]
    if (!ro || !ro.identifier) {
     continue
    }
    _rideIndexById[ro.identifier] = ro.index
   }
  } catch (_) {}

  try {
   var groups = objectManager.getAllObjects("scenery_group") || []
   for (var j = 0; j < groups.length; j++) {
    var sg = groups[j]
    if (!sg || !sg.identifier) {
     continue
    }
    _groupIndexById[sg.identifier] = sg.index
   }
  } catch (_) {}
 }

 function getIndexCaches() {
  if (!_rideIndexById || !_groupIndexById) {
   _buildIndexCaches()
  }
  return {
   rideIndexById: _rideIndexById || {},
   groupIndexById: _groupIndexById || {},
  }
 }

 // Explicit invalidator so each run can rebuild caches from the
 // *current* loaded object set (important after unload).
 function clearIndexCaches() {
  _rideIndexById = null
  _groupIndexById = null
 }

 return {
  asciiLower: asciiLower,
  getEssentialModeForKey: getEssentialModeForKey,
  categoryFromItem: categoryFromItem,
  scanRideObjectIndices: scanRideObjectIndices,
  scanSceneryIdentifiers: scanSceneryIdentifiers,
  computeSceneryGroupIndices: computeSceneryGroupIndices,
  getIndexCaches: getIndexCaches,
  clearIndexCaches: clearIndexCaches,
 }
})()
/* ============= End of RR.helper.core ============= */

/** ==================================================
 * Module: RR.log.core
 * Purpose: Uniform logging & user-facing messages; gate info on Verbose.
 * Exports: RR.log
 * Imports: None
 * Version: 3.0.0-alpha.0   Since: 2025-11-13
 * =================================================== */
var RR = RR || {}
RR.log = (function () {
 function tag() {
  var sid = typeof scenario !== "undefined" && scenario && scenario.filename ? scenario.filename : "no-scenario"
  var seed = RR.state && RR.state.options ? RR.state.options.seed : "?"
  return "[RR V3|" + seed + "|" + sid + "]"
 }
 function out(prefix, msg) {
  console.log(tag() + " " + prefix + " " + msg)
 }
 function toast(msg) {
  try {
   if (typeof park !== "undefined" && park && park.postMessage) {
    park.postMessage({ type: "research", text: RR.config.UI_NAME + ": " + msg })
   }
  } catch (_) {}
 }
 function isVerbose() {
  return !!(RR.state && RR.state.options && RR.state.options.verboseLogging)
 }
 return {
  info: function (msg) {
   if (isVerbose()) out("[INFO]", msg)
  },
  warn: function (msg) {
   out("[WARN]", msg)
  },
  error: function (msg) {
   out("[ERROR]", msg)
  },
  toast: toast,
 }
})()
/* ============= End of RR.log.core ============= */

/** ==================================================
 * Module: RR.state.core
 * Purpose: In-memory state bag for options and UI refs.
 * Exports: RR.state
 * Imports: RR.config
 * Version: 3.0.0-alpha.0   Since: 2025-11-13
 * =================================================== */
var RR = RR || {}
RR.state = {
 options: JSON.parse(JSON.stringify(RR.config.DEFAULTS)),
 ui: { window: null },
}
/* ============= End of RR.state.core ============= */

/** ==================================================
 * Module: RR.store.core
 * Purpose: Wrapper over OpenRCT2 storage to persist options.
 * Exports: RR.store
 * Imports: RR.config, RR.state, RR.log
 * Version: 3.0.0-alpha.2   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.store = (function () {
 function _shared() {
  return context.sharedStorage
 }
 function _park() {
  return context.getParkStorage(RR.config.INTERNAL_NAME)
 }

 function loadOptions() {
  var persisted = _shared().get(RR.config.STORAGE.SHARED_KEY, {})
  var merged = {},
   k

  // Start from defaults.
  for (k in RR.config.DEFAULTS) {
   if (RR.config.DEFAULTS.hasOwnProperty(k)) {
    merged[k] = RR.config.DEFAULTS[k]
   }
  }

  // Overlay any persisted options.
  for (k in persisted) {
   if (persisted.hasOwnProperty(k)) {
    merged[k] = persisted[k]
   }
  }

  // Migrate legacy preserveCategoryRatio -> categoryMode if needed.
  if (typeof merged.categoryMode !== "string" || (merged.categoryMode !== "preserve" && merged.categoryMode !== "even")) {
   if (typeof merged.preserveCategoryRatio === "boolean") {
    merged.categoryMode = merged.preserveCategoryRatio ? "preserve" : "even"
   } else {
    merged.categoryMode = "preserve"
   }
  }

  RR.state.options = merged
  RR.log.info("Loaded options from storage.")
  return merged
 }

 function saveOptions() {
  _shared().set(RR.config.STORAGE.SHARED_KEY, RR.state.options)
  RR.log.info("Saved options to shared storage.")
 }

 function flushAll() {
  _shared().set(RR.config.STORAGE.SHARED_KEY, {})
  _park().set(RR.config.STORAGE.PARK_KEY, {})
  RR.log.warn("Persistent storage cleared for plugin (options + park baseline).")
 }

 return { loadOptions: loadOptions, saveOptions: saveOptions, flushAll: flushAll }
})()
/* ============= End of RR.store.core ============= */

/** ==================================================
 * Module: RR.special.cases
 * Purpose: Detect default/essential items (allowed tokens only) for filtering/diagnostics, using identifiers.
 *          Default set is discovered once by name, then tracked by identifier only.
 * Exports: RR.specialCases
 * Imports: RR.state, RR.helper, (global objectManager)
 * Version: 3.0.0-alpha.8   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.specialCases = (function () {
 // Canonical default scenery group names (ascii-lower, trimmed).
 // These correspond to: trees | shrubs and ornaments | gardens | fences and walls | walls and roofs | signs and items for footpaths.
 var DEFAULT_SCENERY_NAMES = {
  trees: true,
  "shrubs and ornaments": true,
  "shrubs and bushes": true, // tolerate minor variants
  "shrubs and flowers": true,
  gardens: true,
  "fences and walls": true,
  "walls and roofs": true,
  "signs and items for footpaths": true,
  "signs and items for paths": true, // tolerate minor variants
 }

 // Canonical default ride names; currently just Toilets.
 var DEFAULT_RIDE_NAMES = {
  toilets: true,
 }

 // Essential ride token groups, keyed by logical essential type.
 // These are still name-based heuristics, but only for special essentials
 // and are resolved per-ride by identifier once classifyRideObject is used.
 var ESSENTIAL_GROUPS = {
  info: {
   tokens: ["information kiosk", "info kiosk", "kiosk"],
  },
  cash: {
   tokens: ["cash machine", "atm"],
  },
  firstAid: {
   tokens: ["first aid"],
  },
 }

 // Name-dedup maps for default and essential groups.
 // For defaults we dedup by identifier; for essentials we still dedup by name.
 var _seenDefaultIds = {}
 var _seenEssentialNames = {}

 // Default identifier caches (discovered once from names, then used by identifier only).
 // Keys are ascii-lower identifiers.
 var _defaultRideIds = {}
 var _defaultSceneryGroupIds = {}
 var _defaultCacheBuilt = false

 function _resetSeen() {
  _seenDefaultIds = {}
  _seenEssentialNames = {}
 }

 function _asciiLower(s) {
  return RR.helper.asciiLower(s)
 }

 function _get(type, idx) {
  try {
   return objectManager.getObject(type, idx)
  } catch (_) {
   return null
  }
 }

 // Resolve useful info for a ResearchItem-like entry:
 //  - lo: underlying object
 //  - nameLower: ascii-lower of lo.name (player-visible)
 //  - idLower: ascii-lower of lo.identifier
 //  - fullLower: ascii-lower of identifier + name (for token matching)
 function _resolveInfo(it) {
  if (!it || typeof it.object !== "number") {
   return null
  }
  var t = it.type === "ride" ? "ride" : "scenery_group"
  var lo = _get(t, it.object)
  if (!lo) {
   return null
  }
  var nameLower = _asciiLower(lo.name || "")
  var idLower = _asciiLower(lo.identifier || "")
  var fullLower = _asciiLower((lo.identifier || "") + " " + (lo.name || ""))
  return {
   lo: lo,
   nameLower: nameLower,
   idLower: idLower,
   fullLower: fullLower,
  }
 }

 // Determine which essential group (if any) a string belongs to.
 // Returns "info" | "cash" | "firstAid" | null.
 function _classifyEssentialFromString(fullLower) {
  if (!fullLower) {
   return null
  }
  var key, i, tokens

  for (key in ESSENTIAL_GROUPS) {
   if (!ESSENTIAL_GROUPS.hasOwnProperty(key)) {
    continue
   }
   tokens = ESSENTIAL_GROUPS[key].tokens
   for (i = 0; i < tokens.length; i++) {
    if (fullLower.indexOf(tokens[i]) !== -1) {
     return key
    }
   }
  }
  return null
 }

 // Build default identifier caches once by scanning loaded objects and
 // matching against the canonical default-name sets above. From then on,
 // default classification uses identifier membership only.
 function _buildDefaultIdentifierCache() {
  _defaultRideIds = {}
  _defaultSceneryGroupIds = {}
  _defaultCacheBuilt = true

  if (typeof objectManager === "undefined" || !objectManager || !objectManager.getAllObjects) {
   return
  }

  // Discover default rides (currently Toilets).
  try {
   var rides = objectManager.getAllObjects("ride") || []
   for (var i = 0; i < rides.length; i++) {
    var ro = rides[i]
    if (!ro || !ro.name || !ro.identifier) {
     continue
    }
    var nameLower = _asciiLower(ro.name)
    if (!DEFAULT_RIDE_NAMES[nameLower]) {
     continue
    }
    var idLower = _asciiLower(ro.identifier)
    if (!idLower) {
     continue
    }
    _defaultRideIds[idLower] = true
   }
  } catch (_) {}

  // Discover default scenery groups (trees, shrubs/ornaments, gardens, etc.).
  try {
   var groups = objectManager.getAllObjects("scenery_group") || []
   for (var j = 0; j < groups.length; j++) {
    var sg = groups[j]
    if (!sg || !sg.name || !sg.identifier) {
     continue
    }
    var gNameLower = _asciiLower(sg.name)
    if (!DEFAULT_SCENERY_NAMES[gNameLower]) {
     continue
    }
    var gIdLower = _asciiLower(sg.identifier)
    if (!gIdLower) {
     continue
    }
    _defaultSceneryGroupIds[gIdLower] = true
   }
  } catch (_) {}
 }

 function _ensureDefaultCache() {
  if (!_defaultCacheBuilt) {
   _buildDefaultIdentifierCache()
  }
 }

 // Default items:
 //  - Scenery groups whose identifier is in _defaultSceneryGroupIds, OR
 //  - Rides whose identifier is in _defaultRideIds (e.g., Toilets).
 // Additional rule: within this group, only one object per identifier, per scan.
 function _isDefault(it) {
  _ensureDefaultCache()

  var info = _resolveInfo(it)
  if (!info) {
   return false
  }
  var idKey = info.idLower
  if (!idKey) {
   return false
  }

  // Identifier-based membership checks.
  if (it.type !== "ride") {
   if (!_defaultSceneryGroupIds[idKey]) {
    return false
   }
  } else {
   if (!_defaultRideIds[idKey]) {
    return false
   }
  }

  // One-per-identifier per scan.
  if (_seenDefaultIds[idKey]) {
   return false
  }
  _seenDefaultIds[idKey] = true
  return true
 }

 // Essential items:
 //  - Rides whose identifier+name contains any ESSENTIAL_GROUPS[*].tokens.
 // Additional rules:
 //  - Within this group, only one object per nameLower, per scan.
 //  - If the configured mode for that essential group is "ignore", it is NOT treated as essential.
 function _isEssential(it) {
  if (it.type !== "ride") {
   return false
  }

  var info = _resolveInfo(it)
  if (!info) {
   return false
  }
  var s = info.fullLower
  var nameKey = info.nameLower

  var key = _classifyEssentialFromString(s)
  if (!key) {
   return false
  }

  var mode = RR.helper.getEssentialModeForKey(key)
  if (mode === "ignore") {
   return false
  }

  if (_seenEssentialNames[nameKey]) {
   return false
  }
  _seenEssentialNames[nameKey] = true
  return true
 }

 // Public tag function used by:
 //  - RR.randomSpecial.splitBySpecial
 //  - RR.unload and dev unload planners
 //
 // Name-dedup is applied within a logical scan; callers are responsible
 // for calling resetSeen() at the start of each scan.
 function tagItem(it) {
  if (_isDefault(it)) {
   return "default"
  }
  if (_isEssential(it)) {
   return "essential"
  }
  return null
 }

 // Classifier for raw ride objects (from objectManager.getAllObjects("ride")).
 // Returns "info" | "cash" | "firstAid" | null.
 function classifyRideObject(rideObject) {
  if (!rideObject) {
   return null
  }
  var fullLower = _asciiLower((rideObject.identifier || "") + " " + (rideObject.name || ""))
  return _classifyEssentialFromString(fullLower)
 }

 return {
  tagItem: tagItem,
  resetSeen: _resetSeen,
  classifyRideObject: classifyRideObject,
 }
})()
/* ============= End of RR.special.cases ============= */

/** ==================================================
 * Module: RR.catalog.core
 * Purpose: Build the master identity list from installed objects, applying only type/custom filters
 *          and global exact-name de-duplication (per type).
 * Exports: RR.catalog
 * Imports: RR.state, RR.log, RR.helper
 * Version: 3.0.0-alpha.8   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.catalog = (function () {
 function _asciiLower(s) {
  return RR.helper.asciiLower(s)
 }

 /**
  * Decide if an installed object should be treated as "custom":
  *  - sourceGames contains "custom"  -> custom
  *  - missing / empty / malformed   -> custom
  *  - otherwise                     -> canonical
  */
 function _isCustomSource(src) {
  if (!src || !src.length) {
   // Missing or empty: treat as custom so they get filtered if excludeCustom is on.
   return true
  }

  var sawTag = false
  for (var i = 0; i < src.length; i++) {
   var tag = String(src[i] || "").toLowerCase()
   if (!tag) {
    continue
   }
   sawTag = true
   if (tag === "custom") {
    return true
   }
  }

  // We saw at least one non-empty tag and none were "custom" -> canonical.
  return !sawTag ? true : false
 }

 /**
  * Build the master identity list of *researchable* items:
  *  - rides and scenery groups only
  *  - optional filter for custom items (excludeCustom)
  *  - deduped by identifier
  *  - deduped by exact player-visible name per type (ride/scenery)
  *
  * No default/essential detection, no usage checks, no category logic.
  */
 function buildMaster() {
  var excludeCustom = !!(RR.state && RR.state.options && RR.state.options.excludeCustom)

  var installed = []
  try {
   installed = objectManager && objectManager.installedObjects ? objectManager.installedObjects : []
  } catch (_) {
   installed = []
  }

  var total = 0
  var eligible = 0
  var filteredCustom = 0
  var filteredNonResearchable = 0
  var filteredMissingId = 0
  var filteredNameDup = 0

  var out = []
  var seenId = {}
  var seenNameByType = {
   ride: {},
   scenery: {},
  }

  for (var i = 0; i < installed.length; i++) {
   var e = installed[i]
   if (!e) {
    continue
   }

   total++

   var id = e.identifier
   var t = e.type

   if (!id || !t) {
    filteredMissingId++
    continue
   }

   // Only rides and scenery groups participate in research.
   if (t !== "ride" && t !== "scenery_group") {
    filteredNonResearchable++
    continue
   }

   var isCust = _isCustomSource(e.sourceGames)
   if (excludeCustom && isCust) {
    filteredCustom++
    continue
   }

   if (seenId[id]) {
    // Identifier-level dedupe.
    continue
   }

   var canonicalType = t === "ride" ? "ride" : "scenery"

   // Global exact-name dedupe per type (ride/scenery), based on player-visible name.
   // We resolve the name once via objectManager.load(identifier).
   var nameLower = null
   try {
    if (typeof objectManager !== "undefined" && objectManager && objectManager.load) {
     var lo = objectManager.load(id)
     if (lo && lo.name) {
      nameLower = _asciiLower(lo.name)
     }
    }
   } catch (_) {
    nameLower = null
   }

   if (nameLower) {
    var nameMap = canonicalType === "ride" ? seenNameByType.ride : seenNameByType.scenery
    if (nameMap[nameLower]) {
     // Another object of the same type with the exact same player-visible name:
     // treat as a duplicate and keep only the first one.
     filteredNameDup++
     continue
    }
    nameMap[nameLower] = true
   }

   seenId[id] = true

   out.push({
    type: canonicalType,
    identifier: id,
   })
   eligible++
  }

  // Verbose-only log; RR.log.info is already gated by verbose flag.
  RR.log.info(
   "[Catalog] installed=" +
    total +
    ", eligible=" +
    eligible +
    " (filteredCustom=" +
    filteredCustom +
    ", filteredNonResearchable=" +
    filteredNonResearchable +
    ", filteredMissingId=" +
    filteredMissingId +
    ", filteredNameDup=" +
    filteredNameDup +
    ")."
  )

  // Each entry is { type:"ride"|"scenery", identifier:string }
  return out
 }

 return {
  buildMaster: buildMaster,
 }
})()
/* ============= End of RR.catalog.core ============= */

/** ==================================================
 * Module: RR.research.build.core
 * Purpose: Build deduped ResearchItem arrays from identities using current loaded indices.
 * Exports: RR.researchBuild
 * Imports: RR.helper
 * Version: 3.0.0-alpha.3   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.researchBuild = (function () {
 function _mapRide(id) {
  try {
   var caches = RR.helper && RR.helper.getIndexCaches ? RR.helper.getIndexCaches() : null
   var rideIdx = caches && caches.rideIndexById ? caches.rideIndexById[id] : null
   if (typeof rideIdx !== "number") {
    return null
   }
   var ro = objectManager.getObject("ride", rideIdx)
   if (!ro) {
    return null
   }
   var rt = ro.rideType && ro.rideType.length ? ro.rideType[0] : null
   if (typeof rt === "number") {
    return {
     object: rideIdx,
     rideType: rt,
    }
   }
  } catch (_) {}
  return null
 }

 function _mapScenery(id) {
  try {
   var caches = RR.helper && RR.helper.getIndexCaches ? RR.helper.getIndexCaches() : null
   var idx = caches && caches.groupIndexById ? caches.groupIndexById[id] : null
   if (typeof idx === "number") {
    return {
     object: idx,
    }
   }
  } catch (_) {}
  return null
 }

 function _key(it) {
  return it.type === "ride" ? "ride|" + it.rideType + "|" + it.object : "scenery|" + it.object
 }

 function buildFromIdentities(curIDs, resIDs) {
  var seen = {}
  var cur = []
  var res = []

  function push(dst, ident) {
   var m
   if (ident.type === "ride") {
    m = _mapRide(ident.identifier)
   } else {
    m = _mapScenery(ident.identifier)
   }
   if (!m) {
    return
   }

   var entry
   if (ident.type === "ride") {
    entry = {
     type: "ride",
     rideType: m.rideType,
     object: m.object,
    }
   } else {
    entry = {
     type: "scenery",
     object: m.object,
    }
   }

   var k = _key(entry)
   if (seen[k]) {
    return
   }
   seen[k] = true
   dst.push(entry)
  }

  for (var i = 0; i < curIDs.length; i++) {
   push(cur, curIDs[i])
  }
  for (var j = 0; j < resIDs.length; j++) {
   push(res, resIDs[j])
  }

  return {
   cur: cur,
   res: res,
  }
 }

 return {
  buildFromIdentities: buildFromIdentities,
 }
})()
/* ============= End of RR.research.build.core ============= */

/** ==================================================
 * Module: RR.stats.core
 * Purpose: Verbose-gated per-category counts (normal/special) for CURRENT and RESEARCH, plus totals for current/research/loaded.
 * Exports: RR.stats
 * Imports: RR.log, RR.randomSpecial, RR.specialCases, RR.state, RR.helper, RR.randomCore
 * Version: 3.0.0-alpha.8   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.stats = (function () {
 // Canonical order for log output; matches plugin bible categories
 var ORDER = ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 function _zeros() {
  return RR.randomCore.zeros()
 }

 function _asciiLower(s) {
  return RR.helper.asciiLower(s)
 }

 // -------- Essential filtering for stats --------

 function _essentialModeForKey(key) {
  return RR.helper.getEssentialModeForKey(key)
 }

 // Return "ignore" | "researchable" | "start" for an essential item,
 // or null if the item is not one of the essential types.
 function _essentialModeForItem(it) {
  if (!it || it.type !== "ride" || typeof it.object !== "number") {
   return null
  }
  try {
   if (typeof objectManager === "undefined" || !objectManager || !RR.specialCases || !RR.specialCases.classifyRideObject) {
    return null
   }
   var ro = objectManager.getObject("ride", it.object)
   if (!ro) {
    return null
   }
   var key = RR.specialCases.classifyRideObject(ro) // "info" | "cash" | "firstAid" | null
   if (!key) {
    return null
   }
   return _essentialModeForKey(key)
  } catch (_) {
   return null
  }
 }

 // Should this item be excluded from stats entirely?
 // We exclude essential items when mode is "start" or "researchable".
 // When mode is "ignore", they behave like normal and are counted.
 function _excludeFromStats(it) {
  var mode = _essentialModeForItem(it)
  if (!mode) {
   return false
  }
  // Only include them in stats when the user chose "Ignore".
  return mode === "start" || mode === "researchable"
 }

 // Make a shallow copy of list with all "excluded-from-stats" items removed.
 function _filterForStats(list) {
  if (!list || !list.length) {
   return []
  }
  var out = []
  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) {
    continue
   }
   if (_excludeFromStats(it)) {
    continue
   }
   out.push(it)
  }
  return out
 }

 // -------- Logical-key helper for stats --------

 function _logicalKeyForStatsItem(it) {
  if (!it || typeof it.object !== "number") {
   return null
  }

  var type = it.type || "ride"

  if (type === "ride") {
   try {
    if (typeof objectManager !== "undefined" && objectManager && objectManager.getObject) {
     var ro = objectManager.getObject("ride", it.object)
     if (ro) {
      var nameLower = _asciiLower(ro.name || "")
      var rt = typeof it.rideType === "number" ? it.rideType : null
      if (rt === null && ro.rideType && ro.rideType.length) {
       rt = ro.rideType[0]
      }
      if (rt === null || typeof rt !== "number") {
       return "ride|" + nameLower + "|obj:" + it.object
      }
      return "ride|" + rt + "|" + nameLower
     }
    }
   } catch (_) {
    // fall through
   }
   return "ride|obj:" + it.object
  }

  if (type === "scenery") {
   try {
    if (typeof objectManager !== "undefined" && objectManager && objectManager.getObject) {
     var sg = objectManager.getObject("scenery_group", it.object)
     if (sg) {
      var gNameLower = _asciiLower(sg.name || "")
      return "scenery|" + gNameLower
     }
    }
   } catch (_) {
    // fall through
   }
   return "scenery|obj:" + it.object
  }

  return String(type) + "|obj:" + it.object
 }

 // -------- Category resolution & tallies --------

 function _resolveCategory(it) {
  return RR.helper.categoryFromItem(it)
 }

 // Tally list into an existing accumulator map, with logical de-dup.
 function _tallyInto(list, acc, seen) {
  if (!list || !acc) {
   return acc
  }
  if (!seen) {
   seen = {}
  }

  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) {
    continue
   }

   var key = _logicalKeyForStatsItem(it)
   if (key && seen[key]) {
    // Already counted this logical invention.
    continue
   }
   if (key) {
    seen[key] = true
   }

   var cat = _resolveCategory(it)
   if (!acc.hasOwnProperty(cat)) {
    cat = "rollercoaster"
   }
   acc[cat] = (acc[cat] || 0) + 1
   acc.total++
  }
  return acc
 }

 // Use the same special-splitting logic as the randomizer, so accounting matches behavior.
 // Logical de-dup is applied ACROSS normal + special for each list
 function _tallyWithSpecial(list) {
  var normal = _zeros()
  var special = _zeros()

  if (!list || !list.length) {
   return { normal: normal, special: special }
  }

  var split = RR.randomSpecial.splitBySpecial(list)

  var seen = {}
  _tallyInto(split.rand, normal, seen)
  _tallyInto(split.keep, special, seen)
  return { normal: normal, special: special }
 }

 function _formatPair(label, pair) {
  var n = pair.normal
  var s = pair.special

  return (
   label +
   ": transport=" +
   n.transport +
   "/" +
   s.transport +
   ", gentle=" +
   n.gentle +
   "/" +
   s.gentle +
   ", rollercoaster=" +
   n.rollercoaster +
   "/" +
   s.rollercoaster +
   ", thrill=" +
   n.thrill +
   "/" +
   s.thrill +
   ", water=" +
   n.water +
   "/" +
   s.water +
   ", shop=" +
   n.shop +
   "/" +
   s.shop +
   ", scenery=" +
   n.scenery +
   "/" +
   s.scenery +
   " | total=" +
   n.total +
   "/" +
   s.total
  )
 }

 function _emit(line) {
  if (RR.state && RR.state.options && RR.state.options.verboseLogging) {
   RR.log.info(line)
  }
 }

 /**
  * Log BEFORE/AFTER stats for:
  *  - CURRENT (inventedItems), per category, normal/special
  *  - RESEARCH (uninventedItems), per category, normal/special
  *  - Totals (current, research, loaded)
  *
  * Essential items in Start/Researchable modes are excluded from all counts.
  * Logical duplicates (same invention key) are only counted once.
  */
 function logBeforeAfter(curBeforeArr, curAfterArr, resBeforeArr, resAfterArr) {
  curBeforeArr = curBeforeArr || []
  curAfterArr = curAfterArr || []
  resBeforeArr = resBeforeArr || []
  resAfterArr = resAfterArr || []

  // Filter out essentials in Start/Researchable modes for stats symmetry.
  var curBefore = _filterForStats(curBeforeArr)
  var curAfter = _filterForStats(curAfterArr)
  var resBefore = _filterForStats(resBeforeArr)
  var resAfter = _filterForStats(resAfterArr)

  // Category counts for CURRENT (normal/special).
  var curBeforePair = _tallyWithSpecial(curBefore)
  var curAfterPair = _tallyWithSpecial(curAfter)

  // Category counts for RESEARCH (normal/special).
  var resBeforePair = _tallyWithSpecial(resBefore)
  var resAfterPair = _tallyWithSpecial(resAfter)

  // Totals: use the deduped tallies, not raw list lengths, so that exact-name
  // / logical duplicates (Pegasus Cars, Bumper Boats, etc.) don't inflate counts.
  var totalsBefore = {
   cur: curBeforePair.normal.total + curBeforePair.special.total,
   res: resBeforePair.normal.total + resBeforePair.special.total,
   load: curBeforePair.normal.total + curBeforePair.special.total + resBeforePair.normal.total + resBeforePair.special.total,
  }
  var totalsAfter = {
   cur: curAfterPair.normal.total + curAfterPair.special.total,
   res: resAfterPair.normal.total + resAfterPair.special.total,
   load: curAfterPair.normal.total + curAfterPair.special.total + resAfterPair.normal.total + resAfterPair.special.total,
  }

  // CURRENT diagnostics.
  _emit(_formatPair("Category count (current BEFORE)", curBeforePair))
  _emit(_formatPair("Category count (current AFTER)", curAfterPair))

  // RESEARCH diagnostics.
  _emit(_formatPair("Category count (research BEFORE)", resBeforePair))
  _emit(_formatPair("Category count (research AFTER)", resAfterPair))

  // Totals.
  _emit("Totals BEFORE: current=" + totalsBefore.cur + ", research=" + totalsBefore.res + ", loaded=" + totalsBefore.load)
  _emit("Totals AFTER: current=" + totalsAfter.cur + ", research=" + totalsAfter.res + ", loaded=" + totalsAfter.load)
 }

 return {
  logBeforeAfter: logBeforeAfter,
 }
})()
/* ============= End of RR.stats.core ============= */

/** ==================================================
 * Module: RR.timing.defer
 * Purpose: Defer a task until a window BEFORE the next day tick (default 16 ticks early).
 * Exports: RR.defer.armPreDayOnce, RR.defer.isArmed
 * Imports: RR.log
 * Version: 3.0.0-alpha.3   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.defer = (function () {
 var _subTick = null
 var _subDay = null
 var _armed = false

 function _dispose() {
  // Dispose subscriptions and clear latch.
  try {
   if (_subTick && _subTick.dispose) {
    _subTick.dispose()
   }
  } catch (_) {}
  try {
   if (_subDay && _subDay.dispose) {
    _subDay.dispose()
   }
  } catch (_) {}

  _subTick = null
  _subDay = null
  _armed = false
 }

 function _nextDayBoundary(mp, day) {
  var current = Math.floor(((day - 1) * 65536) / 31)
  var next = Math.floor((day * 65536) / 31)
  return next > current ? next : 65536
 }

 function armPreDayOnce(label, fn, marginTicks) {
  if (!context || typeof context.subscribe !== "function") {
   RR.log.warn("PreDay: subscribe unavailable.")
   return false
  }

  // Cancel any previous pending deferral so this call "wins".
  _dispose()

  var name = label || "PreDay"
  var margin = typeof marginTicks === "number" && marginTicks > 0 ? marginTicks : 16

  _subDay = context.subscribe("interval.day", function () {
   // Day advanced; clean up any remaining tick subscription and clear latch.
   _dispose()
   RR.log.info(name + ": day advanced; latch cleared.")
  })

  _subTick = context.subscribe("interval.tick", function () {
   try {
    var mp = date.monthProgress
    var d = date.day
    var boundary = _nextDayBoundary(mp, d)
    var threshold = boundary - 4 * margin // 4 units per tick

    if (mp >= threshold) {
     RR.log.info(name + ": firing pre-day (mp=" + mp + ", boundary=" + boundary + ", day=" + d + ", marginTicks=" + margin + ").")
     try {
      if (fn) {
       fn()
      }
     } catch (e) {
      RR.log.error(name + " callback failed: " + e)
     }

     // This deferral has done its job; stop listening to ticks.
     try {
      if (_subTick && _subTick.dispose) {
       _subTick.dispose()
      }
     } catch (_) {}
     _subTick = null
    }
   } catch (e) {
    RR.log.warn("PreDay tick handler error: " + e)
   }
  })

  _armed = true
  RR.log.info(name + ": armed; waiting for pre-day window.")
  return true
 }

 // Expose read-only latch state so callers can detect cooldown.
 function isArmed() {
  return _armed
 }

 return { armPreDayOnce: armPreDayOnce, isArmed: isArmed }
})()
/* ============= End of RR.timing.defer ============= */

/** ==================================================
 * Module: RR.random.core
 * Purpose: RNG and per-category planning helpers shared by randomization.
 * Exports: RR.randomCore
 * Imports: RR.category, RR.helper, objectManager
 * Version: 3.0.0-alpha.9   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomCore = (function () {
 // Canonical category order; shared between planner and core.
 var ORDER = ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 // Precomputed order index for deterministic tie-breaking.
 var ORDER_INDEX = {}
 for (var oi = 0; oi < ORDER.length; oi++) {
  ORDER_INDEX[ORDER[oi]] = oi
 }

 // Simple LCG RNG (same as old makeRng).
 function makeRng(seed) {
  var s = seed >>> 0 || 1
  return function (n) {
   s = (Math.imul(1664525, s) + 1013904223) >>> 0
   return n > 0 ? s % n : 0
  }
 }

 // Zeroed category count map.
 function zeros() {
  var o = {}
  for (var i = 0; i < ORDER.length; i++) {
   o[ORDER[i]] = 0
  }
  o.total = 0
  return o
 }

 // Category resolution helper for planner-side accounting.
 function _resolveCategoryFromItem(it) {
  return RR.helper.categoryFromItem(it)
 }

 // Category tally helper: derive category from item.
 function tallyFromList(list) {
  var c = zeros()
  if (!list) {
   return c
  }

  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) {
    continue
   }

   var cat = _resolveCategoryFromItem(it)
   if (!c.hasOwnProperty(cat)) {
    cat = "rollercoaster"
   }

   c[cat] = (c[cat] || 0) + 1
   c.total++
  }

  return c
 }

 // Derive weights (per-category ratios) from current / research / loaded counts.
 function weightsFrom(cur, res, load) {
  var base = res && res.total > 0 ? res : load && load.total > 0 ? load : cur && cur.total > 0 ? cur : null
  var w = {}
  var i

  if (base) {
   for (i = 0; i < ORDER.length; i++) {
    var c = ORDER[i]
    w[c] = base.total > 0 ? (base[c] || 0) / base.total : 0
   }
  } else {
   for (i = 0; i < ORDER.length; i++) {
    w[ORDER[i]] = 1.0 / ORDER.length
   }
  }
  return w
 }

 /**
  * Split a total into integer per-category counts based on weights, with
  * remainder assigned by largest fractional part. Tie-breaking is deterministic
  * by ORDER so the mapping is stable and pre-determined.
  */
 function apportion(totalAdd, weights) {
  var adds = {}
  var rema = []
  var sum = 0
  var i

  for (i = 0; i < ORDER.length; i++) {
   var cat = ORDER[i]
   var share = totalAdd * (weights[cat] || 0)
   var base = Math.floor(share)
   adds[cat] = base
   sum += base
   rema.push({
    cat: cat,
    frac: share - base,
    orderIndex: ORDER_INDEX[cat],
   })
  }

  var left = totalAdd - sum

  // Deterministic sort: primary key = frac desc, secondary = ORDER index asc.
  rema.sort(function (a, b) {
   if (b.frac !== a.frac) {
    return b.frac - a.frac
   }
   var ai = typeof a.orderIndex === "number" ? a.orderIndex : 0
   var bi = typeof b.orderIndex === "number" ? b.orderIndex : 0
   return ai - bi
  })

  for (i = 0; i < rema.length && left > 0; i++) {
   adds[rema[i].cat]++
   left--
  }
  return adds
 }

 function activeCats(cur, load) {
  var act = []
  var i

  // Primary: categories present in the baseline candidate pool.
  if (load) {
   for (i = 0; i < ORDER.length; i++) {
    if ((load[ORDER[i]] || 0) > 0) {
     act.push(ORDER[i])
    }
   }
  }

  // Fallback: if baseline was empty, fall back to current randomizable counts.
  if (!act.length && cur) {
   for (i = 0; i < ORDER.length; i++) {
    if ((cur[ORDER[i]] || 0) > 0) {
     act.push(ORDER[i])
    }
   }
  }

  // Fallback: if still empty, use all categories.
  if (!act.length) {
   for (i = 0; i < ORDER.length; i++) {
    act.push(ORDER[i])
   }
  }

  // Ensure scenery present.
  var has = false
  for (i = 0; i < act.length; i++) {
   if (act[i] === "scenery") {
    has = true
    break
   }
  }
  if (!has) {
   act.push("scenery")
  }
  return act
 }

 // Even split of a total across a subset of categories.
 function evenSplit(total, active) {
  var out = zeros()
  if (!active || !active.length) {
   out.total = 0
   return out
  }

  var base = Math.floor(total / active.length)
  var rem = total - base * active.length

  for (var i = 0; i < ORDER.length; i++) {
   var cat = ORDER[i]
   var isAct = false
   for (var j = 0; j < active.length; j++) {
    if (active[j] === cat) {
     isAct = true
     break
    }
   }
   if (!isAct) {
    out[cat] = 0
    continue
   }

   var add = base
   if (rem > 0) {
    add++
    rem--
   }
   out[cat] = add
   out.total += add
  }
  return out
 }

 return {
  ORDER: ORDER,
  makeRng: makeRng,
  zeros: zeros,
  tallyFromList: tallyFromList,
  weightsFrom: weightsFrom,
  apportion: apportion,
  activeCats: activeCats,
  evenSplit: evenSplit,
 }
})()
/* ============= End of RR.random.core ============= */

/** ==================================================
 * Module: RR.category.core
 * Purpose: Derive research categories from rideType using a learned mapping from existing research lists.
 * Exports: RR.category
 * Imports: RR.randomCore, (global park, objectManager)
 * Version: 3.0.0-alpha.0   Since: 2025-11-14
 * =================================================== */
var RR = RR || {}
RR.category = (function () {
 // Canonical order; reuse from randomCore if present.
 var ORDER = RR.randomCore && RR.randomCore.ORDER ? RR.randomCore.ORDER : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 // Internal mapping: rideType (number) -> category string.
 var _rideTypeToCategory = {}
 var _warmed = false

 function _isValidCategory(cat) {
  if (!cat) {
   return false
  }
  for (var i = 0; i < ORDER.length; i++) {
   if (ORDER[i] === cat) {
    return true
   }
  }
  return false
 }

 // Try to read a category from a ResearchItem that already has one,
 // and fall back to any future rideObject.category if it ever exists.
 function _categoryFromResearchItem(it) {
  if (!it) {
   return null
  }

  // Primary: explicit category on the ResearchItem (set by the game).
  if (it.category && _isValidCategory(it.category)) {
   return it.category
  }

  // Fallback: try to see if the ride object exposes a category field in future APIs.
  if (it.type === "ride" && typeof it.object === "number") {
   try {
    var ro = objectManager.getObject("ride", it.object)
    if (ro && ro.category && _isValidCategory(ro.category)) {
     return ro.category
    }
   } catch (_) {}
  }

  return null
 }

 // Warm the rideType -> category mapping from current research lists.
 function warmFromResearch(cur, res) {
  _rideTypeToCategory = {}
  _warmed = true

  function scan(list) {
   if (!list || !list.length) {
    return
   }
   for (var i = 0; i < list.length; i++) {
    var it = list[i]
    if (!it || it.type !== "ride") {
     continue
    }

    var cat = _categoryFromResearchItem(it)
    if (!_isValidCategory(cat)) {
     continue
    }

    // Prefer a direct rideType from the ResearchItem.
    var rt = typeof it.rideType === "number" ? it.rideType : null

    // If missing, fall back to the ride object definition.
    if (rt === null && typeof it.object === "number") {
     try {
      var ro = objectManager.getObject("ride", it.object)
      if (ro && ro.rideType && ro.rideType.length) {
       rt = ro.rideType[0]
      }
     } catch (_) {}
    }

    if (typeof rt !== "number") {
     continue
    }

    // First category seen per rideType wins; all variants of a family share a category.
    if (!_rideTypeToCategory.hasOwnProperty(rt)) {
     _rideTypeToCategory[rt] = cat
    }
   }
  }

  scan(cur)
  scan(res)
 }

 // Lazily warm from park.research if not explicitly warmed.
 function _ensureWarmed() {
  if (_warmed) {
   return
  }

  try {
   var cur = park && park.research && park.research.inventedItems ? park.research.inventedItems : []
   var res = park && park.research && park.research.uninventedItems ? park.research.uninventedItems : []
   warmFromResearch(cur, res)
  } catch (_) {
   _rideTypeToCategory = {}
   _warmed = true
  }
 }

 function fromRideType(rideType) {
  _ensureWarmed()
  var rt = typeof rideType === "number" ? rideType : null
  if (rt === null) {
   return "rollercoaster"
  }
  var cat = _rideTypeToCategory[rt]
  if (_isValidCategory(cat)) {
   return cat
  }
  return "rollercoaster"
 }

 function fromRideObjectIndex(index) {
  if (typeof index !== "number") {
   return "rollercoaster"
  }
  var rt = null
  try {
   var ro = objectManager.getObject("ride", index)
   if (ro && ro.rideType && ro.rideType.length) {
    rt = ro.rideType[0]
   }
  } catch (_) {}
  return fromRideType(rt)
 }

 // Generic helper for ResearchItem-like entries.
 function fromItem(it) {
  if (!it) {
   return "rollercoaster"
  }
  if (it.type !== "ride") {
   // Everything non-ride collapses into scenery for our purposes.
   return "scenery"
  }

  // If the item itself already has a valid category, honour it.
  if (it.category && _isValidCategory(it.category)) {
   return it.category
  }

  // Next, prefer rideType on the item.
  if (typeof it.rideType === "number") {
   return fromRideType(it.rideType)
  }

  // Finally, fall back to the ride object definition.
  if (typeof it.object === "number") {
   return fromRideObjectIndex(it.object)
  }

  return "rollercoaster"
 }

 return {
  warmFromResearch: warmFromResearch,
  fromRideType: fromRideType,
  fromRideObjectIndex: fromRideObjectIndex,
  fromItem: fromItem,
 }
})()
/* ============= End of RR.category.core ============= */

/** ==================================================
 * Module: RR.random.special
 * Purpose: Detect default/essential/in-use items and split ResearchItem lists into special vs randomizable.
 * Exports: RR.randomSpecial
 * Imports: RR.specialCases, RR.state, RR.helper
 * Version: 3.0.0-alpha.5   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomSpecial = (function () {
 function _scanUsedRideObjectIndices() {
  return RR.helper && RR.helper.scanRideObjectIndices ? RR.helper.scanRideObjectIndices() : {}
 }

 function _scanUsedSceneryIdentifiers() {
  return RR.helper && RR.helper.scanSceneryIdentifiers ? RR.helper.scanSceneryIdentifiers() : {}
 }

 function _computeUsedSceneryGroupIndices(usedSceneryIdentifiers) {
  return RR.helper && RR.helper.computeSceneryGroupIndices ? RR.helper.computeSceneryGroupIndices(usedSceneryIdentifiers) : {}
 }

 function splitBySpecial(list, usage) {
  var keep = []
  var rand = []

  // Ensure default/essential name-dedup is scoped to this split call.
  if (RR.specialCases && RR.specialCases.resetSeen) {
   RR.specialCases.resetSeen()
  }

  if (!list || !list.length) {
   return { keep: keep, rand: rand }
  }

  var usedRideIdx
  var usedGroupIdx

  if (usage && usage.usedRideIdx && usage.usedGroupIdx) {
   // Reuse shared snapshot provided by caller.
   usedRideIdx = usage.usedRideIdx
   usedGroupIdx = usage.usedGroupIdx
  } else {
   // Scan usage once per call so built items are treated as special.
   var usedSceneryIds = _scanUsedSceneryIdentifiers()
   usedRideIdx = _scanUsedRideObjectIndices()
   usedGroupIdx = _computeUsedSceneryGroupIndices(usedSceneryIds)
  }

  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) {
    continue
   }

   var tag = null
   try {
    if (RR.specialCases && RR.specialCases.tagItem) {
     tag = RR.specialCases.tagItem(it) // "default" | "essential" | null
    }
   } catch (_) {
    tag = null
   }

   var isSpecial = false

   if (tag === "default" || tag === "essential") {
    isSpecial = true
   } else if (it.type === "ride" && typeof it.object === "number" && usedRideIdx[it.object]) {
    // Any ride whose object index is actually used in the park is treated as special.
    isSpecial = true
   } else if (it.type === "scenery" && typeof it.object === "number" && usedGroupIdx[it.object]) {
    // Any scenery group that has pieces in the map is treated as special.
    isSpecial = true
   }

   if (isSpecial) {
    keep.push(it)
   } else {
    rand.push(it)
   }
  }

  return { keep: keep, rand: rand }
 }

 return {
  splitBySpecial: splitBySpecial,
 }
})()
/* ============= End of RR.random.special ============= */

/** ==================================================
 * Module: RR.essential.core
 * Purpose: Apply per-essential-item modes (Ignore / Researchable / Start with) to final research lists.
 * Exports: RR.essential
 * Imports: RR.state, RR.specialCases, RR.helper
 * Version: 3.0.0-alpha.3   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.essential = (function () {
 var KEYS = ["info", "cash", "firstAid"]

 // Map a ResearchItem -> essential key (info|cash|firstAid) or null.
 function _classifyItem(it) {
  if (!it || it.type !== "ride" || typeof it.object !== "number") {
   return null
  }
  try {
   var ro = objectManager.getObject("ride", it.object)
   if (!ro || !RR.specialCases || !RR.specialCases.classifyRideObject) {
    return null
   }
   return RR.specialCases.classifyRideObject(ro)
  } catch (_) {
   return null
  }
 }

 // Remove all items of a given essential key from both lists.
 // Returns new lists and an array of removed entries.
 function _partitionByKey(cur, res, key) {
  var newCur = []
  var newRes = []
  var removed = []
  var i, it, k

  for (i = 0; i < cur.length; i++) {
   it = cur[i]
   k = _classifyItem(it)
   if (k === key) {
    removed.push(it)
   } else {
    newCur.push(it)
   }
  }

  for (i = 0; i < res.length; i++) {
   it = res[i]
   k = _classifyItem(it)
   if (k === key) {
    removed.push(it)
   } else {
    newRes.push(it)
   }
  }

  return {
   cur: newCur,
   res: newRes,
   removed: removed,
  }
 }

 // Build a new ResearchItem entry for a given essential key, if possible.
 function _buildEntryForKey(key) {
  if (typeof objectManager === "undefined" || !objectManager || !objectManager.getAllObjects) {
   return null
  }
  try {
   var rides = objectManager.getAllObjects("ride") || []
   var i, ro, k, idx, rt
   for (i = 0; i < rides.length; i++) {
    ro = rides[i]
    if (!ro || !RR.specialCases || !RR.specialCases.classifyRideObject) {
     continue
    }
    k = RR.specialCases.classifyRideObject(ro)
    if (k !== key) {
     continue
    }
    idx = ro.index
    rt = ro.rideType && ro.rideType.length ? ro.rideType[0] : -1
    if (typeof idx !== "number" || typeof rt !== "number" || rt < 0) {
     continue
    }
    return {
     type: "ride",
     object: idx,
     rideType: rt,
    }
   }
  } catch (_) {}
  return null
 }

 // Prefer an already-present item if any were removed; otherwise build a new one.
 function _pickOrBuild(key, removed) {
  if (removed && removed.length > 0) {
   return removed[0]
  }
  return _buildEntryForKey(key)
 }

 // Apply all modes to the given lists and return new lists.
 // rng: function(n) -> [0, n) ; optional, used only for random insertion in research list.
 function applyModes(cur, res, rng) {
  cur = cur || []
  res = res || []

  var localRng = rng
  if (typeof localRng !== "function") {
   localRng = function (n) {
    return n > 0 ? Math.floor(Math.random() * n) : 0
   }
  }

  for (var iKey = 0; iKey < KEYS.length; iKey++) {
   var key = KEYS[iKey]
   var mode = RR.helper && RR.helper.getEssentialModeForKey ? RR.helper.getEssentialModeForKey(key) : "researchable"

   if (mode === "ignore") {
    // Do not move or force-add anything; these behave as normal items.
    continue
   }

   var part = _partitionByKey(cur, res, key)
   cur = part.cur
   res = part.res

   var entry = _pickOrBuild(key, part.removed)
   if (!entry) {
    // No matching object in this park's object set; nothing to enforce.
    continue
   }

   if (mode === "start") {
    // Ensure we start with this essential in the CURRENT list.
    cur.push(entry)
   } else if (mode === "researchable") {
    // Ensure this essential lives in the RESEARCH list at a random position.
    var pos = res.length ? localRng(res.length + 1) : 0
    if (pos < 0 || pos > res.length) {
     pos = res.length
    }
    res.splice(pos, 0, entry)
   }
  }

  return {
   cur: cur,
   res: res,
  }
 }

 return {
  applyModes: applyModes,
 }
})()
/* ============= End of RR.essential.core ============= */

/** ==================================================
 * Module: RR.unload.plan
 * Purpose: Build unload plans based on park usage and final research lists.
 * Exports: RR.unloadPlan
 * Imports: RR.helper, RR.specialCases, RR.log
 * Version: 3.0.0-alpha.4   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.unloadPlan = (function () {
 function _markUsedFromResearch(cur, res, usedRideIdx, usedGroupIdx) {
  usedRideIdx = usedRideIdx || {}
  usedGroupIdx = usedGroupIdx || {}
  var i
  var it

  if (cur) {
   for (i = 0; i < cur.length; i++) {
    it = cur[i]
    if (!it) {
     continue
    }
    if (it.type === "ride" && typeof it.object === "number") {
     usedRideIdx[it.object] = true
    } else if (it.type === "scenery" && typeof it.object === "number") {
     usedGroupIdx[it.object] = true
    }
   }
  }
  if (res) {
   for (i = 0; i < res.length; i++) {
    it = res[i]
    if (!it) {
     continue
    }
    if (it.type === "ride" && typeof it.object === "number") {
     usedRideIdx[it.object] = true
    } else if (it.type === "scenery" && typeof it.object === "number") {
     usedGroupIdx[it.object] = true
    }
   }
  }

  return {
   usedRideIdx: usedRideIdx,
   usedGroupIdx: usedGroupIdx,
  }
 }

 // Optional usage snapshot:
 //   usage = { usedRideIdx: {idx: true}, usedGroupIdx: {idx: true} }
 // When provided, we reuse it; otherwise we scan via RR.helper.
 function planForResearch(finalCur, finalRes, label, usage) {
  label = label || "[Unload]"

  if (RR.specialCases && RR.specialCases.resetSeen) {
   RR.specialCases.resetSeen()
  }

  if (typeof objectManager === "undefined" || !objectManager) {
   RR.log.warn(label + " objectManager unavailable.")
   return {
    ids: [],
    stats: {
     totalLoaded: 0,
     totalLoadedRides: 0,
     totalLoadedGroups: 0,
     skipInUse: 0,
     skipSpecial: 0,
     plannedUnload: 0,
    },
   }
  }

  var usedRideIdxMap
  var usedGroupIdxMap

  if (usage && usage.usedRideIdx && usage.usedGroupIdx) {
   usedRideIdxMap = usage.usedRideIdx
   usedGroupIdxMap = usage.usedGroupIdx
  } else {
   var usedSceneryIds = RR.helper.scanSceneryIdentifiers()
   usedRideIdxMap = RR.helper.scanRideObjectIndices()
   usedGroupIdxMap = RR.helper.computeSceneryGroupIndices(usedSceneryIds)
  }

  var marked = _markUsedFromResearch(finalCur, finalRes, usedRideIdxMap, usedGroupIdxMap)
  var usedRideIdx = marked.usedRideIdx
  var usedGroupIdx = marked.usedGroupIdx

  var rides = []
  var groups = []
  try {
   rides = objectManager.getAllObjects("ride") || []
  } catch (_) {}
  try {
   groups = objectManager.getAllObjects("scenery_group") || []
  } catch (_) {}

  var ids = []
  var stats = {
   totalLoadedRides: rides.length,
   totalLoadedGroups: groups.length,
   totalLoaded: rides.length + groups.length,
   skipInUse: 0,
   skipSpecial: 0,
   plannedUnload: 0,
  }

  var usedRideCount = 0
  var usedGroupCount = 0
  var k
  for (k in usedRideIdx) {
   if (usedRideIdx.hasOwnProperty(k) && usedRideIdx[k]) {
    usedRideCount++
   }
  }
  for (k in usedGroupIdx) {
   if (usedGroupIdx.hasOwnProperty(k) && usedGroupIdx[k]) {
    usedGroupCount++
   }
  }

  RR.log.info(label + " usage snapshot: ridesInUseOrResearch=" + usedRideCount + ", sceneryGroupsInUseOrResearch=" + usedGroupCount + ".")

  var i
  var ro
  var idx
  var tag

  for (i = 0; i < rides.length; i++) {
   ro = rides[i]
   if (!ro) {
    continue
   }
   idx = ro.index
   if (usedRideIdx[idx]) {
    stats.skipInUse++
    continue
   }
   tag = null
   try {
    tag = RR.specialCases.tagItem({ type: "ride", object: idx })
   } catch (_) {
    tag = null
   }
   if (tag === "default" || tag === "essential") {
    stats.skipSpecial++
    continue
   }
   ids.push(ro.identifier)
  }

  for (i = 0; i < groups.length; i++) {
   var sg = groups[i]
   if (!sg) {
    continue
   }
   idx = sg.index
   if (usedGroupIdx[idx]) {
    stats.skipInUse++
    continue
   }
   tag = null
   try {
    tag = RR.specialCases.tagItem({ type: "scenery", object: idx })
   } catch (_) {
    tag = null
   }
   if (tag === "default" || tag === "essential") {
    stats.skipSpecial++
    continue
   }
   ids.push(sg.identifier)
  }

  stats.plannedUnload = ids.length

  RR.log.info(
   label +
    " plan: loadedRides=" +
    stats.totalLoadedRides +
    ", loadedGroups=" +
    stats.totalLoadedGroups +
    ", candidates=" +
    stats.plannedUnload +
    ", skippedInUseOrResearch=" +
    stats.skipInUse +
    ", skippedSpecial=" +
    stats.skipSpecial +
    "."
  )

  return {
   ids: ids,
   stats: stats,
  }
 }

 return {
  planForResearch: planForResearch,
 }
})()
/* ============= End of RR.unload.plan ============= */

/** ==================================================
 * Module: RR.unload.core
 * Purpose: Apply unload plans for research lists using objectManager.
 * Exports: RR.unload
 * Imports: RR.unloadPlan, RR.log
 * Version: 3.0.0-alpha.3   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.unload = (function () {
 function _applyPlan(plan, label) {
  label = label || "[Unload]"
  var ids = plan && plan.ids ? plan.ids : []
  var stats = plan && plan.stats ? plan.stats : {}

  if (!ids.length) {
   RR.log.info(label + " Nothing to unload (all loaded objects are in-use, in-research, or special).")
   return
  }

  var ok = 0
  var fail = 0
  for (var i = 0; i < ids.length; i++) {
   try {
    objectManager.unload(ids[i])
    ok++
   } catch (_) {
    fail++
   }
  }

  RR.log.info(label + " Applied. targets=" + ids.length + ", ok=" + ok + ", fail=" + fail + ", skippedInUseOrResearch=" + (stats.skipInUse || 0) + ", skippedSpecial=" + (stats.skipSpecial || 0) + ".")
 }

 // Optional usage snapshot is threaded through to RR.unloadPlan.planForResearch.
 function applyForResearch(finalCur, finalRes, label, usage) {
  try {
   var effectiveLabel = label || "[Unload for research]"
   var plan = RR.unloadPlan.planForResearch(finalCur, finalRes, effectiveLabel, usage)
   _applyPlan(plan, effectiveLabel)
  } catch (e) {
   RR.log.warn("[Unload for research] Failed: " + (e && e.message ? e.message : String(e)))
  }
 }

 return {
  applyForResearch: applyForResearch,
 }
})()
/* ============= End of RR.unload.core ============= */

/** ==================================================
 * Module: RR.ground.core
 * Purpose: Track per-park ground-truth randomizable totals for stable multiplier behavior
 * Exports: RR.ground
 * Imports: RR.config, RR.log
 * Version: 3.0.0-alpha.5   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.ground = (function () {
 // Bump version whenever the stored ground-truth shape changes.
 var GT_VERSION = 4

 function _getParkStore() {
  try {
   if (typeof context !== "undefined" && context && context.getParkStorage) {
    return context.getParkStorage(RR.config.INTERNAL_NAME)
   }
  } catch (_) {}
  return null
 }

 function _loadState() {
  var store = _getParkStore()
  if (!store || typeof store.get !== "function") {
   return { version: GT_VERSION, base: null }
  }

  var data
  try {
   data = store.get(RR.config.STORAGE.PARK_KEY, {})
  } catch (_) {
   data = {}
  }
  if (!data || typeof data !== "object") {
   data = {}
  }

  var gt = data.groundTruth
  if (!gt || typeof gt !== "object" || gt.version !== GT_VERSION) {
   // Unknown / old version -> treat as empty so we can re-seed cleanly.
   return { version: GT_VERSION, base: null }
  }
  return gt
 }

 function _saveState(state) {
  var store = _getParkStore()
  if (!store || typeof store.set !== "function") {
   return
  }

  var data
  try {
   data = store.get(RR.config.STORAGE.PARK_KEY, {})
  } catch (_) {
   data = {}
  }
  if (!data || typeof data !== "object") {
   data = {}
  }

  state.version = GT_VERSION
  data.groundTruth = state
  try {
   store.set(RR.config.STORAGE.PARK_KEY, data)
  } catch (_) {}
 }

 function _copyCounts(src) {
  var dst = {}
  if (!src || typeof src !== "object") {
   return dst
  }
  for (var k in src) {
   if (src.hasOwnProperty(k)) {
    dst[k] = src[k]
   }
  }
  return dst
 }

 // Sum two per-category maps into a new one, recomputing "total" from category entries.
 function _sumCounts(a, b) {
  var out = {}
  var k

  if (a && typeof a === "object") {
   for (k in a) {
    if (!a.hasOwnProperty(k) || k === "total") {
     continue
    }
    var v = a[k]
    if (typeof v === "number") {
     out[k] = (out[k] || 0) + v
    }
   }
  }

  if (b && typeof b === "object") {
   for (k in b) {
    if (!b.hasOwnProperty(k) || k === "total") {
     continue
    }
    var v2 = b[k]
    if (typeof v2 === "number") {
     out[k] = (out[k] || 0) + v2
    }
   }
  }

  var total = 0
  for (k in out) {
   if (!out.hasOwnProperty(k)) {
    continue
   }
   if (k === "total") {
    continue
   }
   var vv = out[k]
   if (typeof vv === "number") {
    total += vv
   }
  }
  out.total = total
  return out
 }

 // Build a canonical pool-key for options that affect the candidate pool.
 function _poolKey(opts) {
  opts = opts || {}
  return "excludeCustom=" + (opts.excludeCustom ? "1" : "0")
 }

 /**
  * Resolve ground-truth totals for the current park.
  *
  * Inputs:
  *   loadCounts: per-category counts for the *candidate pool* of randomizable items
  *               (from catalog: installed + filters, NOT current/research lists).
  *   curCounts:  per-category counts for the *current randomizable subset*
  *               (CURRENT list, before this randomization run).
  *   resCounts:  per-category counts for the *research randomizable subset*
  *               (RESEARCH list, before this randomization run).
  *   opts:       options bag (excludeCustom).
  *
  * Stored baseline (per park):
  *   base.loadCounts     — candidate pool baseline per-category
  *   base.loadTotal      — candidate pool baseline total
  *   base.origCounts     — original combined randomizable per-category (cur+res)
  *   base.origTotal      — original combined randomizable total
  *   base.origCurCounts  — original CURRENT randomizable per-category
  *   base.origCurTotal   — original CURRENT randomizable total
  *   base.origResCounts  — original RESEARCH randomizable per-category
  *   base.origResTotal   — original RESEARCH randomizable total
  *   base.excludeCustom  — flag used when baseline was recorded
  *   base.poolKey        — canonical string for all pool-shaping options
  *
  * Returns:
  *   {
  *     loadCounts:    <candidate pool baseline counts>,
  *     loadTotal:     <candidate pool baseline total>,
  *     origCounts:    <combined baseline counts>,
  *     origTotal:     <combined baseline total>,
  *     origCurCounts: <baseline CURRENT counts>,
  *     origCurTotal:  <baseline CURRENT total>,
  *     origResCounts: <baseline RESEARCH counts>,
  *     origResTotal:  <baseline RESEARCH total>
  *   }
  */
 function resolve(loadCounts, curCounts, resCounts, opts) {
  loadCounts = loadCounts || {}
  curCounts = curCounts || {}
  resCounts = resCounts || {}
  opts = opts || {}

  var excludeCustomFlag = !!opts.excludeCustom
  var curPoolKey = _poolKey(opts)

  var curLoadTotal = loadCounts && typeof loadCounts.total === "number" ? loadCounts.total : 0
  var curCurTotal = curCounts && typeof curCounts.total === "number" ? curCounts.total : 0
  var curResTotal = resCounts && typeof resCounts.total === "number" ? resCounts.total : 0

  var combinedCounts = _sumCounts(curCounts, resCounts)
  var combinedTotal = combinedCounts && typeof combinedCounts.total === "number" ? combinedCounts.total : 0

  var st = _loadState()
  var base = st.base

  // Re-init whenever we have no baseline, or the pool-shaping options changed.
  var needsInit = !base || base.poolKey !== curPoolKey

  if (needsInit) {
   // Fresh baseline (first run for this park / pool combination).
   base = {
    loadCounts: _copyCounts(loadCounts),
    loadTotal: curLoadTotal,
    origCounts: _copyCounts(combinedCounts),
    origTotal: combinedTotal,
    origCurCounts: _copyCounts(curCounts),
    origCurTotal: curCurTotal,
    origResCounts: _copyCounts(resCounts),
    origResTotal: curResTotal,
    excludeCustom: excludeCustomFlag,
    poolKey: curPoolKey,
   }

   st.base = base
   _saveState(st)

   RR.log.info(
    "[Ground] Initialized baseline totals: " +
     "totalRandomizable=" +
     base.loadTotal +
     ", origRandomizable=" +
     base.origTotal +
     " (origCur=" +
     base.origCurTotal +
     ", origRes=" +
     base.origResTotal +
     ", excludeCustom=" +
     (excludeCustomFlag ? 1 : 0) +
     ', poolOpts="' +
     curPoolKey +
     '").'
   )
  } else {
   // Keep excludeCustom in sync (it is also encoded into poolKey, but this is
   // useful for diagnostics in case something drifts).
   if (base.excludeCustom !== excludeCustomFlag) {
    base.excludeCustom = excludeCustomFlag
    st.base = base
    _saveState(st)
   }

   // Candidate baseline: if the available candidate pool *shrinks*, clamp down.
   if (curLoadTotal > 0 && curLoadTotal < base.loadTotal) {
    base.loadCounts = _copyCounts(loadCounts)
    base.loadTotal = curLoadTotal
    base.poolKey = curPoolKey
    base.excludeCustom = excludeCustomFlag
    st.base = base
    _saveState(st)
    RR.log.info("[Ground] Adjusted baseline down to current candidate totals: totalRandomizable=" + base.loadTotal + ".")
   }

   // Combined original-randomizable baseline normally stays fixed across runs so
   // multipliers are always relative to the first "before" snapshot, not
   // the current (possibly inflated) lists. We only ever tighten it if it
   // somehow drifts above the candidate pool baseline.
   if (base.origTotal > base.loadTotal && base.loadTotal > 0) {
    base.origTotal = base.loadTotal
    st.base = base
    _saveState(st)
    RR.log.warn("[Ground] Orig combined baseline clamped to candidate pool: origRandomizable=" + base.origTotal + ", loadRandomizable=" + base.loadTotal + ".")
   }

   // Per-list baselines (origCur / origRes) are kept as recorded for this park/pool
   // combination. They define the "shape" we want CURRENT and RESEARCH to keep over
   // repeated runs. We intentionally do not recompute them from current lists.
  }

  return {
   loadCounts: base.loadCounts || {},
   loadTotal: typeof base.loadTotal === "number" ? base.loadTotal : 0,
   origCounts: base.origCounts || {},
   origTotal: typeof base.origTotal === "number" ? base.origTotal : 0,
   origCurCounts: base.origCurCounts || {},
   origCurTotal: typeof base.origCurTotal === "number" ? base.origCurTotal : 0,
   origResCounts: base.origResCounts || {},
   origResTotal: typeof base.origResTotal === "number" ? base.origResTotal : 0,
  }
 }

 return {
  resolve: resolve,
 }
})()
/* ============= End of RR.ground.core ============= */

/** ==================================================
 * Module: RR.randomize.algo
 * Purpose: Shared helper algorithms for randomization (shuffle, per-category picker).
 * Exports: RR.randomAlgo
 * Imports: RR.randomCore
 * Version: 3.0.0-alpha.1   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomAlgo = (function () {
 var ORDER = RR.randomCore && RR.randomCore.ORDER ? RR.randomCore.ORDER : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 function _makeLocalRng(rng) {
  if (typeof rng === "function") {
   return function (n) {
    return n > 0 ? rng(n) : 0
   }
  }
  return function (n) {
   return n > 0 ? Math.floor(Math.random() * n) : 0
  }
 }

 // Fisher–Yates shuffle.
 function shuffle(list, rng) {
  if (!list || list.length <= 1) {
   return
  }
  var r = _makeLocalRng(rng)
  for (var i = list.length - 1; i > 0; i--) {
   var j = r(i + 1)
   var t = list[i]
   list[i] = list[j]
   list[j] = t
  }
 }

 function pickForNeeds(byCat, needMap, rng, used) {
  byCat = byCat || {}
  needMap = needMap || {}
  used = used || {}

  var out = []
  var r = _makeLocalRng(rng)
  var i, cat, need, bin, k, it

  for (i = 0; i < ORDER.length; i++) {
   cat = ORDER[i]
   need = needMap[cat] || 0
   if (need <= 0) {
    continue
   }

   bin = (byCat[cat] || []).slice(0)
   if (!bin.length) {
    continue
   }

   shuffle(bin, r)

   for (k = 0; k < bin.length && need > 0; k++) {
    it = bin[k]
    if (!it || !it.identifier) {
     continue
    }
    if (used[it.identifier]) {
     continue
    }
    used[it.identifier] = true
    out.push(it)
    need--
   }

   // Update remaining need (for diagnostics, if desired).
   needMap[cat] = need

   // Prune used identifiers out of the global bin for this category.
   var orig = byCat[cat] || []
   var kept = []
   for (k = 0; k < orig.length; k++) {
    var cand = orig[k]
    if (!cand || !cand.identifier) {
     continue
    }
    if (!used[cand.identifier]) {
     kept.push(cand)
    }
   }
   byCat[cat] = kept
  }

  return out
 }

 return {
  shuffle: shuffle,
  pickForNeeds: pickForNeeds,
 }
})()
/* ============= End of RR.randomize.algo ============= */

/** ==================================================
 * Module: RR.randomCandidates.core
 * Purpose: Build the randomizable candidate pool from installed objects.
 * Exports: RR.randomCandidates
 * Imports: RR.catalog, RR.randomSpecial, RR.helper, RR.randomCore, RR.log
 * Version: 3.0.0-alpha.1   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomCandidates = (function () {
 var ORDER = RR.randomCore && RR.randomCore.ORDER ? RR.randomCore.ORDER : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 // Map catalog identities to ResearchItem-like entries with identifiers.
 function _buildMasterItems(master) {
  var caches = RR.helper && RR.helper.getIndexCaches ? RR.helper.getIndexCaches() : null
  var rideIdxById = caches && caches.rideIndexById ? caches.rideIndexById : {}
  var groupIdxById = caches && caches.groupIndexById ? caches.groupIndexById : {}

  var items = []
  if (!master || !master.length) {
   return items
  }

  for (var i = 0; i < master.length; i++) {
   var id = master[i]
   if (!id || !id.identifier) {
    continue
   }

   if (id.type === "ride") {
    var rIdx = rideIdxById[id.identifier]
    if (typeof rIdx === "number") {
     var ro = null
     var rt = null
     try {
      ro = objectManager.getObject("ride", rIdx)
      rt = ro && ro.rideType && ro.rideType.length ? ro.rideType[0] : null
     } catch (_) {
      rt = null
     }
     items.push({
      type: "ride",
      object: rIdx,
      rideType: typeof rt === "number" ? rt : null,
      identifier: id.identifier,
     })
    }
   } else {
    var gIdx = groupIdxById[id.identifier]
    if (typeof gIdx === "number") {
     items.push({
      type: "scenery",
      object: gIdx,
      identifier: id.identifier,
     })
    }
   }
  }

  return items
 }

 function build(usage, verbose) {
  var master = RR.catalog.buildMaster()

  var allItems = _buildMasterItems(master)
  var split = RR.randomSpecial.splitBySpecial(allItems, usage)
  var randItems = split && split.rand ? split.rand : []

  // Bucket randomizable items by category for planner + selectors.
  var byCatItems = {}
  var byCatIdents = {}
  var candCounts = RR.randomCore.zeros()

  var i
  for (i = 0; i < ORDER.length; i++) {
   byCatItems[ORDER[i]] = []
   byCatIdents[ORDER[i]] = []
  }

  for (i = 0; i < randItems.length; i++) {
   var it = randItems[i]
   if (!it || !it.identifier) {
    continue
   }

   var cat = RR.helper.categoryFromItem(it)
   if (!byCatItems[cat]) {
    byCatItems[cat] = []
    byCatIdents[cat] = []
   }

   byCatItems[cat].push(it)
   var ident = {
    type: it.type === "ride" ? "ride" : "scenery",
    identifier: it.identifier,
   }
   byCatIdents[cat].push(ident)

   candCounts[cat] = (candCounts[cat] || 0) + 1
   candCounts.total++
  }

  if (verbose) {
   RR.log.info("[Randomize] catalog candidates (randomizable): total=" + candCounts.total + " (from master=" + master.length + ", special/kept=" + (split && split.keep ? split.keep.length : 0) + ").")
  }

  return {
   master: master,
   items: randItems,
   byCatItems: byCatItems,
   byCatIdents: byCatIdents,
   candCounts: candCounts,
  }
 }

 return {
  build: build,
 }
})()
/* ============= End of RR.randomCandidates.core ============= */

/** ==================================================
 * Module: RR.randomPlan.core
 * Purpose: Compute per-category targets for CURRENT / RESEARCH / LOADED.
 * Exports: RR.randomPlan
 * Imports: RR.randomCore, RR.ground, RR.log
 * Version: 3.0.0-alpha.3   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomPlan = (function () {
 var ORDER = RR.randomCore && RR.randomCore.ORDER ? RR.randomCore.ORDER : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 function _zeros() {
  return RR.randomCore.zeros()
 }

 // Build combined (randomizable) counts from CURRENT + RESEARCH.
 function _buildRandCounts(curCounts, resCounts) {
  var out = _zeros()
  curCounts = curCounts || _zeros()
  resCounts = resCounts || _zeros()

  for (var i = 0; i < ORDER.length; i++) {
   var c = ORDER[i]
   var cv = curCounts[c] || 0
   var rv = resCounts[c] || 0
   var sum = cv + rv
   out[c] = sum
   out.total += sum
  }
  return out
 }

 // Copy map into a fresh zeros() structure.
 function _copyCounts(src) {
  var dst = _zeros()
  if (!src) {
   return dst
  }
  for (var i = 0; i < ORDER.length; i++) {
   var c = ORDER[i]
   if (src.hasOwnProperty(c)) {
    dst[c] = src[c] || 0
    dst.total += dst[c]
   }
  }
  return dst
 }

 // Ensure baseline categories (non-zero in baseOrigCats AND available in candCounts)
 // remain present in the LOADED targets whenever the total budget allows it.
 function _ensureBaselineCategoriesPresentForLoad(target, baseOrigCats, totalBudget, candCounts) {
  if (!target) {
   return
  }

  var baselineCats = []
  var i, cat, baseVal, candVal
  for (i = 0; i < ORDER.length; i++) {
   cat = ORDER[i]
   baseVal = baseOrigCats && baseOrigCats[cat] ? baseOrigCats[cat] : 0
   candVal = candCounts && candCounts[cat] ? candCounts[cat] : 0
   if (baseVal > 0 && candVal > 0) {
    baselineCats.push(cat)
   }
  }

  if (!baselineCats.length) {
   return
  }

  if (totalBudget < baselineCats.length) {
   // Not enough total slots to guarantee at least one per baseline category.
   return
  }

  var need = []
  var donors = []

  for (i = 0; i < baselineCats.length; i++) {
   cat = baselineCats[i]
   var v = target[cat] || 0
   if (v === 0) {
    need.push(cat)
   } else if (v > 1) {
    donors.push(cat)
   }
  }

  if (!need.length || !donors.length) {
   return
  }

  var donorIndex = 0
  var j, needCat, donorCat

  for (j = 0; j < need.length; j++) {
   needCat = need[j]

   // Find next donor with >1 left.
   while (donorIndex < donors.length) {
    donorCat = donors[donorIndex]
    var dv = target[donorCat] || 0
    if (dv > 1) {
     break
    }
    donorIndex++
   }
   if (donorIndex >= donors.length) {
    break
   }

   donorCat = donors[donorIndex]
   target[donorCat] = (target[donorCat] || 0) - 1
   target[needCat] = (target[needCat] || 0) + 1
  }

  var sum = 0
  for (i = 0; i < ORDER.length; i++) {
   cat = ORDER[i]
   sum += target[cat] || 0
  }
  target.total = sum
 }

 // Ensure baseline CURRENT categories (non-zero in baseOrigCurCats AND available in candCounts)
 // remain present in the CURRENT targets, without violating Load >= Current per category.
 //
 // This uses the *original CURRENT* randomizable subset as the baseline, so categories
 // that only existed in RESEARCH do not get forced into CURRENT just to satisfy "loaded".
 function _ensureBaselineCategoriesPresentInCurrent(curTarget, loadTarget, baseOrigCurCats, curBudget, candCounts) {
  if (!curTarget || !loadTarget) {
   return
  }

  var baselineCats = []
  var i, cat, baseVal, candVal
  for (i = 0; i < ORDER.length; i++) {
   cat = ORDER[i]
   baseVal = baseOrigCurCats && baseOrigCurCats[cat] ? baseOrigCurCats[cat] : 0
   candVal = candCounts && candCounts[cat] ? candCounts[cat] : 0
   if (baseVal > 0 && candVal > 0) {
    baselineCats.push(cat)
   }
  }

  if (!baselineCats.length) {
   return
  }

  if (curBudget < baselineCats.length) {
   // Not enough CURRENT slots to keep every baseline category represented.
   return
  }

  var needCats = []
  for (i = 0; i < baselineCats.length; i++) {
   cat = baselineCats[i]
   var curVal = curTarget[cat] || 0
   var loadVal = loadTarget[cat] || 0
   if (curVal === 0 && loadVal > 0) {
    needCats.push(cat)
   }
  }

  if (!needCats.length) {
   return
  }

  // Donor categories: have >1 in CURRENT and still have some RESEARCH room
  // (i.e., curTarget < loadTarget).
  var donors = []
  for (i = 0; i < ORDER.length; i++) {
   cat = ORDER[i]
   var cVal = curTarget[cat] || 0
   var lVal = loadTarget[cat] || 0
   if (cVal > 1 && cVal < lVal) {
    donors.push(cat)
   }
  }

  if (!donors.length) {
   return
  }

  var donorIndex = 0
  var j, needCat, donorCat

  for (j = 0; j < needCats.length; j++) {
   needCat = needCats[j]

   // Find next donor that still satisfies cVal > 1 && cVal < lVal.
   while (donorIndex < donors.length) {
    donorCat = donors[donorIndex]
    var curVal2 = curTarget[donorCat] || 0
    var loadVal2 = loadTarget[donorCat] || 0
    if (curVal2 > 1 && curVal2 < loadVal2) {
     break
    }
    donorIndex++
   }
   if (donorIndex >= donors.length) {
    break
   }

   donorCat = donors[donorIndex]
   curTarget[donorCat] = (curTarget[donorCat] || 0) - 1
   curTarget[needCat] = (curTarget[needCat] || 0) + 1
  }

  var sum = 0
  for (i = 0; i < ORDER.length; i++) {
   cat = ORDER[i]
   sum += curTarget[cat] || 0
  }
  curTarget.total = sum
 }

 function plan(curCounts, resCounts, candCounts, opts) {
  opts = opts || {}
  curCounts = curCounts || _zeros()
  resCounts = resCounts || _zeros()
  candCounts = candCounts || _zeros()

  var curTotalRand = typeof curCounts.total === "number" ? curCounts.total : 0
  var resTotalRand = typeof resCounts.total === "number" ? resCounts.total : 0

  var randCounts = _buildRandCounts(curCounts, resCounts)

  var baseLoadCats = candCounts
  var baseTotal = typeof baseLoadCats.total === "number" ? baseLoadCats.total : 0
  var baseOrigCats = randCounts
  var baseOrigTotal = typeof randCounts.total === "number" ? randCounts.total : 0

  // Per-list baselines: CURRENT and RESEARCH.
  var baseOrigCurCats = curCounts
  var baseOrigCurTotal = curTotalRand
  var baseOrigResCats = resCounts
  var baseOrigResTotal = resTotalRand

  // Category mode: "preserve" | "even"
  var categoryMode = typeof opts.categoryMode === "string" ? opts.categoryMode : null
  if (categoryMode !== "preserve" && categoryMode !== "even") {
   categoryMode = opts.preserveCategoryRatio ? "preserve" : "even"
  }

  // Ground-truth anchoring.
  var poolOpts = {
   excludeCustom: !!opts.excludeCustom,
  }
  var gt = RR.ground.resolve(baseLoadCats, curCounts, resCounts, poolOpts)
  if (gt) {
   if (gt.loadCounts && typeof gt.loadTotal === "number") {
    baseLoadCats = gt.loadCounts
    baseTotal = gt.loadTotal
   }
   if (gt.origCounts && typeof gt.origTotal === "number") {
    baseOrigCats = gt.origCounts
    baseOrigTotal = gt.origTotal
   }
   if (gt.origCurCounts && typeof gt.origCurTotal === "number") {
    baseOrigCurCats = gt.origCurCounts
    baseOrigCurTotal = gt.origCurTotal
   }
   if (gt.origResCounts && typeof gt.origResTotal === "number") {
    baseOrigResCats = gt.origResCounts
    baseOrigResTotal = gt.origResTotal
   }
  }

  // Multiplier: scales the *original* randomizable total across categories.
  var mult = typeof opts.researchMultiplier === "number" && opts.researchMultiplier > 0 ? opts.researchMultiplier : 1.0

  // Original total randomizable items we want to work from (combined).
  var origTotalRand = baseOrigTotal > 0 ? baseOrigTotal : randCounts.total

  // Target total randomizable items we want AFTER (current + research).
  var targetLoaded = Math.round(origTotalRand * mult)

  // Clamp by candidate baseline and by current-randomizable floor (global).
  if (baseTotal > 0 && targetLoaded > baseTotal) {
   targetLoaded = baseTotal
  }
  if (targetLoaded < curTotalRand) {
   targetLoaded = curTotalRand
  }

  var targetCurCats
  var targetLoadCats

  if (categoryMode === "preserve") {
   // -------- Preserve mode --------

   // LOADED (Cur+Res) targets:
   if (baseOrigTotal > 0 && targetLoaded === baseOrigTotal) {
    // Exact 1.0x baseline: copy original combined per-category counts verbatim.
    targetLoadCats = _copyCounts(baseOrigCats)
    targetLoadCats.total = baseOrigTotal
   } else {
    // Scale from combined baseline using weights, then ensure combined baseline
    // categories remain present.
    var wLoad = RR.randomCore.weightsFrom(null, baseOrigCats, baseLoadCats)
    var rawAdds = RR.randomCore.apportion(targetLoaded, wLoad)
    targetLoadCats = _zeros()
    var iL
    for (iL = 0; iL < ORDER.length; iL++) {
     var cL = ORDER[iL]
     var vL = rawAdds[cL] || 0
     targetLoadCats[cL] = vL
     targetLoadCats.total += vL
    }
    _ensureBaselineCategoriesPresentForLoad(targetLoadCats, baseOrigCats, targetLoaded, baseLoadCats)
   }

   // CURRENT: shape from the *original CURRENT* per-category mix when available.
   // If original CURRENT baseline is empty, fall back to the combined/load shape.
   var wCur
   if (baseOrigCurTotal > 0) {
    // Use CURRENT baseline as primary.
    wCur = RR.randomCore.weightsFrom(baseOrigCurCats, null, null)
   } else if (baseOrigTotal > 0) {
    // Fallback: use combined baseline.
    wCur = RR.randomCore.weightsFrom(null, baseOrigCats, baseLoadCats)
   } else {
    // Last resort: derive from candidate pool.
    wCur = RR.randomCore.weightsFrom(null, null, baseLoadCats)
   }

   var rawCur = RR.randomCore.apportion(curTotalRand, wCur)
   targetCurCats = _zeros()
   var iC
   for (iC = 0; iC < ORDER.length; iC++) {
    var cC = ORDER[iC]
    targetCurCats[cC] = rawCur[cC] || 0
    targetCurCats.total += targetCurCats[cC]
   }

   // Ensure baseline CURRENT categories remain represented in CURRENT,
   // using the original CURRENT baseline (not the combined baseline).
   _ensureBaselineCategoriesPresentInCurrent(targetCurCats, targetLoadCats, baseOrigCurCats, curTotalRand, baseLoadCats)
  } else {
   // -------- Even mode --------
   var active = RR.randomCore.activeCats(curCounts, baseLoadCats)
   targetCurCats = RR.randomCore.evenSplit(curTotalRand, active)
   targetLoadCats = RR.randomCore.evenSplit(targetLoaded, active)
  }

  // RESEARCH targets = Loaded - Current per category.
  var targetResCats = _zeros()
  for (var iR = 0; iR < ORDER.length; iR++) {
   var cat = ORDER[iR]
   var rCount = (targetLoadCats[cat] || 0) - (targetCurCats[cat] || 0)
   if (rCount < 0) {
    rCount = 0
   }
   targetResCats[cat] = rCount
   targetResCats.total += rCount
  }

  return {
   categoryMode: categoryMode,
   preserveRatio: categoryMode === "preserve",
   mult: mult,
   curTotalRand: curTotalRand,
   resTotalRand: resTotalRand,
   targetLoaded: targetLoaded,
   targetCurCats: targetCurCats,
   targetResCats: targetResCats,
   targetLoadCats: targetLoadCats,
   baseLoadCats: baseLoadCats,
   baseOrigCats: baseOrigCats,
   baseOrigCurCats: baseOrigCurCats,
   baseOrigResCats: baseOrigResCats,
   baseTotal: baseTotal,
   baseOrigTotal: baseOrigTotal,
   baseOrigCurTotal: baseOrigCurTotal,
   baseOrigResTotal: baseOrigResTotal,
  }
 }

 return {
  plan: plan,
 }
})()
/* ============= End of RR.randomPlan.core ============= */

/** ==================================================
 * Module: RR.randomSelect.core
 * Purpose: Select CURRENT and RESEARCH items to satisfy per-category targets.
 * Exports: RR.randomSelect
 * Imports: RR.randomCore, RR.randomAlgo, RR.researchBuild
 * Version: 3.0.0-alpha.1   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomSelect = (function () {
 var ORDER = RR.randomCore && RR.randomCore.ORDER ? RR.randomCore.ORDER : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 function _makeLocalRng(rng) {
  if (typeof rng === "function") {
   return function (n) {
    return n > 0 ? rng(n) : 0
   }
  }
  return function (n) {
   return n > 0 ? Math.floor(Math.random() * n) : 0
  }
 }

 // Even-mode strict selector on item-level buckets.
 // byCatItems: { cat -> ResearchItem[] }
 function _selectEvenItems(byCatItems, targetCurCats, targetResCats, rng) {
  var used = {}
  var curItems = []
  var resItems = []

  var r = _makeLocalRng(rng)

  for (var i = 0; i < ORDER.length; i++) {
   var cat = ORDER[i]
   var curNeed = targetCurCats[cat] || 0
   var resNeed = targetResCats[cat] || 0

   if (curNeed <= 0 && resNeed <= 0) {
    continue
   }

   var bin = (byCatItems[cat] || []).slice(0)
   if (!bin.length) {
    continue
   }

   // Shuffle per-category bin.
   try {
    if (RR.randomAlgo && RR.randomAlgo.shuffle) {
     RR.randomAlgo.shuffle(bin, r)
    }
   } catch (_) {}

   for (var j = 0; j < bin.length && (curNeed > 0 || resNeed > 0); j++) {
    var it = bin[j]
    if (!it || !it.identifier) {
     continue
    }
    if (used[it.identifier]) {
     continue
    }

    if (curNeed > 0) {
     curItems.push(it)
     used[it.identifier] = true
     curNeed--
    } else if (resNeed > 0) {
     resItems.push(it)
     used[it.identifier] = true
     resNeed--
    }
   }
  }

  return {
   cur: curItems,
   res: resItems,
  }
 }

 function select(categoryMode, byCatItems, byCatIdents, targetCurCats, targetResCats, rng) {
  if (categoryMode === "even") {
   var selEven = _selectEvenItems(byCatItems || {}, targetCurCats || {}, targetResCats || {}, rng)
   return {
    cur: selEven.cur || [],
    res: selEven.res || [],
   }
  }

  // Preserve (and any future) modes use identity-level picker + researchBuild.
  var curNeed = {}
  var resNeed = {}
  var i

  for (i = 0; i < ORDER.length; i++) {
   var c = ORDER[i]
   curNeed[c] = targetCurCats && typeof targetCurCats[c] === "number" ? targetCurCats[c] : 0
   resNeed[c] = targetResCats && typeof targetResCats[c] === "number" ? targetResCats[c] : 0
  }

  var usedMap = {}
  var curIDs = RR.randomAlgo.pickForNeeds(byCatIdents || {}, curNeed, rng, usedMap)
  var resIDs = RR.randomAlgo.pickForNeeds(byCatIdents || {}, resNeed, rng, usedMap)
  var lists = RR.researchBuild.buildFromIdentities(curIDs, resIDs)

  return {
   cur: lists.cur || [],
   res: lists.res || [],
  }
 }

 return {
  select: select,
 }
})()
/* ============= End of RR.randomSelect.core ============= */

/** ==================================================
 * Module: RR.randomize.engine
 * Purpose: Core randomization engine (orchestrates planning, selection, and apply).
 * Exports: RR.randomEngine
 * Imports: RR.log, RR.state, RR.randomCore, RR.randomSpecial,
 *          RR.randomCandidates, RR.randomPlan, RR.randomSelect,
 *          RR.essential, RR.unload, RR.helper, RR.randomAlgo
 * Version: 3.0.0-alpha.12   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomEngine = (function () {
 var ORDER = RR.randomCore && RR.randomCore.ORDER ? RR.randomCore.ORDER : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

 function applyOnce(rng, opts) {
  var label = "[Randomize]"

  if (!park || !park.research) {
   RR.log.warn(label + " Research system unavailable (deferred).")
   return
  }

  opts = opts || {}

  var verbose = !!opts.verboseLogging

  // Category mode: "preserve" | "even"
  var categoryMode = typeof opts.categoryMode === "string" ? opts.categoryMode : null
  if (categoryMode !== "preserve" && categoryMode !== "even") {
   categoryMode = opts.preserveCategoryRatio ? "preserve" : "even"
  }

  // Single usage snapshot for this run (rides + scenery groups in use).
  var usage = null
  try {
   var usedRideIdx = RR.helper && RR.helper.scanRideObjectIndices ? RR.helper.scanRideObjectIndices() : {}
   var usedSceneryIds = RR.helper && RR.helper.scanSceneryIdentifiers ? RR.helper.scanSceneryIdentifiers() : {}
   var usedGroupIdx = RR.helper && RR.helper.computeSceneryGroupIndices ? RR.helper.computeSceneryGroupIndices(usedSceneryIds) : {}
   usage = {
    usedRideIdx: usedRideIdx || {},
    usedGroupIdx: usedGroupIdx || {},
   }
  } catch (_) {
   usage = null
  }

  // Snapshot current research lists at the moment we apply randomization.
  var curNow = (park.research.inventedItems || []).slice(0)
  var resNow = (park.research.uninventedItems || []).slice(0)

  // Split into special vs randomizable, reusing shared usage snapshot.
  var splitCur = RR.randomSpecial.splitBySpecial(curNow, usage)
  var splitRes = RR.randomSpecial.splitBySpecial(resNow, usage)

  var keepCur = splitCur.keep
  var keepRes = splitRes.keep
  var randCur = splitCur.rand
  var randRes = splitRes.rand

  if (!randCur.length && !randRes.length) {
   RR.log.info(label + " No randomizable items; leaving research lists unchanged.")
   return
  }

  // Per-category counts for the *randomizable* subset (current + research).
  var curCounts = RR.randomCore.tallyFromList(randCur)
  var resCounts = RR.randomCore.tallyFromList(randRes)

  // Candidate pool construction (from catalog).
  var cand = RR.randomCandidates.build(usage, verbose)
  var byCatItems = cand.byCatItems || {}
  var byCatIdents = cand.byCatIdents || {}
  var candCounts = cand.candCounts || RR.randomCore.zeros()

  // Planning: compute per-category targets for Cur / Res / Load.
  var planRes = RR.randomPlan.plan(curCounts, resCounts, candCounts, opts)

  if (verbose) {
   RR.log.info(
    label +
     " planning: curTotalRand=" +
     planRes.curTotalRand +
     ", baseTotalRand=" +
     planRes.baseTotal +
     ", origTotalRand=" +
     planRes.baseOrigTotal +
     ", mult=" +
     planRes.mult +
     ", targetLoadedRand=" +
     planRes.targetLoaded
   )
   RR.log.info(
    label +
     " targets (randomizable, per-category): Cur=" +
     JSON.stringify(planRes.targetCurCats) +
     ", Load=" +
     JSON.stringify(planRes.targetLoadCats) +
     ", Res=" +
     JSON.stringify(planRes.targetResCats)
   )
  }

  // Selection: pick items to match the planner's targets.
  var lists = RR.randomSelect.select(planRes.categoryMode, byCatItems, byCatIdents, planRes.targetCurCats, planRes.targetResCats, rng)

  // Re-attach special/in-use items from the original research lists.
  var finalCur = keepCur.concat(lists.cur || [])
  var finalRes = keepRes.concat(lists.res || [])

  // Apply essential-item modes (Ignore / Researchable / Start with).
  try {
   if (RR.essential && typeof RR.essential.applyModes === "function") {
    var adjusted = RR.essential.applyModes(finalCur, finalRes, rng)
    if (adjusted && adjusted.cur && adjusted.res) {
     finalCur = adjusted.cur
     finalRes = adjusted.res
    }
   }
  } catch (eEss) {
   RR.log.warn(label + " essential mode application failed: " + (eEss && eEss.message ? eEss.message : String(eEss)))
  }

  // FINAL SHUFFLE OF RESEARCH LIST:
  // Order matters in the research list, so shuffle to avoid big clumps.
  try {
   RR.randomAlgo.shuffle(finalRes, rng)
  } catch (eShuf) {
   RR.log.warn("[Randomize] final research shuffle failed: " + (eShuf && eShuf.message ? eShuf.message : String(eShuf)))
  }

  // Write new research state.
  park.research.inventedItems = finalCur
  park.research.uninventedItems = finalRes

  // Tighten loaded objects to match the new research lists (plus park usage and special cases),
  // reusing the same usage snapshot so no extra scans.
  RR.unload.applyForResearch(finalCur, finalRes, "[Randomize unload]", usage)

  var toastMode = planRes.categoryMode === "even" ? "Even item distribution" : "Preserve category ratio"
  RR.log.toast("Research randomized (mode=" + toastMode + ", mult=" + planRes.mult + ")")
 }

 return {
  applyOnce: applyOnce,
 }
})()
/* ============= End of RR.randomize.engine ============= */

/** ==================================================
 * Module: RR.randomize.entry
 * Purpose: Entry point for randomization (seed management, deferral, stats, warning dialog).
 * Exports: RR.randomize
 * Imports: RR.log, RR.state, RR.store, RR.defer, RR.stats, RR.randomCore, RR.randomEngine, RR.config
 * Version: 3.0.0-alpha.3   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.randomize = (function () {
 var _pendingStats = null
 var _afterSub = null

 function _armAfterStats() {
  if (!context || typeof context.subscribe !== "function") {
   RR.log.warn("[Randomize] context.subscribe unavailable; AFTER stats disabled.")
   return
  }
  try {
   if (_afterSub && _afterSub.dispose) {
    _afterSub.dispose()
   }
  } catch (_) {}

  _afterSub = context.subscribe("interval.day", function () {
   try {
    if (_pendingStats && RR.stats && RR.stats.logBeforeAfter) {
     var curAfter = park && park.research && park.research.inventedItems ? park.research.inventedItems.slice(0) : []
     var resAfter = park && park.research && park.research.uninventedItems ? park.research.uninventedItems.slice(0) : []

     RR.stats.logBeforeAfter(_pendingStats.curBefore, curAfter, _pendingStats.resBefore, resAfter)
    }
   } catch (e) {
    RR.log.warn("[Randomize] AFTER stats failed: " + (e && e.message ? e.message : String(e)))
   }

   _pendingStats = null
   try {
    if (_afterSub && _afterSub.dispose) {
     _afterSub.dispose()
    }
   } catch (_) {}
   _afterSub = null
  })
 }

 // Helper: get existing warning window, if any.
 function _getWarningWindow() {
  if (typeof ui === "undefined" || !ui || !ui.getWindow) {
   return null
  }
  try {
   return ui.getWindow(RR.config.CLASS + ".warn")
  } catch (_) {
   return null
  }
 }

 // Simple info-only warning dialog when randomization is armed.
 // Ensures only one warning window exists at a time.
 function _showWarningDialog() {
  if (typeof ui === "undefined" || !ui || !ui.openWindow) {
   return
  }

  // If a warning window already exists, just bring it to front.
  var existing = _getWarningWindow()
  if (existing) {
   try {
    if (existing.bringToFront) {
     existing.bringToFront()
    }
   } catch (_) {}
   return
  }

  ui.openWindow({
   classification: RR.config.CLASS + ".warn",
   width: 280,
   height: 90,
   title: RR.config.UI_NAME,
   colours: RR.config.COLOURS,
   widgets: [
    { type: "label", x: 10, y: 20, width: 260, height: 10, text: "Randomization primed" },
    { type: "label", x: 10, y: 34, width: 260, height: 10, text: "Advance one day to complete." },
    { type: "label", x: 10, y: 48, width: 260, height: 10, text: "Game may freeze for several seconds." },
   ],
   onUpdate: function () {
    /* no-op */
   },
  })
 }

 // Red warning-box style cooldown message when button is spammed.
 function _showCooldownDialog() {
  try {
   if (typeof ui !== "undefined" && ui && ui.showError) {
    ui.showError(RR.config.UI_NAME, "Randomization on cooldown for 1 day.")
   }
  } catch (_) {
   // If UI is unavailable, just fail silently; no toast/ticker fallback here by design.
  }
 }

 // Deterministic seed bump (same LCG as RR.randomCore.makeRng).
 function _bumpSeed(oldSeed) {
  var s = oldSeed >>> 0
  if (!s) {
   s = 1
  }
  s = (Math.imul(1664525, s) + 1013904223) >>> 0
  if (s === 0) {
   s = 1
  }
  return s
 }

 function randomize() {
  try {
   if (!park || !park.research) {
    RR.log.warn("Research system unavailable.")
    return
   }

   // Cooldown: if a pre-day randomization is already armed, ignore this press
   // and show a red warning-box message instead of arming again.
   if (RR.defer && typeof RR.defer.isArmed === "function" && RR.defer.isArmed()) {
    _showCooldownDialog()
    return
   }

   var opts = RR.state.options || {}
   var verbose = !!opts.verboseLogging

   // Auto-advance seed when enabled, so each randomize uses a new sequence.
   if (opts.automaticallyRandomizeSeed) {
    var newSeed = _bumpSeed(opts.seed || 1)
    opts.seed = newSeed
    RR.state.options.seed = newSeed
    try {
     RR.store.saveOptions()
    } catch (_) {}
   }

   var rng = RR.randomCore.makeRng(opts.seed || 1)

   // Capture BEFORE stats only when verbose logging is enabled.
   if (verbose) {
    var curBefore = (park.research.inventedItems || []).slice(0)
    var resBefore = (park.research.uninventedItems || []).slice(0)
    _pendingStats = { curBefore: curBefore, resBefore: resBefore }
    _armAfterStats()
   } else {
    _pendingStats = null
   }

   // Defer the heavy work to the pre-day window.
   var armed = RR.defer.armPreDayOnce(
    "[Randomize]",
    function () {
     try {
      RR.randomEngine.applyOnce(rng, opts)
     } catch (e) {
      RR.log.error("[Randomize] deferred apply failed: " + (e && e.message ? e.message : String(e)))
     }
    },
    16
   )

   if (armed && !opts.disableWarning) {
    _showWarningDialog()
   }
  } catch (e) {
   RR.log.error("Randomize failed: " + (e && e.message ? e.message : String(e)))
  }
 }

 return {
  randomize: randomize,
 }
})()
/* ============= End of RR.randomize.entry ============= */

/** ==================================================
 * Module: RR.ui.mainWindow
 * Purpose: Two-tab window (Options / Dev); Randomize uses deferred pre-day pulse.
 * Exports: RR.uiMain.open
 * Imports: RR.config, RR.state, RR.store, RR.log, RR.randomize
 * Version: 3.0.0-alpha.7   Since: 2025-11-15
 * =================================================== */
var RR = RR || {}
RR.uiMain = (function () {
 var CONTENT_TOP = 50,
  LINE_H = 14,
  V_PAD = 4,
  STEP = LINE_H + V_PAD,
  PAD_BOTTOM = 12
 var H_CHECK = 14,
  H_TEXT = 14,
  H_DD = 14,
  H_BTN = 16,
  W_BTN = 230,
  WIN_W = 360,
  MARGIN = 10

 var MULT_LABELS = ["1.0x", "1.5x", "2.0x", "3.0x"],
  MULT_VALUES = [1.0, 1.5, 2.0, 3.0]

 var ESS_MODE_LABELS = ["Ignore", "Researchable", "Start with"],
  ESS_MODE_VALUES = ["ignore", "researchable", "start"]

 var CAT_MODE_LABELS = ["Preserve category ratio", "Even item distribution"],
  CAT_MODE_VALUES = ["preserve", "even"]

 function _persist() {
  RR.store.saveOptions()
 }

 function _refresh(win) {
  if (!win) {
   return
  }
  var o = RR.state.options

  function set(n, p, v) {
   try {
    var w = win.findWidget(n)
    if (w) {
     w[p] = v
    }
   } catch (_) {}
  }

  function modeIndex(val) {
   var i
   for (i = 0; i < ESS_MODE_VALUES.length; i++) {
    if (ESS_MODE_VALUES[i] === val) {
     return i
    }
   }
   // Default to "Researchable"
   return 1
  }

  function catModeIndex(val) {
   var mode = val
   if (mode !== "preserve" && mode !== "even") {
    // Fallback to legacy flag if present.
    mode = o.preserveCategoryRatio ? "preserve" : "even"
   }
   var i
   for (i = 0; i < CAT_MODE_VALUES.length; i++) {
    if (CAT_MODE_VALUES[i] === mode) {
     return i
    }
   }
   return 0
  }

  set("chk_exCustom", "isChecked", o.excludeCustom)
  ;(function () {
   var idx = catModeIndex(o.categoryMode)
   set("dd_catMode", "selectedIndex", idx)
  })()

  set("chk_disableWarning", "isChecked", o.disableWarning)
  set("chk_autoSeed", "isChecked", o.automaticallyRandomizeSeed)
  ;(function () {
   var idx = 0
   for (var i = 0; i < MULT_VALUES.length; i++) {
    if (Math.abs(MULT_VALUES[i] - o.researchMultiplier) < 0.001) {
     idx = i
     break
    }
   }
   set("dd_mult", "selectedIndex", idx)
  })()

  set("dd_infoMode", "selectedIndex", modeIndex(o.essentialInfoKioskMode))
  set("dd_cashMode", "selectedIndex", modeIndex(o.essentialCashMachineMode))
  set("dd_firstAidMode", "selectedIndex", modeIndex(o.essentialFirstAidMode))

  set("txt_seed", "text", String(o.seed))
  set("chk_verbose", "isChecked", o.verboseLogging)
 }

 function _openWindow(initialTabIndex) {
  var optionsHeight = 0
  var devHeight = 0
  var win

  function makeRow() {
   var y = CONTENT_TOP
   return {
    next: function () {
     var v = y
     y += STEP
     return v
    },
    peek: function () {
     return y
    },
    height: function () {
     return y + PAD_BOTTOM
    },
   }
  }

  function buildOptionsTab() {
   var r = makeRow()
   var widgets = [
    { type: "label", x: 8, y: r.next(), width: WIN_W - 2 * MARGIN, height: 12, text: "Options" },
    {
     type: "checkbox",
     x: MARGIN,
     y: r.next(),
     width: WIN_W - 2 * MARGIN,
     height: H_CHECK,
     name: "chk_exCustom",
     text: "Exclude custom items",
     isChecked: RR.state.options.excludeCustom,
     onChange: function (v) {
      RR.state.options.excludeCustom = v
      _persist()
     },
    },
    // Category mode dropdown
    (function () {
     var y = r.next()
     return {
      type: "label",
      x: MARGIN,
      y: y,
      width: 160,
      height: 12,
      text: "Category mode:",
     }
    })(),
    (function () {
     var y = r.peek() - STEP
     return {
      type: "dropdown",
      x: 170,
      y: y,
      width: 160,
      height: H_DD,
      name: "dd_catMode",
      items: CAT_MODE_LABELS,
      selectedIndex: 0,
      onChange: function (index) {
       if (index >= 0 && index < CAT_MODE_VALUES.length) {
        var mode = CAT_MODE_VALUES[index]
        RR.state.options.categoryMode = mode
        // Keep legacy flag in sync for migration / diagnostics.
        RR.state.options.preserveCategoryRatio = mode === "preserve"
        _persist()
        _refresh(win)
       }
      },
     }
    })(),
    // Research multiplier
    (function () {
     var y = r.next()
     return { type: "label", x: MARGIN, y: y, width: 160, height: 12, text: "Research multiplier:", name: "lbl_mult" }
    })(),
    (function () {
     var y = r.peek() - STEP
     return {
      type: "dropdown",
      x: 170,
      y: y,
      width: 120,
      height: H_DD,
      name: "dd_mult",
      items: MULT_LABELS,
      selectedIndex: 0,
      onChange: function (index) {
       if (index >= 0 && index < MULT_VALUES.length) {
        RR.state.options.researchMultiplier = MULT_VALUES[index]
        _persist()
        _refresh(win)
       }
      },
     }
    })(),
    // Essential item controls header
    (function () {
     var y = r.next()
     return {
      type: "label",
      x: 8,
      y: y,
      width: WIN_W - 2 * MARGIN,
      height: 12,
      text: "Essential items",
     }
    })(),
    // Info Kiosk
    (function () {
     var y = r.next()
     return {
      type: "label",
      x: MARGIN,
      y: y,
      width: 160,
      height: 12,
      text: "Info Kiosk:",
     }
    })(),
    (function () {
     var y = r.peek() - STEP
     return {
      type: "dropdown",
      x: 170,
      y: y,
      width: 160,
      height: H_DD,
      name: "dd_infoMode",
      items: ESS_MODE_LABELS,
      selectedIndex: 1, // default "Researchable"
      onChange: function (index) {
       if (index >= 0 && index < ESS_MODE_VALUES.length) {
        RR.state.options.essentialInfoKioskMode = ESS_MODE_VALUES[index]
        _persist()
        _refresh(win)
       }
      },
     }
    })(),
    // Cash Machine
    (function () {
     var y = r.next()
     return {
      type: "label",
      x: MARGIN,
      y: y,
      width: 160,
      height: 12,
      text: "Cash Machine:",
     }
    })(),
    (function () {
     var y = r.peek() - STEP
     return {
      type: "dropdown",
      x: 170,
      y: y,
      width: 160,
      height: H_DD,
      name: "dd_cashMode",
      items: ESS_MODE_LABELS,
      selectedIndex: 1,
      onChange: function (index) {
       if (index >= 0 && index < ESS_MODE_VALUES.length) {
        RR.state.options.essentialCashMachineMode = ESS_MODE_VALUES[index]
        _persist()
        _refresh(win)
       }
      },
     }
    })(),
    // First Aid Room
    (function () {
     var y = r.next()
     return {
      type: "label",
      x: MARGIN,
      y: y,
      width: 160,
      height: 12,
      text: "First Aid Room:",
     }
    })(),
    (function () {
     var y = r.peek() - STEP
     return {
      type: "dropdown",
      x: 170,
      y: y,
      width: 160,
      height: H_DD,
      name: "dd_firstAidMode",
      items: ESS_MODE_LABELS,
      selectedIndex: 1,
      onChange: function (index) {
       if (index >= 0 && index < ESS_MODE_VALUES.length) {
        RR.state.options.essentialFirstAidMode = ESS_MODE_VALUES[index]
        _persist()
        _refresh(win)
       }
      },
     }
    })(),
    {
     type: "button",
     x: MARGIN,
     y: r.next(),
     width: W_BTN,
     height: H_BTN,
     name: "btn_randomize",
     text: "Randomize Research",
     onClick: function () {
      RR.randomize.randomize()
     },
    },
   ]
   optionsHeight = Math.max(220, r.height())
   return { image: "floppy_disk", widgets: widgets }
  }

  function buildDevTab() {
   var r = makeRow()
   var widgets = [
    { type: "label", x: 8, y: r.next(), width: WIN_W - 2 * MARGIN, height: 12, text: "Dev" },
    (function () {
     var y = r.next()
     return { type: "label", x: MARGIN, y: y, width: 100, height: 12, text: "Seed:" }
    })(),
    (function () {
     var y = r.peek() - STEP
     return {
      type: "textbox",
      x: 120,
      y: y,
      width: 120,
      height: H_TEXT,
      name: "txt_seed",
      text: String(RR.state.options.seed),
      maxLength: 10,
      onChange: function (t) {
       var n = parseInt(t, 10)
       if (!isNaN(n)) {
        RR.state.options.seed = n
        _persist()
       }
      },
     }
    })(),
    {
     type: "checkbox",
     x: MARGIN,
     y: r.next(),
     width: WIN_W - 2 * MARGIN,
     height: H_CHECK,
     name: "chk_autoSeed",
     text: "Automatically randomize seed",
     isChecked: RR.state.options.automaticallyRandomizeSeed,
     onChange: function (v) {
      RR.state.options.automaticallyRandomizeSeed = v
      _persist()
     },
    },
    {
     type: "checkbox",
     x: MARGIN,
     y: r.next(),
     width: WIN_W - 2 * MARGIN,
     height: H_CHECK,
     name: "chk_disableWarning",
     text: "Disable randomization warning",
     isChecked: RR.state.options.disableWarning,
     onChange: function (v) {
      RR.state.options.disableWarning = v
      _persist()
     },
    },
    {
     type: "checkbox",
     x: MARGIN,
     y: r.next(),
     width: WIN_W - 2 * MARGIN,
     height: H_CHECK,
     name: "chk_verbose",
     text: "Verbose logging",
     isChecked: RR.state.options.verboseLogging,
     onChange: function (v) {
      RR.state.options.verboseLogging = v
      _persist()
     },
    },
    {
     type: "button",
     x: MARGIN,
     y: r.next(),
     width: W_BTN,
     height: H_BTN,
     name: "btn_flush",
     text: "Flush plugin memory",
     onClick: function () {
      RR.store.flushAll()
      RR.state.options = JSON.parse(JSON.stringify(RR.config.DEFAULTS))
      try {
       if (win && win.close) {
        win.close()
       }
      } catch (_) {}
      _openWindow(1)
      RR.log.toast("Persistent memory cleared; options and park baseline reset.")
     },
    },
   ]
   devHeight = Math.max(220, r.height())
   return { image: "research", widgets: widgets }
  }

  var optTab = buildOptionsTab()
  var devTab = buildDevTab()
  var tabs = [optTab, { image: devTab.image, widgets: devTab.widgets }]

  win = ui.openWindow({
   classification: RR.config.CLASS,
   width: WIN_W,
   height: initialTabIndex === 1 ? devHeight : optionsHeight,
   title: RR.config.UI_NAME + " v" + RR.config.VERSION,
   colours: RR.config.COLOURS,
   tabs: tabs,
   onTabChange: function () {
    win.height = win.tabIndex === 1 ? devHeight : optionsHeight
    _refresh(win)
   },
   onUpdate: function () {
    /* no-op */
   },
  })
  if (initialTabIndex) {
   win.tabIndex = initialTabIndex
   win.height = devHeight
  }
  RR.state.ui = { window: win }
  _refresh(win)
  win.bringToFront()
 }

 function open(initialTabIndex) {
  if (typeof ui === "undefined") {
   RR.log.warn("UI unavailable (headless).")
   return
  }
  _openWindow(initialTabIndex)
 }

 return { open: open }
})()
/* ============= End of RR.ui.mainWindow ============= */

/** ==================================================
 * Module: RR.menu.entry
 * Purpose: Map menu + shortcut for opening the main window.
 * Exports: RR.menu.init
 * Imports: RR.uiMain, RR.config, RR.log
 * Version: 3.0.0-alpha.0   Since: 2025-11-13
 * =================================================== */
var RR = RR || {}
RR.menu = {
 init: function () {
  if (typeof ui !== "undefined" && ui && ui.registerMenuItem) {
   ui.registerMenuItem(RR.config.UI_NAME, function () {
    RR.uiMain.open()
   })
   if (ui.registerShortcut) {
    ui.registerShortcut({
     id: "rrv3.main.open",
     text: "Open " + RR.config.UI_NAME,
     bindings: ["CTRL+SHIFT+R"],
     callback: function () {
      RR.uiMain.open()
     },
    })
   }
   RR.log.info("Menu + shortcut registered.")
  } else {
   RR.log.warn("UI unavailable; menu not registered.")
  }
 },
}
/* ============= End of RR.menu.entry ============= */

/** ==================================================
 * Module: RR.kernel.boot
 * Purpose: Entry point wiring for plugin registration and startup.
 * Exports: RR.kernel.boot
 * Imports: RR.menu, RR.store, RR.log
 * Version: 3.0.0-alpha.0   Since: 2025-11-13
 * =================================================== */
var RR = RR || {}
RR.kernel = {
 boot: function () {
  RR.log.info("Booting RR V3 (deferred-pulse + ratio/even).")
  RR.store.loadOptions()
  RR.menu.init()
 },
}
/* ============= End of RR.kernel.boot ============= */

/** ==================================================
 * Module: RR.meta.register
 * Purpose: Register plugin metadata for OpenRCT2 (remote plugin).
 * Exports: (none)
 * Imports: RR.kernel, RR.config
 * Version: 3.0.0-alpha.0   Since: 2025-11-13
 * =================================================== */
registerPlugin({
 name: RR.config.INTERNAL_NAME,
 version: RR.config.VERSION,
 authors: ["PlateGlassArmour"],
 type: "remote",
 licence: "MIT",
 minApiVersion: 66,
 targetApiVersion: typeof context !== "undefined" && context && context.apiVersion ? context.apiVersion : 66,
 main: function () {
  RR.kernel.boot()
 },
})
/* ============= End of RR.meta.register ============= */
