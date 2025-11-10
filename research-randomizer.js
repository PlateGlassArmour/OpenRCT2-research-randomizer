/* ==========================================================================
   MODULE: RR.constants  |  Category lists, fixed/default IDs, special IDs, tiny helpers
   PURPOSE: Central place for shared constants and very small helpers used across modules.
   ========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

var RR_CATEGORIES = [
 "transport",
 "gentle",
 "rollercoaster",
 "thrill",
 "water",
 "shop",
 "scenery", // scenery groups only; individual items aren’t researchable
]

var RR_DEFAULT_FIXED_IDS = [
 "rct2.scenery_group.scgwalls",
 "rct2.scenery_group.scgpathx",
 "rct2.scenery_group.scgshrub",
 "rct2.scenery_group.scggardn",
 "rct2.scenery_group.scgfence",
 "rct2.scenery_group.scgtrees",
 "rct1.ride.toilets",
]

var RR_DEFAULT_FIXED_LOOKUP = (function () {
 var m = {}
 var i
 for (i = 0; i < RR_DEFAULT_FIXED_IDS.length; i++) {
  m[RR_DEFAULT_FIXED_IDS[i]] = true
 }
 return m
})()

var RR_SPECIAL_IDS = {
 CASH_MACHINE: "rct2.ride.atm1",
 INFO_KIOSK: "rct2.ride.infok",
}

var RR_SPECIAL_LOOKUP = (function () {
 var m = {}
 m[RR_SPECIAL_IDS.CASH_MACHINE] = true
 m[RR_SPECIAL_IDS.INFO_KIOSK] = true
 return m
})()

/* --- Source whitelist (ObjectSourceGame tokens from the API) --- */
var RR_ALLOWED_SOURCE_GAMES = ["rct1", "added_attractions", "loopy_landscapes", "rct2", "wacky_worlds", "time_twister", "openrct2_official"]

/* tiny helpers */
function rr_isKnownCategory(name) {
 var i
 for (i = 0; i < RR_CATEGORIES.length; i++) {
  if (RR_CATEGORIES[i] === name) {
   return true
  }
 }
 return false
}
function rr_isDefaultFixedId(identifier) {
 return !!RR_DEFAULT_FIXED_LOOKUP[identifier]
}
function rr_isSpecialId(identifier) {
 return !!RR_SPECIAL_LOOKUP[identifier]
}
function rr_whichSpecial(identifier) {
 if (identifier === RR_SPECIAL_IDS.CASH_MACHINE) {
  return "CASH_MACHINE"
 }
 if (identifier === RR_SPECIAL_IDS.INFO_KIOSK) {
  return "INFO_KIOSK"
 }
 return null
}

/* Robustly extract source game tokens from various shapes */
function rr__extractSourceTokens(any) {
 try {
  // Preferred: array of tokens
  if (any && any.sourceGames && typeof any.sourceGames.length === "number") {
   return any.sourceGames.slice(0)
  }
 } catch (e1) {}
 try {
  // Nested under installedObject
  if (any && any.installedObject && any.installedObject.sourceGames && typeof any.installedObject.sourceGames.length === "number") {
   return any.installedObject.sourceGames.slice(0)
  }
 } catch (e2) {}
 try {
  // Singular token
  if (any && typeof any.sourceGame === "string") {
   return [any.sourceGame]
  }
 } catch (e3) {}
 try {
  // Singular token nested
  if (any && any.installedObject && typeof any.installedObject.sourceGame === "string") {
   return [any.installedObject.sourceGame]
  }
 } catch (e4) {}
 return []
}

/* Returns true iff EVERY listed source is whitelisted (and at least one exists). */
function rr_isWhitelistedSource(installedObject) {
 try {
  var sg = rr__extractSourceTokens(installedObject)
  if (!sg || !sg.length) return false
  var i
  for (i = 0; i < sg.length; i++) {
   var token = String(sg[i])
   var ok = false
   var j
   for (j = 0; j < RR_ALLOWED_SOURCE_GAMES.length; j++) {
    if (RR_ALLOWED_SOURCE_GAMES[j] === token) {
     ok = true
     break
    }
   }
   if (!ok) return false
  }
  return true
 } catch (e) {
  return false
 }
}

function rr_hasCustomSource(installedObject) {
 return !rr_isWhitelistedSource(installedObject)
}

function rr_getCategoryListCopy() {
 var copy = []
 var i
 for (i = 0; i < RR_CATEGORIES.length; i++) {
  copy.push(RR_CATEGORIES[i])
 }
 return copy
}

/* expose as RR.constants */
RR.constants = {
 CATEGORIES: RR_CATEGORIES,
 DEFAULT_FIXED_IDS: RR_DEFAULT_FIXED_IDS,
 SPECIAL_IDS: RR_SPECIAL_IDS,
 ALLOWED_SOURCE_GAMES: RR_ALLOWED_SOURCE_GAMES,

 isKnownCategory: rr_isKnownCategory,
 isDefaultFixedId: rr_isDefaultFixedId,
 isSpecialId: rr_isSpecialId,
 whichSpecial: rr_whichSpecial,

 /* Source helpers (whitelist semantics) */
 isWhitelistedSource: rr_isWhitelistedSource,
 hasCustomSource: rr_hasCustomSource,

 getCategoryListCopy: rr_getCategoryListCopy,
}
/* =========================== END MODULE: RR.constants =========================== */

/* ==========================================================================
   MODULE: RR.state  |  Persistent storage (prefs, catalog, baseline, meta, bad ride types)
   PURPOSE: Wraps context.sharedStorage with stable keys + a light migration shim.
   ========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

/* Storage namespace*/
var RR_STATE_NS = "PlateGlassArmour.ResearchRandomizer"

/* --- small helpers --- */
function rr_stateKey(suffix) {
 return RR_STATE_NS + suffix
}
function rr_ssGet(key, fallback) {
 try {
  var v = context && context.sharedStorage && context.sharedStorage.get ? context.sharedStorage.get(key) : undefined
  return typeof v === "undefined" ? fallback : v
 } catch (e) {
  return fallback
 }
}
function rr_ssSet(key, value) {
 try {
  if (context && context.sharedStorage && context.sharedStorage.set) {
   context.sharedStorage.set(key, value)
  }
 } catch (e) {}
}

/* --- multipliers used by UI (mirror RR.ui) --- */
var RR_STATE_MULTS = [1.0, 1.5, 2.0, 3.0]
function rr_idxForMult(m) {
 var i
 for (i = 0; i < RR_STATE_MULTS.length; i++) {
  if (RR_STATE_MULTS[i] === m) return i
 }
 return 0
}
function rr_multForIdx(i) {
 if (typeof i !== "number" || i < 0 || i >= RR_STATE_MULTS.length) return 1.0
 return RR_STATE_MULTS[i]
}

/* --- prefs: read legacy (.prefs) and write both (.prefs2 + legacy) --- */
function rr_readPrefs() {
 var p2 = rr_ssGet(rr_stateKey(".prefs2"), null)
 if (p2 && typeof p2 === "object" && typeof p2.multiplier === "number") {
  return {
   multiplier: p2.multiplier,
   guaranteeATM: !!p2.guaranteeATM,
   guaranteeInfo: !!p2.guaranteeInfo,
   excludeCustom: !!p2.excludeCustom,
  }
 }

 // Legacy shape from original file: { schema:1, multIdx:number, cash:boolean, info:boolean }
 var legacy = rr_ssGet(rr_stateKey(".prefs"), null)
 var multIdx = legacy && typeof legacy.multIdx === "number" ? legacy.multIdx : 0
 return {
  multiplier: rr_multForIdx(multIdx),
  guaranteeATM: !!(legacy && legacy.cash),
  guaranteeInfo: !!(legacy && legacy.info),
  excludeCustom: false, // new flag defaults to false
 }
}
function rr_writePrefs(prefs) {
 var mult = typeof prefs.multiplier === "number" ? prefs.multiplier : 1.0
 var out2 = {
  version: 2,
  multiplier: mult,
  guaranteeATM: !!prefs.guaranteeATM,
  guaranteeInfo: !!prefs.guaranteeInfo,
  excludeCustom: !!prefs.excludeCustom,
 }
 rr_ssSet(rr_stateKey(".prefs2"), out2)

 // Also store legacy shape so older code / debug still sees consistent state
 var legacy = {
  schema: 1,
  multIdx: rr_idxForMult(mult),
  cash: !!out2.guaranteeATM,
  info: !!out2.guaranteeInfo,
 }
 rr_ssSet(rr_stateKey(".prefs"), legacy)
}

/* --- catalog + meta (timestamps, counters, etc.) --- */
function rr_getCatalog() {
 return rr_ssGet(rr_stateKey(".catalogV2"), {})
}
function rr_saveCatalog(cat) {
 rr_ssSet(rr_stateKey(".catalogV2"), cat || {})
 var meta = rr_getMeta()
 meta.lastScanUtc = Date.now()
 rr_setMeta(meta)
}
function rr_getMeta() {
 return rr_ssGet(rr_stateKey(".meta"), {})
}
function rr_setMeta(m) {
 rr_ssSet(rr_stateKey(".meta"), m || {})
}
/* For UI status line: { createdAt: meta.lastScanUtc || null } */
function rr_getCatalogMeta() {
 var m = rr_getMeta()
 return { createdAt: m && m.lastScanUtc ? m.lastScanUtc : null }
}

/* --- level scoping (same as original’s levelKey) --- */
function rr_levelKey() {
 var name = ""
 try {
  name = park && park.name ? park.name : ""
 } catch (e) {}
 var sx = 0,
  sy = 0
 try {
  sx = map && map.size && map.size.x ? map.size.x : 0
  sy = map && map.size && map.size.y ? map.size.y : 0
 } catch (e2) {}
 return name + "|" + sx + "x" + sy
}

/* --- baseline (per level) --- */
function rr_getBaseline() {
 var base = rr_ssGet(rr_stateKey(".baseline." + rr_levelKey()), null)
 // UI expects .createdAt; legacy stored .capturedUtc
 if (base && typeof base.createdAt === "undefined" && typeof base.capturedUtc === "number") {
  base.createdAt = base.capturedUtc
 }
 return base
}
function rr_saveBaseline(baseline) {
 rr_ssSet(rr_stateKey(".baseline." + rr_levelKey()), baseline || null)
}

/* --- bad ride types --- */
function rr_getBadRideTypes() {
 return rr_ssGet(rr_stateKey(".badRideTypes"), {})
}
function rr_saveBadRideTypes(map) {
 rr_ssSet(rr_stateKey(".badRideTypes"), map || {})
}

/* --- maintenance helpers --- */
function rr_clearAll() {
 rr_ssSet(rr_stateKey(".catalogV2"), {})
 rr_ssSet(rr_stateKey(".meta"), {})
 rr_ssSet(rr_stateKey(".badRideTypes"), {})
 rr_ssSet(rr_stateKey(".baseline." + rr_levelKey()), null)
}

/* --- public API --- */
RR.state = {
 init: function () {
  // ensure prefs exist and are normalized
  rr_writePrefs(rr_readPrefs())
 },

 // prefs
 getPrefs: rr_readPrefs,
 savePrefs: rr_writePrefs,

 // catalog + meta
 getCatalog: rr_getCatalog,
 saveCatalog: rr_saveCatalog,
 getCatalogMeta: rr_getCatalogMeta,
 _getMeta: rr_getMeta, // (optional) for internal modules
 _setMeta: rr_setMeta, // (optional) for internal modules

 // baseline (per level)
 getBaseline: rr_getBaseline,
 saveBaseline: rr_saveBaseline,
 levelKey: rr_levelKey,

 // bad ride types
 getBadRideTypes: rr_getBadRideTypes,
 saveBadRideTypes: rr_saveBadRideTypes,

 // admin
 clearAll: rr_clearAll,
}
/* ============================== END MODULE: RR.state ============================== */

/* ==========================================================================
MODULE: RR.gameBridge  |  Reads/writes park research and objects
PURPOSE: Snapshot/apply research, resolve identifiers, load/unload objects,
detect rides in use, and keep research lists consistent/sane.
========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

/* Constants & tiny helpers (local to this module) */
var RRGB_API_SCENERY_GROUP = "scenery_group"
var RRGB_FALLBACK_CATEGORIES = ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

function rrgb_getCategories() {
 return RR.constants && RR.constants.CATEGORIES ? RR.constants.CATEGORIES : RRGB_FALLBACK_CATEGORIES
}
function rrgb_isKnownCategory(name) {
 if (RR.constants && RR.constants.isKnownCategory) {
  return RR.constants.isKnownCategory(name)
 }
 var cats = rrgb_getCategories()
 var i
 for (i = 0; i < cats.length; i++) {
  if (cats[i] === name) return true
 }
 return false
}
function rrgb_apiTypeFor(kind) {
 return kind === "scenery" ? RRGB_API_SCENERY_GROUP : kind
}
function rrgb_isValidRideType(rideType) {
 return typeof rideType === "number" && isFinite(rideType) && rideType >= 0 && rideType !== 255
}
function rrgb_stableKey(type, identifier, rideType) {
 if (type === "ride") {
  return rrgb_isValidRideType(rideType) ? "ride|" + identifier + "|" + String(rideType) : "ride|" + identifier + "|bad"
 }
 return "scenery|" + identifier
}

/* ---------- Object resolution, load/unload ---------- */

function rrgb_tryGetIdentifier(type, index) {
 var apiType = rrgb_apiTypeFor(type)
 try {
  var o = context.getObject(apiType, index)
  if (o && o.identifier) return o.identifier
 } catch (e) {}
 return null
}

function rrgb_resolveLoadedObject(type, identifier) {
 var apiType = rrgb_apiTypeFor(type)
 try {
  var all = context.getAllObjects(apiType)
  var i
  for (i = 0; i < all.length; i++) {
   var obj = all[i]
   if (obj && obj.identifier === identifier) {
    if (type === "ride") {
     var rtSet = obj.rideType && typeof obj.rideType.length === "number" ? obj.rideType : null
     return { type: "ride", object: obj.index, rideType: obj.rideType, rideTypeSet: rtSet, name: obj.name }
    }
    return { type: "scenery", object: obj.index, name: obj.name }
   }
  }
 } catch (e) {}
 return null
}

function rrgb_ensureLoaded(type, identifier) {
 if (rrgb_resolveLoadedObject(type, identifier)) return true
 try {
  objectManager.load(identifier)
 } catch (e) {}
 return !!rrgb_resolveLoadedObject(type, identifier)
}

/* ---------------- Added: enumerate installed/available objects ---------------- */

function rrgb__extractSourceGames(obj) {
 try {
  if (obj && obj.installedObject && obj.installedObject.sourceGames && obj.installedObject.sourceGames.join) {
   return obj.installedObject.sourceGames.slice(0)
  }
 } catch (e1) {}
 try {
  if (obj && obj.sourceGames && obj.sourceGames.join) {
   return obj.sourceGames.slice(0)
  }
 } catch (e2) {}
 try {
  if (obj && typeof obj.sourceGame === "string") {
   return [obj.sourceGame]
  }
 } catch (e3) {}
 return []
}

/* Enumerate ALL installed objects first (preferred), then fall back to loaded lists. */
function rrgb_getInstalledObjects() {
 var out = []

 /* Primary: objectManager.installedObjects (InstalledObject[]) */
 try {
  if (typeof objectManager !== "undefined" && objectManager && objectManager.installedObjects) {
   var list = objectManager.installedObjects || []
   var i
   for (i = 0; i < list.length; i++) {
    var io = list[i]
    if (!io || !io.identifier) continue
    if (io.type !== "ride" && io.type !== RRGB_API_SCENERY_GROUP) continue
    out.push({
     type: io.type, // "ride" | "scenery_group"
     identifier: io.identifier,
     name: io.name || "",
     sourceGames: io.sourceGames && io.sourceGames.slice ? io.sourceGames.slice(0) : [],
    })
   }
   return out
  }
 } catch (_primaryErr) {
  /* fallback below */
 }

 /* Fallback: enumerate currently LOADED objects */
 function pushFrom(list, logicalType) {
  var i
  for (i = 0; i < list.length; i++) {
   var o = list[i]
   if (!o || !o.identifier) continue
   out.push({
    type: logicalType,
    identifier: o.identifier,
    name: o.name || "",
    sourceGames: rrgb__extractSourceGames(o),
   })
  }
 }
 try {
  pushFrom(context.getAllObjects("ride") || [], "ride")
 } catch (_e1) {}
 try {
  pushFrom(context.getAllObjects(RRGB_API_SCENERY_GROUP) || [], "scenery_group")
 } catch (_e2) {}

 return out
}

/* ---------- Ride type helpers ---------- */

function rrgb_getRideTypeArray(resolvedRideObj) {
 if (!resolvedRideObj) return []
 var raw = []
 if (resolvedRideObj.rideTypeSet && typeof resolvedRideObj.rideTypeSet.length === "number") {
  var i
  for (i = 0; i < resolvedRideObj.rideTypeSet.length; i++) raw.push(resolvedRideObj.rideTypeSet[i])
 } else if (resolvedRideObj.rideType && typeof resolvedRideObj.rideType.length === "number") {
  var j
  for (j = 0; j < resolvedRideObj.rideType.length; j++) raw.push(resolvedRideObj.rideType[j])
 } else if (typeof resolvedRideObj.rideType === "number") {
  raw.push(resolvedRideObj.rideType)
 }
 var out = []
 var seen = {}
 var k
 for (k = 0; k < raw.length; k++) {
  var rt = raw[k]
  if (!rrgb_isValidRideType(rt)) continue
  var key = String(rt)
  if (!seen[key]) {
   seen[key] = true
   out.push(rt)
  }
 }
 return out
}

function rrgb_deriveRideType(identifier, preferred) {
 if (!rrgb_ensureLoaded("ride", identifier)) return null
 var obj = rrgb_resolveLoadedObject("ride", identifier)
 if (!obj) return null
 var options = rrgb_getRideTypeArray(obj)
 if (!options.length) return null
 if (rrgb_isValidRideType(preferred)) {
  var i
  for (i = 0; i < options.length; i++) if (options[i] === preferred) return preferred
 }
 return options[0]
}

/* ---------------- Research: snapshot, sanitize, materialize, apply ---------------- */

function rrgb__isSaneRefShape(ref) {
 if (!ref) return false
 if (ref.type !== "ride" && ref.type !== "scenery") return false
 if (typeof ref.object !== "number" || !isFinite(ref.object)) return false
 if (ref.type === "ride" && !rrgb_isValidRideType(ref.rideType)) return false
 if (!rrgb_isKnownCategory(ref.type === "scenery" ? "scenery" : ref.category)) return false
 return true
}

function rrgb_snapshotResearch() {
 var research = park.research
 var out = { invented: [], uninvented: [] }

 function push(list, dest) {
  var i
  for (i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it || (it.type !== "ride" && it.type !== "scenery")) continue
   var id = rrgb_tryGetIdentifier(it.type, it.object)
   if (!id) continue
   var rec = { type: it.type, identifier: id, category: it.type === "scenery" ? "scenery" : it.category }
   if (it.type === "ride" && rrgb_isValidRideType(it.rideType)) rec.rideType = it.rideType
   dest.push(rec)
  }
 }

 push(research.inventedItems, out.invented)
 push(research.uninventedItems, out.uninvented)
 return out
}

function rrgb_scrubResearchArrays() {
 try {
  var inv = park.research.inventedItems || []
  var uninv = park.research.uninventedItems || []
  function alive(ref) {
   return ref && rrgb_tryGetIdentifier(ref.type, ref.object) !== null
  }
  var i,
   a = [],
   b = []
  for (i = 0; i < inv.length; i++) if (alive(inv[i])) a.push(inv[i])
  for (i = 0; i < uninv.length; i++) if (alive(uninv[i])) b.push(uninv[i])
  park.research.inventedItems = a
  park.research.uninventedItems = b
 } catch (e) {}
}

function rrgb_sanitizeAndNormalizeResearchLists() {
 try {
  var inv = park.research.inventedItems || []
  var uninv = park.research.uninventedItems || []

  function normalizeRef(raw) {
   if (!raw || (raw.type !== "ride" && raw.type !== "scenery")) return null
   var id = rrgb_tryGetIdentifier(raw.type, raw.object)
   if (!id) return null
   if (raw.type === "ride") {
    var rt = raw.rideType
    if (!rrgb_isValidRideType(rt)) {
     rt = rrgb_deriveRideType(id, rt)
     if (!rrgb_isValidRideType(rt)) return null
    }
    var cat = rrgb_isKnownCategory(raw.category) ? raw.category : null
    return { type: "ride", object: raw.object, rideType: rt, category: cat, __id: id }
   } else {
    return { type: "scenery", object: raw.object, category: "scenery", __id: id }
   }
  }

  var normInv = [],
   normUn = [],
   i
  for (i = 0; i < inv.length; i++) {
   var a = normalizeRef(inv[i])
   if (a) normInv.push(a)
  }
  for (i = 0; i < uninv.length; i++) {
   var b = normalizeRef(uninv[i])
   if (b) normUn.push(b)
  }

  var seen = {},
   outInv = [],
   outUn = []

  function pushUnique(list, into) {
   var j
   for (j = 0; j < list.length; j++) {
    var it = list[j]
    if (it.type === "ride" && !rrgb_isKnownCategory(it.category)) continue
    var key = it.type === "ride" ? rrgb_stableKey("ride", it.__id, it.rideType) : rrgb_stableKey("scenery", it.__id, null)
    if (!seen[key]) {
     seen[key] = true
     var ref = it.type === "ride" ? { type: "ride", object: it.object, rideType: it.rideType, category: it.category } : { type: "scenery", object: it.object, category: "scenery" }
     if (rrgb__isSaneRefShape(ref)) into.push(ref)
    }
   }
  }

  // Build invented first (wins duplicates)
  pushUnique(normInv, outInv)

  // Then uninvented without duplicating invented
  var invSet = {},
   idA,
   kA
  for (i = 0; i < outInv.length; i++) {
   idA = rrgb_tryGetIdentifier(outInv[i].type, outInv[i].object)
   kA = outInv[i].type === "ride" ? rrgb_stableKey("ride", idA, outInv[i].rideType) : rrgb_stableKey("scenery", idA, null)
   invSet[kA] = true
  }
  for (i = 0; i < normUn.length; i++) {
   var u = normUn[i],
    idU = u.__id
   var kU = u.type === "ride" ? rrgb_stableKey("ride", idU, u.rideType) : rrgb_stableKey("scenery", idU, null)
   if (!invSet[kU] && !seen[kU]) {
    seen[kU] = true
    var ref2 = u.type === "ride" ? { type: "ride", object: u.object, rideType: u.rideType, category: u.category } : { type: "scenery", object: u.object, category: "scenery" }
    if (rrgb__isSaneRefShape(ref2)) outUn.push(ref2)
   }
  }

  park.research.inventedItems = outInv
  park.research.uninventedItems = outUn
 } catch (e) {}
}

/* Canonical <-> ResearchRef conversion */
function rrgb_materializeCanonToRefs(invCanon, uninvCanon) {
 var refMap = {}

 function indexExisting(list) {
  var i
  for (i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) continue
   var id = rrgb_tryGetIdentifier(it.type, it.object)
   if (!id) continue
   var key = it.type === "ride" ? rrgb_stableKey("ride", id, it.rideType) : rrgb_stableKey("scenery", id, null)
   if (!refMap[key]) refMap[key] = it
  }
 }

 indexExisting(park.research.inventedItems || [])
 indexExisting(park.research.uninventedItems || [])

 function buildRef(rec) {
  if (rec.type === "ride" && !rrgb_isValidRideType(rec.rideType)) {
   var fixedRt = rrgb_deriveRideType(rec.identifier, rec.rideType)
   if (!rrgb_isValidRideType(fixedRt)) return null
   rec = { type: "ride", identifier: rec.identifier, category: rec.category, rideType: fixedRt }
  }
  var key = rec.type === "ride" ? rrgb_stableKey("ride", rec.identifier, rec.rideType) : rrgb_stableKey("scenery", rec.identifier, null)

  var reuse = refMap[key]
  if (reuse) {
   var reused = { type: reuse.type, object: reuse.object, category: rec.type === "scenery" ? "scenery" : rec.category }
   if (rec.type === "ride") reused.rideType = rec.rideType
   if (rrgb__isSaneRefShape(reused)) return reused
  }

  if (!rrgb_ensureLoaded(rec.type, rec.identifier)) return null
  var obj = rrgb_resolveLoadedObject(rec.type, rec.identifier)
  if (!obj) return null

  if (rec.type === "ride" && !rrgb_isValidRideType(rec.rideType)) {
   var rt2 = rrgb_deriveRideType(rec.identifier, rec.rideType)
   if (!rrgb_isValidRideType(rt2)) return null
   rec.rideType = rt2
  }

  var out = { type: rec.type, object: obj.object, category: rec.type === "scenery" ? "scenery" : rec.category }
  if (rec.type === "ride") out.rideType = rec.rideType
  if (!rrgb__isSaneRefShape(out)) return null
  return out
 }

 var invOut = [],
  uninvOut = [],
  i,
  built
 for (i = 0; i < invCanon.length; i++) {
  built = buildRef(invCanon[i])
  if (built) invOut.push(built)
 }
 for (i = 0; i < uninvCanon.length; i++) {
  built = buildRef(uninvCanon[i])
  if (built) uninvOut.push(built)
 }
 return { inv: invOut, uninv: uninvOut }
}

function rrgb_applyRefPreserving(invCanon, uninvCanon) {
 var mats = rrgb_materializeCanonToRefs(invCanon, uninvCanon)
 park.research.inventedItems = mats.inv
 park.research.uninventedItems = mats.uninv
 rrgb_scrubResearchArrays()
 rrgb_sanitizeAndNormalizeResearchLists()
}

/* ---------------- Map/park inspection & unload helpers ---------------- */

function rrgb_detectRidesInUse() {
 var set = {}
 try {
  var rides = map && map.rides ? map.rides : []
  var i
  for (i = 0; i < rides.length; i++) {
   var ride = rides[i]
   var ro = ride && ride.object
   var identifier = ro && (ro.identifier || (ro.installedObject && ro.installedObject.identifier))
   if (identifier) set["ride|" + identifier] = true
  }
 } catch (e) {}
 return set
}

function rrgb_loadedIdentifierSets() {
 var out = { ride: {}, scenery: {} }
 try {
  var rides = context.getAllObjects("ride") || []
  var i
  for (i = 0; i < rides.length; i++) if (rides[i] && rides[i].identifier) out.ride[rides[i].identifier] = true
 } catch (e) {}
 try {
  var groups = context.getAllObjects(RRGB_API_SCENERY_GROUP) || []
  var j
  for (j = 0; j < groups.length; j++) if (groups[j] && groups[j].identifier) out.scenery[groups[j].identifier] = true
 } catch (e2) {}
 return out
}

function rrgb_purgeResearchRefsForIdentifierTyped(type, identifier, protectSet) {
 try {
  if (protectSet && protectSet[type + "|" + identifier]) return
  var inv = park.research.inventedItems || []
  var uninv = park.research.uninventedItems || []
  function keep(ref) {
   if (!ref) return false
   var id = rrgb_tryGetIdentifier(ref.type, ref.object)
   if (!id) return false
   if (ref.type === type && id === identifier) return false
   return true
  }
  var i,
   a = [],
   b = []
  for (i = 0; i < inv.length; i++) if (keep(inv[i])) a.push(inv[i])
  for (i = 0; i < uninv.length; i++) if (keep(uninv[i])) b.push(uninv[i])
  park.research.inventedItems = a
  park.research.uninventedItems = b
 } catch (e) {}
}

function rrgb_purgeResearchRefsForIdentifier(identifier, protectSet) {
 rrgb_purgeResearchRefsForIdentifierTyped("ride", identifier, protectSet || {})
}

/* Convenience for catalog/debug: list loaded ride (identifier, rideType) pairs with category lookup */
function rrgb_loadedRidePairs(catalog) {
 var out = []
 try {
  var rides = context.getAllObjects("ride") || []
  var i
  for (i = 0; i < rides.length; i++) {
   var r = rides[i]
   if (!r || !r.identifier) continue
   var types = rrgb_getRideTypeArray({ rideType: r.rideType, rideTypeSet: r.rideType })
   var k
   for (k = 0; k < types.length; k++) {
    var cat = (catalog[r.identifier + "|" + String(types[k])] || {}).category
    if (!cat) continue
    out.push({ identifier: r.identifier, rideType: types[k], category: cat, name: r.name || "" })
   }
  }
 } catch (e) {}
 return out
}

function rrgb_loadedSceneryGroups(catalog) {
 var out = []
 try {
  var groups = context.getAllObjects(RRGB_API_SCENERY_GROUP) || []
  var i
  for (i = 0; i < groups.length; i++) {
   var g = groups[i]
   if (!g || !g.identifier) continue
   var e = catalog[g.identifier]
   if (e && e.type === "scenery") out.push({ identifier: g.identifier, category: "scenery", name: g.name || "" })
  }
 } catch (e) {}
 return out
}

/* Unload anything newly-loaded that isn’t part of the original snapshot (and isn’t protected) */
function rrgb_unloadExtrasToRestore(preLoaded, originalSnap) {
 try {
  var keep = {}
  var i
  for (i = 0; i < originalSnap.invented.length; i++) keep[originalSnap.invented[i].type + "|" + originalSnap.invented[i].identifier] = true
  for (i = 0; i < originalSnap.uninvented.length; i++) keep[originalSnap.uninvented[i].type + "|" + originalSnap.uninvented[i].identifier] = true

  var inUse = rrgb_detectRidesInUse()
  var originalScenery = {}
  for (i = 0; i < originalSnap.invented.length; i++) if (originalSnap.invented[i].type === "scenery") originalScenery["scenery|" + originalSnap.invented[i].identifier] = true
  for (i = 0; i < originalSnap.uninvented.length; i++) if (originalSnap.uninvented[i].type === "scenery") originalScenery["scenery|" + originalSnap.uninvented[i].identifier] = true

  var protect = {}
  var k
  for (k in inUse) if (inUse.hasOwnProperty(k)) protect[k] = true
  for (k in originalScenery) if (originalScenery.hasOwnProperty(k)) protect[k] = true

  var now = rrgb_loadedIdentifierSets()

  var rid
  for (rid in now.ride)
   if (now.ride.hasOwnProperty(rid)) {
    if (!preLoaded.ride[rid] && !keep["ride|" + rid] && !protect["ride|" + rid]) {
     try {
      objectManager.unload(rid)
     } catch (e) {}
     rrgb_purgeResearchRefsForIdentifierTyped("ride", rid, protect)
    }
   }

  var sg
  for (sg in now.scenery)
   if (now.scenery.hasOwnProperty(sg)) {
    if (!preLoaded.scenery[sg] && !keep["scenery|" + sg] && !protect["scenery|" + sg]) {
     try {
      objectManager.unload(sg)
     } catch (e2) {}
     rrgb_purgeResearchRefsForIdentifierTyped("scenery", sg, protect)
    }
   }

  rrgb_scrubResearchArrays()
  rrgb_sanitizeAndNormalizeResearchLists()
 } catch (e3) {}
}

/* ---------------------------- Public game-bridge API ---------------------------- */

RR.gameBridge = {
 /* research snapshots & writes */
 snapshotResearch: rrgb_snapshotResearch,
 sanitizeAndNormalizeResearchLists: rrgb_sanitizeAndNormalizeResearchLists,
 scrubResearchArrays: rrgb_scrubResearchArrays,
 materializeCanonToRefs: rrgb_materializeCanonToRefs,
 applyRefPreserving: rrgb_applyRefPreserving,

 /* object resolution / load */
 tryGetIdentifier: rrgb_tryGetIdentifier,
 resolveLoadedObject: rrgb_resolveLoadedObject,
 ensureLoaded: rrgb_ensureLoaded,
 deriveRideType: rrgb_deriveRideType,

 /* enumeration and helpers */
 getInstalledObjects: rrgb_getInstalledObjects,
 getRideTypeArray: rrgb_getRideTypeArray,

 /* park inspection */
 detectRidesInUse: rrgb_detectRidesInUse,
 loadedIdentifierSets: rrgb_loadedIdentifierSets,
 loadedRidePairs: rrgb_loadedRidePairs,
 loadedSceneryGroups: rrgb_loadedSceneryGroups,

 /* unload helpers */
 purgeResearchRefsForIdentifierTyped: rrgb_purgeResearchRefsForIdentifierTyped,
 purgeResearchRefsForIdentifier: rrgb_purgeResearchRefsForIdentifier,
 unloadExtrasToRestore: rrgb_unloadExtrasToRestore,

 /* tiny exports shared with other modules */
 stableKeyFromParts: rrgb_stableKey,
 isValidRideType: rrgb_isValidRideType,

 /* Compatibility aliases (for older callers) */
 resolveLoaded: rrgb_resolveLoadedObject,
 applyCanon: rrgb_applyRefPreserving,
}
/* =========================== END MODULE: RR.gameBridge =========================== */

/* ==========================================================================
MODULE: RR.catalog  |  Smart Scan builder + ride-type category learner
PURPOSE: Build/refresh the master catalog (rides: identifier+rideType pairs,
scenery groups), learn rideType -> category, and persist via state.
========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

/* Local aliases & constants */
var RR_CATALOG_CONST = RR && RR.constants ? RR.constants : null
var RR_CATALOG_CATEGORIES = RR_CATALOG_CONST ? RR_CATALOG_CONST.CATEGORIES : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

/* In-memory mirrors (kept in sync with RR.state when present) */
var RR_CATALOG_MEMO = {}
var RR_CATALOG_BAD_RT = {}

/* ---------------------------- tiny helpers ---------------------------- */
function rr_catalogNowUtc() {
 try {
  return Date.now()
 } catch (e) {
  return new Date().getTime()
 }
}
function rr_catalogIsValidRideType(rt) {
 return typeof rt === "number" && isFinite(rt) && rt >= 0 && rt !== 255
}
function rr_catalogRideKey(identifier, rideType) {
 return identifier + "|" + String(rideType)
}
function rr_catalogHasCustomSource(installedObject) {
 try {
  return RR_CATALOG_CONST && RR_CATALOG_CONST.hasCustomSource ? RR_CATALOG_CONST.hasCustomSource(installedObject) : false
 } catch (e) {
  return false
 }
}
function rr_catalogNormName(s) {
 var raw = (s == null ? "" : String(s)).toLowerCase()
 raw = raw
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .replace(/^\s+|\s+$/g, "")
 return raw
}

/* When game-bridge doesn’t provide helpers yet, fall back locally */
function rr_catalogGetInstalledObjects() {
 try {
  if (RR.gameBridge && RR.gameBridge.getInstalledObjects) {
   var list = RR.gameBridge.getInstalledObjects()
   if (list && list.length >= 0) return list
  }
 } catch (e1) {}
 // Fallback: enumerate currently loaded objects
 var out = []
 try {
  var rides = context.getAllObjects("ride") || []
  for (var i = 0; i < rides.length; i++) {
   var r = rides[i]
   if (!r || !r.identifier) continue
   out.push({ type: "ride", identifier: r.identifier, name: r.name || "", sourceGames: r.sourceGames && r.sourceGames.slice ? r.sourceGames.slice(0) : [] })
  }
 } catch (e2) {}
 try {
  var groups = context.getAllObjects("scenery_group") || []
  for (var j = 0; j < groups.length; j++) {
   var g = groups[j]
   if (!g || !g.identifier) continue
   out.push({ type: "scenery_group", identifier: g.identifier, name: g.name || "", sourceGames: g.sourceGames && g.sourceGames.slice ? g.sourceGames.slice(0) : [] })
  }
 } catch (e3) {}
 return out
}
function rr_catalogGetRideTypeArray(resolvedRideObj) {
 try {
  if (RR.gameBridge && RR.gameBridge.getRideTypeArray) {
   return RR.gameBridge.getRideTypeArray(resolvedRideObj) || []
  }
 } catch (e) {}
 if (!resolvedRideObj) return []
 var raw = []
 if (resolvedRideObj.rideTypeSet && typeof resolvedRideObj.rideTypeSet.length === "number") {
  for (var i = 0; i < resolvedRideObj.rideTypeSet.length; i++) raw.push(resolvedRideObj.rideTypeSet[i])
 } else if (resolvedRideObj.rideType && typeof resolvedRideObj.rideType.length === "number") {
  for (var j = 0; j < resolvedRideObj.rideType.length; j++) raw.push(resolvedRideObj.rideType[j])
 } else if (typeof resolvedRideObj.rideType === "number") {
  raw.push(resolvedRideObj.rideType)
 }
 var out = [],
  seen = {}
 for (var k = 0; k < raw.length; k++) {
  var rt = raw[k]
  if (!rr_catalogIsValidRideType(rt)) continue
  var key = String(rt)
  if (!seen[key]) {
   seen[key] = true
   out.push(rt)
  }
 }
 return out
}

/* ----------------------- state access (safe) -------------------------- */
function rr_catalogGetCatalog() {
 try {
  if (RR.state && RR.state.getCatalog) {
   return RR.state.getCatalog() || {}
  }
 } catch (e) {}
 return RR_CATALOG_MEMO || {}
}
function rr_catalogSetCatalog(cat) {
 var c = cat || {}
 try {
  if (RR.state && RR.state.saveCatalog) {
   RR.state.saveCatalog(c)
  }
 } catch (e) {}
 RR_CATALOG_MEMO = c
}
function rr_catalogGetBadRideTypes() {
 try {
  if (RR.state && RR.state.getBadRideTypes) {
   return RR.state.getBadRideTypes() || {}
  }
 } catch (e) {}
 return RR_CATALOG_BAD_RT || {}
}
function rr_catalogSetBadRideTypes(map) {
 var m = map || {}
 try {
  if (RR.state && RR.state.saveBadRideTypes) {
   RR.state.saveBadRideTypes(m)
  }
 } catch (e) {}
 RR_CATALOG_BAD_RT = m
}
function rr_catalogTouchMetaAfterScan() {
 var meta = {}
 try {
  if (RR.state && RR.state._getMeta) {
   meta = RR.state._getMeta() || {}
  }
 } catch (e) {}
 meta.lastScanUtc = rr_catalogNowUtc()
 try {
  if (RR.state && RR.state._setMeta) {
   RR.state._setMeta(meta)
  }
 } catch (e2) {}
}

/* ------------------- scan-needed detection --------------------------- */
function rr_catalogHasAnyRideKey(cat, identifier) {
 for (var k in cat) {
  if (cat.hasOwnProperty(k) && k.indexOf(identifier + "|") === 0) return true
 }
 return false
}
function rr_catalogComputeScanNeeded() {
 try {
  var list = rr_catalogGetInstalledObjects()
  if (!list) {
   return { needed: true, reason: "bridge unavailable" }
  }
  var catalog = rr_catalogGetCatalog()
  var bad = rr_catalogGetBadRideTypes()

  for (var ck in catalog) {
   if (!catalog.hasOwnProperty(ck)) continue
   var e = catalog[ck]
   if (e && e.type === "ride" && !e.category) {
    if (!bad[String(e.rideType)]) {
     return { needed: true, reason: "uncategorized rides" }
    }
   }
  }
  for (var i = 0; i < list.length; i++) {
   var io = list[i]
   if (!io) continue
   if (io.type === "scenery_group") {
    if (!catalog[io.identifier]) {
     return { needed: true, reason: "new scenery groups" }
    }
   } else if (io.type === "ride") {
    if (!rr_catalogHasAnyRideKey(catalog, io.identifier)) {
     return { needed: true, reason: "new rides" }
    }
   }
  }
  return { needed: false, reason: "" }
 } catch (e) {
  return { needed: true, reason: "error: " + e.message }
 }
}

/* --------------------- loading for inspection ------------------------ */
function rr_catalogLoadAllIfNeeded() {
 // PERF: only rides need loading for rideType[]; scenery groups are skipped.
 var out = { touched: 0 }
 var list = rr_catalogGetInstalledObjects() || []
 for (var i = 0; i < list.length; i++) {
  var io = list[i]
  if (!io || io.type !== "ride") continue
  try {
   if (RR.gameBridge && RR.gameBridge.ensureLoaded && RR.gameBridge.ensureLoaded("ride", io.identifier)) {
    out.touched++
   }
  } catch (e) {
   /* ignore load failures during scan */
  }
 }
 return out
}

/* ----------------------- build catalog entries ----------------------- */
function rr_catalogScanAllToCatalog() {
 var cat = rr_catalogGetCatalog()
 var list = rr_catalogGetInstalledObjects() || []
 var added = 0

 for (var i = 0; i < list.length; i++) {
  var io = list[i]
  if (!io) continue

  if (io.type === "scenery_group") {
   var prevS = cat[io.identifier]
   if (!prevS || prevS.type !== "scenery") {
    cat[io.identifier] = {
     type: "scenery",
     identifier: io.identifier,
     category: "scenery",
     name: io && io.name ? io.name : "",
     isCustom: rr_catalogHasCustomSource(io),
    }
    added++
   } else {
    prevS.isCustom = rr_catalogHasCustomSource(io)
    if (!prevS.name && io && io.name) prevS.name = io.name
   }
   continue
  }

  if (io.type !== "ride") continue

  try {
   if (RR.gameBridge && RR.gameBridge.ensureLoaded) {
    RR.gameBridge.ensureLoaded("ride", io.identifier)
   }
  } catch (e1) {}

  var ro = null
  try {
   ro = RR.gameBridge && RR.gameBridge.resolveLoadedObject ? RR.gameBridge.resolveLoadedObject("ride", io.identifier) : null
  } catch (e2) {
   ro = null
  }
  if (!ro) continue

  var rtypes = []
  try {
   rtypes = rr_catalogGetRideTypeArray(ro) || []
  } catch (e3) {
   rtypes = []
  }
  if (!rtypes || !rtypes.length) continue

  var nameForSig = (ro && ro.name) || (io && io.name) || ""
  var sig = rr_catalogNormName(nameForSig)

  for (var r = 0; r < rtypes.length; r++) {
   var rt = rtypes[r]
   var key = rr_catalogRideKey(io.identifier, rt)
   var prev = cat[key]
   if (!prev || prev.type !== "ride" || prev.rideType !== rt) {
    cat[key] = {
     type: "ride",
     identifier: io.identifier,
     rideType: rt,
     name: ro && ro.name ? ro.name : "",
     category: prev && prev.category ? prev.category : null,
     isCustom: rr_catalogHasCustomSource(io),
     variantSig: sig, // NEW: pre-normalized name signature for pools
    }
    added++
   } else {
    prev.isCustom = rr_catalogHasCustomSource(io)
    if (!prev.name && ro && ro.name) prev.name = ro.name
    if (!prev.variantSig && ro && ro.name) prev.variantSig = rr_catalogNormName(ro.name)
   }
  }
 }

 rr_catalogSetCatalog(cat)
 return { added: added }
}

/* ------------------- learn categories from snapshot ------------------ */
function rr_catalogLearnRtFromSnapshot(rtMap, snapshot) {
 var map_ = rtMap || {}
 if (!snapshot) return map_

 function harvest(list) {
  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) continue
   if (it.type === "ride" && rr_catalogIsValidRideType(it.rideType) && typeof it.category === "string") {
    map_[String(it.rideType)] = it.category
   }
  }
 }
 try {
  harvest(snapshot.invented || [])
 } catch (e1) {}
 try {
  harvest(snapshot.uninvented || [])
 } catch (e2) {}

 return map_
}

/* -------------------- probe unknown ride types safely ----------------- */
function rr_catalogProbeUnknownRideTypes(rtMap, catalog, originalSnapshot) {
 var bad = rr_catalogGetBadRideTypes()
 var unknown = []
 for (var k in catalog) {
  if (!catalog.hasOwnProperty(k)) continue
  var e = catalog[k]
  if (e && e.type === "ride") {
   var rtk = String(e.rideType)
   if (!rtMap[rtk] && !bad[rtk]) {
    unknown.push({ identifier: e.identifier, rideType: e.rideType })
   }
  }
 }
 if (!unknown.length) return { derived: 0 }
 if (!RR.gameBridge || !RR.gameBridge.applyRefPreserving || !RR.gameBridge.snapshotResearch) {
  return { derived: 0 }
 }

 var probeInv = []
 for (var i = 0; i < unknown.length; i++) {
  var p = unknown[i]
  if (!rr_catalogIsValidRideType(p.rideType)) {
   bad[String(p.rideType)] = true
   continue
  }
  probeInv.push({ type: "ride", identifier: p.identifier, rideType: p.rideType, category: "gentle" })
 }
 if (!probeInv.length) {
  rr_catalogSetBadRideTypes(bad)
  return { derived: 0 }
 }

 try {
  RR.gameBridge.applyRefPreserving(probeInv, [])
  var back = RR.gameBridge.snapshotResearch()
  var derived = 0
  var seenGood = {}

  var inv = back && back.invented ? back.invented : []
  for (var j = 0; j < inv.length; j++) {
   var it = inv[j]
   if (it && it.type === "ride" && rr_catalogIsValidRideType(it.rideType) && typeof it.category === "string") {
    var rtk = String(it.rideType)
    rtMap[rtk] = it.category
    seenGood[rtk] = true
    derived++
   }
  }
  for (var u = 0; u < unknown.length; u++) {
   var rtk2 = String(unknown[u].rideType)
   if (!seenGood[rtk2]) bad[rtk2] = true
  }
  rr_catalogSetBadRideTypes(bad)
  if (originalSnapshot) {
   try {
    RR.gameBridge.applyRefPreserving(originalSnapshot.invented || [], originalSnapshot.uninvented || [])
   } catch (_e) {}
  }
  return { derived: derived }
 } catch (e) {
  try {
   if (originalSnapshot) {
    RR.gameBridge.applyRefPreserving(originalSnapshot.invented || [], originalSnapshot.uninvented || [])
   }
  } catch (_e2) {}
  return { derived: 0 }
 }
}

/* ------------------- write categories back to catalog ----------------- */
function rr_catalogWriteCategories(rtMap) {
 var cat = rr_catalogGetCatalog()
 var changed = 0
 var categorized = 0
 for (var k in cat) {
  if (!cat.hasOwnProperty(k)) continue
  var e = cat[k]
  if (!e) continue
  if (e.type === "scenery") {
   e.category = "scenery"
   categorized++
   continue
  }
  var mapped = rtMap[String(e.rideType)]
  if (mapped) {
   if (e.category !== mapped) {
    e.category = mapped
    changed++
   }
   categorized++
  }
 }
 rr_catalogSetCatalog(cat)
 return { changed: changed, categorized: categorized }
}

/* ------------------- summarize for UI/debugging ---------------------- */
function rr_catalogSummarize() {
 var cat = rr_catalogGetCatalog()
 var counts = { transport: 0, gentle: 0, rollercoaster: 0, thrill: 0, water: 0, shop: 0, scenery: 0 }
 for (var k in cat) {
  if (!cat.hasOwnProperty(k)) continue
  var e = cat[k]
  if (!e || !e.category) continue
  if (counts.hasOwnProperty(e.category)) {
   counts[e.category] += 1
  }
 }
 return counts
}

/* ----------------------------- public API ---------------------------- */
function rr_catalogRunSmartScan(opts) {
 if (!RR.gameBridge) {
  return { ok: false, reason: "bridge unavailable" }
 }

 var need = rr_catalogComputeScanNeeded()
 var catEmpty = (function () {
  var c = rr_catalogGetCatalog()
  for (var k in c) {
   if (c.hasOwnProperty(k)) return false
  }
  return true
 })()
 if (!need.needed && !catEmpty) {
  rr_catalogTouchMetaAfterScan()
  return { ok: true, reason: "already up-to-date", counts: rr_catalogSummarize() }
 }

 var originalSnap = opts && opts.snapshot ? opts.snapshot : RR.gameBridge.snapshotResearch ? RR.gameBridge.snapshotResearch() : null
 var preLoaded = RR.gameBridge.loadedIdentifierSets ? RR.gameBridge.loadedIdentifierSets() : { ride: {}, scenery: {} }

 rr_catalogLoadAllIfNeeded()
 rr_catalogScanAllToCatalog()

 var rtMap = rr_catalogLearnRtFromSnapshot({}, originalSnap || (RR.gameBridge.snapshotResearch ? RR.gameBridge.snapshotResearch() : null))
 rr_catalogProbeUnknownRideTypes(rtMap, rr_catalogGetCatalog(), originalSnap)
 rr_catalogWriteCategories(rtMap)

 try {
  if (RR.gameBridge.unloadExtrasToRestore && originalSnap) {
   RR.gameBridge.unloadExtrasToRestore(preLoaded, originalSnap)
  } else if (RR.gameBridge.applyRefPreserving && originalSnap) {
   RR.gameBridge.applyRefPreserving(originalSnap.invented || [], originalSnap.uninvented || [])
  }
 } catch (_e) {}

 rr_catalogTouchMetaAfterScan()
 return { ok: true, reason: "scanned", counts: rr_catalogSummarize() }
}

function rr_catalogEnsureReady(opts) {
 var status = rr_catalogComputeScanNeeded()
 if (status.needed) {
  return rr_catalogRunSmartScan(opts || {})
 }
 return { ok: true, reason: "ready", counts: rr_catalogSummarize() }
}

/* export */
RR.catalog = {
 runSmartScan: rr_catalogRunSmartScan,
 ensureReady: rr_catalogEnsureReady,
 get: function () {
  return rr_catalogGetCatalog()
 },
 summarize: rr_catalogSummarize,
 computeScanNeeded: rr_catalogComputeScanNeeded,
}
/* ========================== END MODULE: RR.catalog ========================== */

/* ==========================================================================
   MODULE: RR.baselineTargets  |  Captures per-level baseline + computes targets
   PURPOSE: Record immutable baseline counts (per category) and compute totals
            for any multiplier. Baseline & targets EXCLUDE default fixed items
            and the two special IDs (ATM/Info), so guarantees never displace.
   ========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

/* ---- local helpers & aliases ---- */

var RRBT_CONST = RR && RR.constants ? RR.constants : null
var RRBT_CATS = RRBT_CONST && RRBT_CONST.CATEGORIES ? RRBT_CONST.CATEGORIES : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

function rrbt_isKnownCategory(c) {
 return RRBT_CONST && RRBT_CONST.isKnownCategory
  ? RRBT_CONST.isKnownCategory(c)
  : (function () {
     for (var i = 0; i < RRBT_CATS.length; i++) if (RRBT_CATS[i] === c) return true
     return false
    })()
}
function rrbt_isDefaultFixed(identifier) {
 return RRBT_CONST && RRBT_CONST.isDefaultFixedId ? RRBT_CONST.isDefaultFixedId(identifier) : false
}
function rrbt_isSpecial(identifier) {
 return RRBT_CONST && RRBT_CONST.isSpecialId ? RRBT_CONST.isSpecialId(identifier) : false
}

function rrbt_zeroPerCategory() {
 var m = {}
 for (var i = 0; i < RRBT_CATS.length; i++) m[RRBT_CATS[i]] = 0
 return m
}

function rrbt_now() {
 try {
  return Date.now()
 } catch (e) {
  return new Date().getTime()
 }
}

/* Count current snapshot → baseline-ish tallies (excluding defaults/specials) */
function rrbt_countFromSnapshot(snapshot) {
 var invented = rrbt_zeroPerCategory()
 var selection = rrbt_zeroPerCategory()
 var defaultsPresent = rrbt_zeroPerCategory() // informational only

 function bump(map, cat) {
  if (!rrbt_isKnownCategory(cat)) return
  map[cat] = (map[cat] || 0) + 1
 }

 function consider(entry, isInvented) {
  if (!entry || typeof entry.identifier !== "string") return
  var id = entry.identifier
  var cat = entry.category || null
  if (!rrbt_isKnownCategory(cat)) return

  if (rrbt_isDefaultFixed(id)) {
   bump(defaultsPresent, cat)
   return // excluded from counts
  }
  if (rrbt_isSpecial(id)) {
   return // excluded from counts
  }

  // mutable selection counts
  bump(selection, cat)
  if (isInvented) bump(invented, cat)
 }

 var i
 var inv = snapshot && snapshot.invented ? snapshot.invented : []
 var uninv = snapshot && snapshot.uninvented ? snapshot.uninvented : []

 for (i = 0; i < inv.length; i++) consider(inv[i], true)
 for (i = 0; i < uninv.length; i++) consider(uninv[i], false)

 // totals
 var totals = { invented: 0, selection: 0 }
 for (i = 0; i < RRBT_CATS.length; i++) {
  var c = RRBT_CATS[i]
  totals.invented += invented[c]
  totals.selection += selection[c]
 }

 return {
  inventedByCat: invented, // mutable-only invented counts
  selectionByCat: selection, // mutable-only total (invented + uninvented)
  defaultsByCat: defaultsPresent, // info only (not used in targets)
  totals: totals,
 }
}

/* Build the immutable baseline object we persist per-level */
function rrbt_buildBaseline(snapshot) {
 var counts = rrbt_countFromSnapshot(snapshot || (RR.gameBridge && RR.gameBridge.snapshotResearch ? RR.gameBridge.snapshotResearch() : { invented: [], uninvented: [] }))
 return {
  version: 1,
  createdAt: rrbt_now(),
  byCategory: (function () {
   var m = {}
   for (var i = 0; i < RRBT_CATS.length; i++) {
    var c = RRBT_CATS[i]
    m[c] = {
     baselineSelection: counts.selectionByCat[c], // mutable-only
     baselineInvented: counts.inventedByCat[c], // mutable-only (fixed across runs)
     defaultsPresent: counts.defaultsByCat[c], // informational
    }
   }
   return m
  })(),
  totals: counts.totals, // mutable-only totals
 }
}

/* Round with standard Math.round; clamp to at least invented count */
function rrbt_scaledTarget(selBase, invBase, multiplier) {
 var scaled = Math.round(selBase * (typeof multiplier === "number" ? multiplier : 1.0))
 if (scaled < invBase) scaled = invBase
 return scaled
}

/* ----------------------------- public API ----------------------------- */

function rrbt_ensureBaseline(opts) {
 var snap = opts && opts.snapshot ? opts.snapshot : RR.gameBridge && RR.gameBridge.snapshotResearch ? RR.gameBridge.snapshotResearch() : null
 var have = RR.state && RR.state.getBaseline ? RR.state.getBaseline() : null

 if (have && have.byCategory && typeof have.createdAt === "number") {
  return have
 }

 var base = rrbt_buildBaseline(snap)
 if (RR.state && RR.state.saveBaseline) {
  RR.state.saveBaseline(base)
 }
 return base
}

function rrbt_computeTargets(opts) {
 var mult = opts && typeof opts.multiplier === "number" ? opts.multiplier : 1.0
 var base = RR.state && RR.state.getBaseline ? RR.state.getBaseline() : null
 if (!base || !base.byCategory) {
  // safety: build on the fly if missing
  base = rrbt_buildBaseline(opts && opts.snapshot ? opts.snapshot : RR.gameBridge && RR.gameBridge.snapshotResearch ? RR.gameBridge.snapshotResearch() : null)
  if (RR.state && RR.state.saveBaseline) RR.state.saveBaseline(base)
 }

 var per = {}
 var totals = { baselineSelection: 0, baselineInvented: 0, targetSelection: 0, targetUninvented: 0 }

 for (var i = 0; i < RRBT_CATS.length; i++) {
  var c = RRBT_CATS[i]
  var row = base.byCategory[c] || { baselineSelection: 0, baselineInvented: 0, defaultsPresent: 0 }
  var bSel = row.baselineSelection | 0
  var bInv = row.baselineInvented | 0
  var tSel = rrbt_scaledTarget(bSel, bInv, mult)
  var tUn = tSel - bInv
  if (tUn < 0) tUn = 0

  per[c] = {
   baselineSelection: bSel, // mutable-only
   baselineInvented: bInv, // mutable-only (must remain constant)
   targetSelection: tSel, // mutable-only → pools must fill to this
   targetUninvented: tUn, // = targetSelection - baselineInvented
   defaultsPresent: row.defaultsPresent | 0, // informational
  }

  totals.baselineSelection += bSel
  totals.baselineInvented += bInv
  totals.targetSelection += tSel
  totals.targetUninvented += tUn
 }

 return {
  multiplier: mult,
  perCategory: per,
  totals: totals,
  createdAt: base.createdAt,
 }
}

/* export */
RR.baselineTargets = {
 ensureBaseline: rrbt_ensureBaseline,
 computeTargets: rrbt_computeTargets,

 /* (optional helpers for testing/inspection) */
 _countFromSnapshot: rrbt_countFromSnapshot,
 _buildBaseline: rrbt_buildBaseline,
}
/* ========================= END MODULE: RR.baselineTargets ========================= */

/* ==========================================================================
MODULE: RR.poolsAndFilters  |  Build per-category candidate pools
PURPOSE: Start from current snapshot + catalog and produce category pools,
         excluding defaults, rides in use, exact Type+Vehicle duplicates
         (now using catalog.variantSig, no object loads), and optionally
         non-whitelisted sources.
========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

var RPF_CATS = RR && RR.constants && RR.constants.CATEGORIES ? RR.constants.CATEGORIES : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

function rpf_isDefaultFixed(id) {
 try {
  return RR.constants && RR.constants.isDefaultFixedId ? RR.constants.isDefaultFixedId(id) : false
 } catch (e) {
  return false
 }
}
function rpf_isKnownCategory(c) {
 for (var i = 0; i < RPF_CATS.length; i++) if (RPF_CATS[i] === c) return true
 return false
}
function rpf_stableKey(rec) {
 if (!rec || !rec.identifier) return "bad"
 if (rec.type === "ride") {
  var rt = rec.rideType
  return RR.gameBridge && RR.gameBridge.stableKeyFromParts ? RR.gameBridge.stableKeyFromParts("ride", rec.identifier, rt) : "ride|" + rec.identifier + "|" + String(rt)
 }
 return RR.gameBridge && RR.gameBridge.stableKeyFromParts ? RR.gameBridge.stableKeyFromParts("scenery", rec.identifier, null) : "scenery|" + rec.identifier
}
function rpf_normName(s) {
 var raw = (s == null ? "" : String(s)).toLowerCase()
 raw = raw
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .replace(/^\s+|\s+$/g, "")
 return raw
}

/* Catalog-level “is custom” */
function rpf_isCatalogCustom(rec, catalog) {
 if (!catalog || !rec || !rec.identifier) return false
 if (rec.type === "ride") {
  var ck = rec.identifier + "|" + String(rec.rideType)
  return catalog[ck] && catalog[ck].isCustom ? true : false
 }
 return catalog[rec.identifier] && catalog[rec.identifier].isCustom ? true : false
}

/* Conservative fallback if catalog row is missing */
function rpf_isIdentifierNonWhitelisted(type, identifier) {
 try {
  if (typeof objectManager !== "undefined" && objectManager && objectManager.getInstalledObject) {
   var inst = objectManager.getInstalledObject(identifier)
   if (inst && RR.constants && RR.constants.isWhitelistedSource) {
    return !RR.constants.isWhitelistedSource(inst)
   }
  }
 } catch (_e) {}
 try {
  if (RR.gameBridge && RR.gameBridge.ensureLoaded && RR.gameBridge.resolveLoadedObject) {
   var logical = type === "scenery" ? "scenery" : "ride"
   if (RR.gameBridge.ensureLoaded(logical, identifier)) {
    var apiType = logical === "scenery" ? "scenery_group" : "ride"
    var o = context.getObject(apiType, RR.gameBridge.resolveLoadedObject(logical, identifier).object)
    var instObj = o && o.installedObject
    if (instObj && RR.constants && RR.constants.isWhitelistedSource) {
     return !RR.constants.isWhitelistedSource(instObj)
    }
   }
  }
 } catch (_e2) {}
 return true
}

/* Policy for existing items */
function rpf_shouldIncludeExisting(rec, inUseSet) {
 if (!rec || !rec.identifier || !rec.type) return false
 if (rpf_isDefaultFixed(rec.identifier)) return false
 if (rec.type === "ride" && inUseSet && inUseSet["ride|" + rec.identifier]) return false
 if (!rpf_isKnownCategory(rec.category)) return false
 return true
}

/* Policy for new catalog items */
function rpf_shouldIncludeFromCatalog(e, inUseSet, excludeCustom) {
 if (!e || !e.category || !rpf_isKnownCategory(e.category)) return false
 if (rpf_isDefaultFixed(e.identifier)) return false
 if (e.type === "ride" && inUseSet && inUseSet["ride|" + e.identifier]) return false
 if (excludeCustom && e.isCustom) return false
 return true
}

function rpf_build(opts) {
 var snapshot = (opts && opts.snapshot) || { invented: [], uninvented: [] }
 var inUseSet = (opts && opts.inUse) || {}
 var excludeCustom = !!(opts && opts.excludeCustom)
 var catalog = RR.catalog && RR.catalog.get ? RR.catalog.get() : {}

 /* Local variant-key function that NEVER loads objects.
    Uses catalog[identifier|rideType].variantSig (pre-normalized); falls
    back to normalized catalog name; finally falls back to identifier. */
 function localVariantKey(rec) {
  if (!rec || rec.type !== "ride") return "scenery|" + (rec && rec.identifier ? rec.identifier : "bad")
  var ck = rec.identifier + "|" + String(rec.rideType)
  var row = catalog[ck]
  var sig = (row && row.variantSig) || (row && row.name ? rpf_normName(row.name) : null) || rec.identifier
  return "ridevar|" + String(rec.rideType) + "|" + sig
 }

 // Initialize containers
 var byCategory = {},
  existingInv = {},
  existingUninv = {},
  variantSeen = {},
  stableSeen = {}
 for (var i = 0; i < RPF_CATS.length; i++) {
  var c = RPF_CATS[i]
  byCategory[c] = []
  existingInv[c] = []
  existingUninv[c] = []
  variantSeen[c] = {}
  stableSeen[c] = {}
 }

 // Seed with current presence to prevent exact variant duplicates
 function seedVariant(list) {
  for (var k = 0; k < list.length; k++) {
   var r = list[k]
   if (!r || !r.category || !rpf_isKnownCategory(r.category)) continue
   if (r.type === "ride") {
    if (typeof r.rideType !== "number" && RR.gameBridge && RR.gameBridge.isValidRideType && RR.gameBridge.deriveRideType) {
     var deriv = RR.gameBridge.deriveRideType ? RR.gameBridge.deriveRideType(r.identifier, r.rideType) : null
     if (RR.gameBridge.isValidRideType(deriv)) r.rideType = deriv
    }
    variantSeen[r.category][localVariantKey(r)] = true
   } else {
    stableSeen[r.category][rpf_stableKey(r)] = true
   }
  }
 }
 seedVariant(snapshot.invented || [])
 seedVariant(snapshot.uninvented || [])

 // Add existing items (respect excludeCustom policy now)
 function considerExisting(list, intoMap) {
  for (var j = 0; j < list.length; j++) {
   var rec = list[j]
   if (!rpf_shouldIncludeExisting(rec, inUseSet)) continue

   if (excludeCustom) {
    var catalogSaysCustom = rpf_isCatalogCustom(rec, catalog)
    var isNonWhite = catalogSaysCustom || rpf_isIdentifierNonWhitelisted(rec.type, rec.identifier)
    if (isNonWhite) continue
   }

   if (rec.type === "ride" && RR.gameBridge && RR.gameBridge.isValidRideType && !RR.gameBridge.isValidRideType(rec.rideType)) {
    var fixRt = RR.gameBridge.deriveRideType ? RR.gameBridge.deriveRideType(rec.identifier, rec.rideType) : null
    if (RR.gameBridge.isValidRideType(fixRt)) rec.rideType = fixRt
    else continue
   }
   var cat = rec.category
   var sKey = rpf_stableKey(rec)
   var vKey = rec.type === "ride" ? localVariantKey(rec) : null
   if (stableSeen[cat][sKey]) continue
   if (vKey && variantSeen[cat][vKey]) continue
   stableSeen[cat][sKey] = true
   if (vKey) variantSeen[cat][vKey] = true
   intoMap[cat].push(rec)
  }
 }
 considerExisting(snapshot.invented || [], existingInv)
 considerExisting(snapshot.uninvented || [], existingUninv)

 // Add catalog items (new candidates), honoring excludeCustom
 for (var key in catalog)
  if (catalog.hasOwnProperty(key)) {
   var e = catalog[key]
   if (!rpf_shouldIncludeFromCatalog(e, inUseSet, excludeCustom)) continue

   var rec = e.type === "ride" ? { type: "ride", identifier: e.identifier, category: e.category, rideType: e.rideType } : { type: "scenery", identifier: e.identifier, category: "scenery" }

   var cat2 = rec.category
   var sKey2 = rpf_stableKey(rec)
   var vKey2 = rec.type === "ride" ? localVariantKey(rec) : null

   if (stableSeen[cat2][sKey2]) continue
   if (vKey2 && variantSeen[cat2][vKey2]) continue

   stableSeen[cat2][sKey2] = true
   if (vKey2) variantSeen[cat2][vKey2] = true
   byCategory[cat2].push(rec)
  }

 // Final per-category stable-key uniquing
 for (i = 0; i < RPF_CATS.length; i++) {
  var cname = RPF_CATS[i],
   arr = byCategory[cname],
   out = [],
   seen = {}
  for (var a = 0; a < arr.length; a++) {
   var k2 = rpf_stableKey(arr[a])
   if (!seen[k2]) {
    seen[k2] = true
    out.push(arr[a])
   }
  }
  byCategory[cname] = out
 }

 return {
  byCategory: byCategory,
  existingInvByCategory: existingInv,
  existingUninvByCategory: existingUninv,
  variantSeenByCategory: variantSeen,
  _helpers: {
   stableKey: rpf_stableKey,
   variantKey: localVariantKey, // used by selectionRules; no loads
  },
 }
}

/* Public API (tests may still call these) */
function rpf_variantKey(rec) {
 // Keep a cheap, load-free baseline for tests; selection uses _helpers.variantKey
 if (!rec || rec.type !== "ride") return "scenery|" + (rec && rec.identifier ? rec.identifier : "bad")
 return "ridevar|" + String(rec.rideType) + "|" + rec.identifier
}

RR.poolsAndFilters = {
 build: rpf_build,
 _variantKeyForTest: rpf_variantKey,
 _stableKeyForTest: rpf_stableKey,
}
/* ============================ END MODULE: RR.poolsAndFilters ============================ */

/* ==========================================================================
MODULE: RR.selectionRules  |  Weighted picking, duplicate penalties, specials
PURPOSE: Selects per-category invented & uninvented sets that hit targets,
applies squared ride-type penalties, forbids exact Type+Vehicle
duplicates, and adds guaranteed ATM/Info without displacing picks.
=========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

/* ------------------------------ locals --------------------------------- */
var RR_SEL_CONST = RR && RR.constants ? RR.constants : null
var RR_SEL_CATS = RR_SEL_CONST && RR_SEL_CONST.CATEGORIES ? RR_SEL_CONST.CATEGORIES : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

// Optional hook provided by pools module for strict Type+Vehicle keys
var RR_SEL_variantKeyHelper = null

/* ----------------------------- helpers --------------------------------- */
function rr_selIsRide(c) {
 return c && c.type === "ride"
}

// Prefer strict variant key from pools._helpers.variantKey if provided.
function rr_selVariantKey(c) {
 if (!c) return ""
 if (RR_SEL_variantKeyHelper && typeof RR_SEL_variantKeyHelper === "function") {
  try {
   return String(RR_SEL_variantKeyHelper(c))
  } catch (e) {}
 }
 if (c.variantKey && typeof c.variantKey === "string") return c.variantKey
 if (rr_selIsRide(c)) return "ride|" + c.identifier + "|" + String(c.rideType)
 return "scenery|" + c.identifier
}
function rr_selRtKey(c) {
 return rr_selIsRide(c) ? String(c.rideType) : null
}

/* --- DEFENSE-IN-DEPTH custom-source filtering --- */

/* Return true if identifier is clearly non-whitelisted (or unknown => treat as non-white). */
function rr_selIsIdentifierNonWhitelisted(type, identifier) {
 // Try installed object metadata (preferred in modern builds)
 try {
  if (typeof objectManager !== "undefined" && objectManager && objectManager.getInstalledObject) {
   var inst = objectManager.getInstalledObject(identifier)
   if (inst && RR.constants && RR.constants.isWhitelistedSource) {
    return !RR.constants.isWhitelistedSource(inst)
   }
  }
 } catch (_e1) {}
 // Fallback: try loaded object -> installedObject meta
 try {
  if (RR.gameBridge && RR.gameBridge.ensureLoaded && RR.gameBridge.resolveLoadedObject) {
   var logical = type === "scenery" ? "scenery" : "ride"
   if (RR.gameBridge.ensureLoaded(logical, identifier)) {
    var apiType = logical === "scenery" ? "scenery_group" : "ride"
    var r = RR.gameBridge.resolveLoadedObject(logical, identifier)
    if (r && typeof r.object === "number") {
     var o = context.getObject(apiType, r.object)
     var instObj = o && o.installedObject
     if (instObj && RR.constants && RR.constants.isWhitelistedSource) {
      return !RR.constants.isWhitelistedSource(instObj)
     }
    }
   }
  }
 } catch (_e2) {}
 // Conservative default: if we cannot prove whitelist, treat as non-whitelisted
 return true
}

/* Catalog-based custom flag with safe fallback. */
function rr_selIsNonWhitelistedCandidate(c, catalog) {
 if (!c || !c.identifier) return true
 try {
  var isCustom = false
  if (catalog) {
   if (c.type === "ride") {
    var ck = c.identifier + "|" + String(c.rideType)
    if (catalog[ck] && typeof catalog[ck].isCustom !== "undefined") {
     isCustom = !!catalog[ck].isCustom
     return isCustom
    }
   } else {
    if (catalog[c.identifier] && typeof catalog[c.identifier].isCustom !== "undefined") {
     isCustom = !!catalog[c.identifier].isCustom
     return isCustom
    }
   }
  }
 } catch (_e) {}
 // Fallback to direct identifier check
 return rr_selIsIdentifierNonWhitelisted(c.type, c.identifier)
}

/* weight = base / (count(rt)^2) ; when count==0 => 1
exact-variant duplicates => weight 0 (excluded) */
function rr_selWeightFor(c, rtCountMap, usedVariantSet) {
 if (!c) return 0
 var vKey = rr_selVariantKey(c)
 if (usedVariantSet[vKey]) return 0
 if (!rr_selIsRide(c)) return 1
 var key = rr_selRtKey(c)
 var count = key && rtCountMap[key] ? rtCountMap[key] : 0
 var denom = count > 0 ? count * count : 1
 var base = typeof c.weightBase === "number" && c.weightBase > 0 ? c.weightBase : 1
 return base / denom
}

/* Weighted random pick from candidates under current constraints */
function rr_selPickOne(candidates, rtCountMap, usedVariantSet) {
 var i,
  total = 0,
  weights = []
 for (i = 0; i < candidates.length; i++) {
  var w = rr_selWeightFor(candidates[i], rtCountMap, usedVariantSet)
  weights.push(w)
  total += w
 }
 if (total <= 0) return null
 var r = Math.random() * total
 for (i = 0; i < candidates.length; i++) {
  r -= weights[i]
  if (r <= 0 && weights[i] > 0) return candidates[i]
 }
 // Fallback: first positive weight
 for (i = 0; i < candidates.length; i++) if (weights[i] > 0) return candidates[i]
 return null
}

/* Remove a candidate (by variantKey) from a working pool */
function rr_selRemoveFromPool(pool, chosen) {
 var out = []
 var vk = rr_selVariantKey(chosen)
 var i
 for (i = 0; i < pool.length; i++) {
  if (rr_selVariantKey(pool[i]) !== vk) out.push(pool[i])
 }
 return out
}

/* Resolve pools map regardless of wrapper shape */
function rr_selPoolsMap(poolsInput) {
 if (!poolsInput) return {}
 if (poolsInput.byCategory) return poolsInput.byCategory
 return poolsInput
}

/* Select N total items with optional allow-predicate.
   If allowPred is provided, filter the working pool with it up-front. */
function rr_selSelectForCategory(pool, totalTarget, invTarget, usedVariantSet, warnings, allowPred) {
 var invented = []
 var uninvented = []
 var rtCount = {} // rideType -> count across invented+uninvented for this category

 var base = pool ? pool.slice(0) : []
 var work = []
 var i
 for (i = 0; i < base.length; i++) {
  var c = base[i]
  if (!allowPred || allowPred(c)) work.push(c)
 }

 var picked,
  needInv = invTarget,
  needMore = Math.max(0, totalTarget - invTarget)

 // Phase 1: invented
 while (needInv > 0 && work.length > 0) {
  picked = rr_selPickOne(work, rtCount, usedVariantSet)
  if (!picked) break
  invented.push(picked)
  usedVariantSet[rr_selVariantKey(picked)] = true
  if (rr_selIsRide(picked)) {
   var rk = rr_selRtKey(picked)
   rtCount[rk] = (rtCount[rk] || 0) + 1
  }
  work = rr_selRemoveFromPool(work, picked)
  needInv--
 }

 // Phase 2: uninvented
 while (needMore > 0 && work.length > 0) {
  picked = rr_selPickOne(work, rtCount, usedVariantSet)
  if (!picked) break
  uninvented.push(picked)
  usedVariantSet[rr_selVariantKey(picked)] = true
  if (rr_selIsRide(picked)) {
   var rk2 = rr_selRtKey(picked)
   rtCount[rk2] = (rtCount[rk2] || 0) + 1
  }
  work = rr_selRemoveFromPool(work, picked)
  needMore--
 }

 // Shortfall notices (soft)
 if (invented.length < invTarget) {
  warnings.push("[" + (pool && pool[0] ? pool[0].category || "category" : "category") + "] not enough candidates to fill invented (" + invented.length + "/" + invTarget + ").")
 }
 if (invented.length + uninvented.length < totalTarget) {
  warnings.push("[" + (pool && pool[0] ? pool[0].category || "category" : "category") + "] not enough candidates to reach total (" + (invented.length + uninvented.length) + "/" + totalTarget + ").")
 }

 return { invented: invented, uninvented: uninvented }
}

/* Find a specific item in NEW-CANDIDATE pools by identifier (does NOT include existing snapshot items) */
function rr_selFindInPools(poolsInput, identifier) {
 if (!poolsInput) return null
 var byCat = rr_selPoolsMap(poolsInput)
 var i, j, cat
 for (i = 0; i < RR_SEL_CATS.length; i++) {
  cat = RR_SEL_CATS[i]
  var arr = byCat[cat] || []
  for (j = 0; j < arr.length; j++) {
   if (arr[j] && arr[j].identifier === identifier) return arr[j]
  }
 }
 return null
}

/* NEW: find in EXISTING snapshot mirrors built by pools (invented or uninvented). */
function rr_selFindInExisting(poolsInput, identifier) {
 if (!poolsInput) return null
 var invMap = poolsInput.existingInvByCategory || {}
 var unMap = poolsInput.existingUninvByCategory || {}
 var i, arr
 // Check INVENTED first (guarantee already satisfied)
 for (i = 0; i < RR_SEL_CATS.length; i++) {
  arr = invMap[RR_SEL_CATS[i]] || []
  for (var a = 0; a < arr.length; a++) if (arr[a] && arr[a].identifier === identifier) return { where: "invented", rec: arr[a] }
 }
 // Then UNINVENTED (we will promote)
 for (i = 0; i < RR_SEL_CATS.length; i++) {
  arr = unMap[RR_SEL_CATS[i]] || []
  for (var b = 0; b < arr.length; b++) if (arr[b] && arr[b].identifier === identifier) return { where: "uninvented", rec: arr[b] }
 }
 return null
}

/* Fallback: materialize a canonical record from the catalog when it wasn't in pools. */
function rr_selFromCatalog(identifier) {
 try {
  if (!RR.catalog || !RR.catalog.get) return null
  var cat = RR.catalog.get() || {}
  var pick = null
  for (var k in cat)
   if (cat.hasOwnProperty(k)) {
    var e = cat[k]
    if (!e || !e.identifier) continue
    if (e.identifier === identifier) {
     pick = e
     if (e.type === "ride") break
    }
   }
  if (!pick) return null
  if (pick.type === "ride") {
   return { type: "ride", identifier: pick.identifier, category: pick.category || "shop", rideType: pick.rideType }
  }
  return { type: "scenery", identifier: pick.identifier, category: "scenery" }
 } catch (_e) {
  return null
 }
}

/* Build “extras” for guaranteed ATM/Info, without displacing targets. */
function rr_selBuildSpecialAdds(opts, poolsInput, usedVariantSet, warnings) {
 var extras = []
 var reqATM = !!opts.guaranteeATM
 var reqInfo = !!opts.guaranteeInfo

 function ensureAdded(identifier, label) {
  // 0) If it already exists in INVENTED -> nothing to do
  var existing = rr_selFindInExisting(poolsInput, identifier)
  if (existing && existing.where === "invented") {
   return true
  }

  // 1) Candidate source priority: existing UNINVENTED (promote) → byCategory → catalog
  var c = existing && existing.where === "uninvented" ? existing.rec : rr_selFindInPools(poolsInput, identifier)
  if (!c) c = rr_selFromCatalog(identifier)

  if (!c) {
   warnings.push(label + " requested but not available (not found in snapshot, pools, or catalog).")
   return false
  }

  // 2) Don’t add an exact Type+Vehicle duplicate
  var vk = rr_selVariantKey(c)
  if (usedVariantSet[vk]) {
   return true
  }

  // 3) Reserve its variant and push as invented extra
  usedVariantSet[vk] = true
  extras.push({
   type: c.type,
   identifier: c.identifier,
   category: c.category || "shop",
   rideType: rr_selIsRide(c) ? c.rideType : undefined,
   __label: label,
  })
  return true
 }

 if (reqATM && RR_SEL_CONST && RR_SEL_CONST.SPECIAL_IDS && RR_SEL_CONST.SPECIAL_IDS.CASH_MACHINE) {
  ensureAdded(RR_SEL_CONST.SPECIAL_IDS.CASH_MACHINE, "ATM")
 }
 if (reqInfo && RR_SEL_CONST && RR_SEL_CONST.SPECIAL_IDS && RR_SEL_CONST.SPECIAL_IDS.INFO_KIOSK) {
  ensureAdded(RR_SEL_CONST.SPECIAL_IDS.INFO_KIOSK, "Info Kiosk")
 }
 return extras
}

/* ------------------------------ select() --------------------------------
opts = {
  pools: { [category]: Candidate[] } OR { byCategory:{[category]:Candidate}, _helpers?:{variantKey?:fn}, existingInvByCategory, existingUninvByCategory },
  targets: { perCategory: { [category]: { targetSelection:number, baselineInvented:number } } },
  guaranteeATM: boolean,
  guaranteeInfo: boolean,
  excludeCustom: boolean   // NEW: defense-in-depth
}
--------------------------------------------------------------------------- */
function rr_selSelect(opts) {
 var poolsInput = opts && opts.pools ? opts.pools : {}
 var byCat = rr_selPoolsMap(poolsInput)
 RR_SEL_variantKeyHelper = poolsInput && poolsInput._helpers && typeof poolsInput._helpers.variantKey === "function" ? poolsInput._helpers.variantKey : null
 var excludeCustom = !!(opts && opts.excludeCustom)

 var targets = opts && opts.targets ? opts.targets : { perCategory: {} }
 var usedVariantSet = {} // global, across categories
 var plan = { perCategory: {}, specials: { added: [], cashRequested: !!opts.guaranteeATM, infoRequested: !!opts.guaranteeInfo }, warnings: [], _variantKeysUsed: usedVariantSet }

 // Catalog snapshot for quick `isCustom` lookups
 var catalog = null
 try {
  catalog = RR.catalog && RR.catalog.get ? RR.catalog.get() : null
 } catch (_e) {}

 // Allow-predicate enforcing excludeCustom at selection time
 var allowPred = function (c) {
  if (!excludeCustom) return true
  return !rr_selIsNonWhitelistedCandidate(c, catalog)
 }

 var i, cat
 for (i = 0; i < RR_SEL_CATS.length; i++) {
  cat = RR_SEL_CATS[i]
  var pool = byCat[cat] || []
  var tgt = targets.perCategory && targets.perCategory[cat] ? targets.perCategory[cat] : {}

  // BaselineTargets naming (with backward-compat fallback)
  var totalTarget = typeof tgt.targetSelection === "number" ? tgt.targetSelection : typeof tgt.total === "number" ? tgt.total : 0
  var invTarget = typeof tgt.baselineInvented === "number" ? tgt.baselineInvented : typeof tgt.invented === "number" ? tgt.invented : 0

  var picks = rr_selSelectForCategory(pool, totalTarget, invTarget, usedVariantSet, plan.warnings, allowPred)

  function canonize(a) {
   var out = []
   var k
   for (k = 0; k < a.length; k++) {
    var c = a[k]
    if (!c) continue
    out.push({
     type: c.type,
     identifier: c.identifier,
     category: c.category || cat,
     rideType: rr_selIsRide(c) ? c.rideType : undefined,
    })
   }
   return out
  }

  plan.perCategory[cat] = {
   invented: canonize(picks.invented),
   uninvented: canonize(picks.uninvented),
  }
 }

 // Add specials as separate extras (don’t displace invented targets)
 var extraAdds = rr_selBuildSpecialAdds({ guaranteeATM: !!opts.guaranteeATM, guaranteeInfo: !!opts.guaranteeInfo }, poolsInput, usedVariantSet, plan.warnings)
 plan.specials.added = extraAdds

 // reset helper hook for safety across calls
 RR_SEL_variantKeyHelper = null

 return plan
}

/* ------------------------------ export --------------------------------- */
RR.selectionRules = {
 select: rr_selSelect,
}
/* ======================= END MODULE: RR.selectionRules ======================= */

/* ==========================================================================
MODULE: RR.applyAndRepair | Final write, prune-to-targets, and safety repair
PURPOSE: Turn a selection plan into final research lists, reinsert defaults,
add guaranteed specials, prune loaded extras to hit per-category
targets (except specials), and do a safety repair pass.
========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

/* ------------------------------ locals --------------------------------- */

var RR_AR_CONST = RR && RR.constants ? RR.constants : null
var RR_AR_CATS = RR_AR_CONST && RR_AR_CONST.CATEGORIES ? RR_AR_CONST.CATEGORIES : ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

/* stable key for canonical items */
function rrar_stableCanonKey(rec) {
 if (!rec || !rec.identifier) return "bad"
 if (rec.type === "ride") {
  var rt = typeof rec.rideType === "number" ? rec.rideType : -1
  if (RR.gameBridge && RR.gameBridge.stableKeyFromParts) {
   return RR.gameBridge.stableKeyFromParts("ride", rec.identifier, rt)
  }
  return "ride|" + rec.identifier + "|" + String(rt)
 }
 if (RR.gameBridge && RR.gameBridge.stableKeyFromParts) {
  return RR.gameBridge.stableKeyFromParts("scenery", rec.identifier, null)
 }
 return "scenery|" + rec.identifier
}

function rrar_isDefaultFixed(id) {
 try {
  return RR_AR_CONST && RR_AR_CONST.isDefaultFixedId ? RR_AR_CONST.isDefaultFixedId(id) : false
 } catch (e) {
  return false
 }
}
function rrar_isSpecial(id) {
 try {
  return RR_AR_CONST && RR_AR_CONST.isSpecialId ? RR_AR_CONST.isSpecialId(id) : false
 } catch (e) {
  return false
 }
}

/* Build a (type,identifier,rideType?,category) canonical record safely */
function rrar_canon(type, identifier, category, rideType) {
 var rec = { type: type, identifier: identifier, category: type === "scenery" ? "scenery" : category }
 if (type === "ride" && typeof rideType === "number") {
  rec.rideType = rideType
 }
 return rec
}

/* -------------------- defaults & specials reinsertion ------------------- */

/* Reinsert defaults exactly where they originally lived (invented/uninvented). */
function rrar_collectDefaultsFromSnapshot(snapshot) {
 var out = { inv: [], un: [] }
 if (!snapshot) return out
 function harvest(list, into) {
  var i
  for (i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it || !it.identifier) continue
   if (rrar_isDefaultFixed(it.identifier)) {
    into.push(rrar_canon(it.type, it.identifier, it.category, it.rideType))
   }
  }
 }
 harvest(snapshot.invented || [], out.inv)
 harvest(snapshot.uninvented || [], out.un)
 return out
}

/* Append guaranteed specials to invented (don’t displace random picks). */
function rrar_mergeSpecials(invCanon, specials) {
 try {
  if (!specials || !specials.added || !specials.added.length) return invCanon
  var out = invCanon.slice(0)
  var i
  for (i = 0; i < specials.added.length; i++) {
   var s = specials.added[i]
   if (!s || !s.identifier) continue
   // Safety: avoid duplicates
   var k = rrar_stableCanonKey(s)
   var dup = false
   var j
   for (j = 0; j < out.length; j++) {
    if (rrar_stableCanonKey(out[j]) === k) {
     dup = true
     break
    }
   }
   if (!dup) out.push(rrar_canon(s.type, s.identifier, s.category, s.rideType))
  }
  return out
 } catch (e) {
  return invCanon
 }
}

/* ---------------------- canon assembly & de-dup ------------------------ */

function rrar_assembleCanonFromPlan(plan, snapshot) {
 var inv = []
 var uninv = []

 var i,
  cat,
  per = plan && plan.perCategory ? plan.perCategory : {}

 for (i = 0; i < RR_AR_CATS.length; i++) {
  cat = RR_AR_CATS[i]
  var row = per[cat] || { invented: [], uninvented: [] }

  // copy (strip any transient fields)
  var a, it
  for (a = 0; a < row.invented.length; a++) {
   it = row.invented[a]
   if (!it || !it.identifier) continue
   inv.push(rrar_canon(it.type, it.identifier, it.category || cat, it.rideType))
  }
  for (a = 0; a < row.uninvented.length; a++) {
   it = row.uninvented[a]
   if (!it || !it.identifier) continue
   uninv.push(rrar_canon(it.type, it.identifier, it.category || cat, it.rideType))
  }
 }

 // Add guaranteed specials to invented (if any)
 inv = rrar_mergeSpecials(inv, plan && plan.specials ? plan.specials : null)

 // Reinsert defaults based on where they originally were
 var defs = rrar_collectDefaultsFromSnapshot(snapshot)
 var d
 for (d = 0; d < defs.inv.length; d++) inv.push(defs.inv[d])
 for (d = 0; d < defs.un.length; d++) uninv.push(defs.un[d])

 // De-dup: invented has priority over uninvented; then make each list unique.
 var seen = {}
 var invOut = []
 var i1
 for (i1 = 0; i1 < inv.length; i1++) {
  var ki = rrar_stableCanonKey(inv[i1])
  if (!seen[ki]) {
   seen[ki] = true
   invOut.push(inv[i1])
  }
 }
 var unOut = []
 var i2
 for (i2 = 0; i2 < uninv.length; i2++) {
  var ku = rrar_stableCanonKey(uninv[i2])
  if (!seen[ku]) {
   // don’t duplicate invented
   seen[ku] = true
   unOut.push(uninv[i2])
  }
 }

 return { inv: invOut, uninv: unOut }
}

/* -------------------------- prune to targets --------------------------- */

/* Build sets of PRESENT canon keys (for fast membership tests). */
function rrar_buildCanonKeySet(canon) {
 var set = {}
 var i
 for (i = 0; i < canon.inv.length; i++) set[rrar_stableCanonKey(canon.inv[i])] = true
 for (i = 0; i < canon.uninv.length; i++) set[rrar_stableCanonKey(canon.uninv[i])] = true
 return set
}

/* Utility to test if an identifier is "protected": in use (rides) or default. */
function rrar_buildProtectSet(snapshot) {
 var protect = {}
 try {
  var inUse = RR.gameBridge && RR.gameBridge.detectRidesInUse ? RR.gameBridge.detectRidesInUse() : {}
  var k
  for (k in inUse) if (inUse.hasOwnProperty(k)) protect[k] = true
 } catch (e) {}
 // Protect scenery groups that were part of the original selection (don’t unload user’s scenery sets).
 try {
  var i, it
  for (i = 0; i < (snapshot.invented || []).length; i++) {
   it = snapshot.invented[i]
   if (it && it.type === "scenery" && it.identifier) protect["scenery|" + it.identifier] = true
  }
  for (i = 0; i < (snapshot.uninvented || []).length; i++) {
   it = snapshot.uninvented[i]
   if (it && it.type === "scenery" && it.identifier) protect["scenery|" + it.identifier] = true
  }
 } catch (e2) {}
 return protect
}

/* Choose extras (not in canon, not protected) to unload until <= target. */
function rrar_pruneLoadedToTargets(targets, canon, snapshot) {
 try {
  var catalog = RR.catalog && RR.catalog.get ? RR.catalog.get() : {}
  var protect = rrar_buildProtectSet(snapshot)
  var canonSet = rrar_buildCanonKeySet(canon)

  // Build loaded lists (by category)
  var loadedByCat = {}
  var i
  for (i = 0; i < RR_AR_CATS.length; i++) loadedByCat[RR_AR_CATS[i]] = []

  // Rides
  try {
   var ridePairs = RR.gameBridge && RR.gameBridge.loadedRidePairs ? RR.gameBridge.loadedRidePairs(catalog) : []
   var r
   for (r = 0; r < ridePairs.length; r++) {
    var rp = ridePairs[r]
    if (!rp || !rp.identifier || !rp.category) continue
    if (!loadedByCat[rp.category]) loadedByCat[rp.category] = []
    loadedByCat[rp.category].push({ type: "ride", identifier: rp.identifier, rideType: rp.rideType, category: rp.category })
   }
  } catch (e1) {}

  // Scenery groups
  try {
   var groups = RR.gameBridge && RR.gameBridge.loadedSceneryGroups ? RR.gameBridge.loadedSceneryGroups(catalog) : []
   var g
   for (g = 0; g < groups.length; g++) {
    var sg = groups[g]
    if (!sg || !sg.identifier) continue
    loadedByCat["scenery"].push({ type: "scenery", identifier: sg.identifier, category: "scenery" })
   }
  } catch (e2) {}

  // For each category: count non-fixed and unload extras not in canon until we reach the target
  var cIdx
  for (cIdx = 0; cIdx < RR_AR_CATS.length; cIdx++) {
   var cat = RR_AR_CATS[cIdx]
   var list = loadedByCat[cat] || []
   var targetRow = targets && targets.perCategory ? targets.perCategory[cat] : null
   var targetTotal = targetRow && typeof targetRow.targetSelection === "number" ? targetRow.targetSelection : 0

   // Build NON-fixed list (exclude default fixed + specials) and mark which are canon
   var nonFixed = []
   var i3
   for (i3 = 0; i3 < list.length; i3++) {
    var e = list[i3]
    if (!e || !e.identifier) continue
    if (rrar_isDefaultFixed(e.identifier)) continue
    if (rrar_isSpecial(e.identifier)) continue
    nonFixed.push(e)
   }

   // If we already have <= target (or no target), nothing to prune.
   if (nonFixed.length <= targetTotal || targetTotal <= 0) {
    continue
   }

   // Collect unload candidates = non-fixed that are NOT part of canon and NOT protected
   var extras = []
   for (i3 = 0; i3 < nonFixed.length; i3++) {
    var rec = nonFixed[i3]
    var key = rrar_stableCanonKey(rec)
    var protTag = rec.type + "|" + rec.identifier
    if (canonSet[key]) continue
    if (protect[protTag]) continue
    extras.push(rec)
   }

   // Unload until we’re at or below target, or no extras left.
   var needToDrop = nonFixed.length - targetTotal
   var idx = 0
   while (needToDrop > 0 && extras.length > 0) {
    var victim = extras[idx % extras.length] // simple round-robin
    try {
     // Physically unload and purge research refs
     objectManager.unload(victim.identifier)
    } catch (_ue) {}
    try {
     RR.gameBridge && RR.gameBridge.purgeResearchRefsForIdentifierTyped && RR.gameBridge.purgeResearchRefsForIdentifierTyped(victim.type, victim.identifier, protect)
    } catch (_pe) {}
    needToDrop--
    // Remove victim from extras to avoid repeated attempts
    extras.splice(idx % (extras.length || 1), 1)
    idx++
   }
  }

  // Scrub and normalize after unloading
  try {
   if (RR.gameBridge && RR.gameBridge.scrubResearchArrays) RR.gameBridge.scrubResearchArrays()
   if (RR.gameBridge && RR.gameBridge.sanitizeAndNormalizeResearchLists) RR.gameBridge.sanitizeAndNormalizeResearchLists()
  } catch (_s) {}
 } catch (eTop) {
  try {
   if (console && console.log) console.log("[RR] pruneLoadedToTargets error: " + eTop.message)
  } catch (_e2) {}
 }
}

/* ------------------------------ repair -------------------------------- */

function rrar_repairNow(snapshot) {
 try {
  if (RR && RR.gameBridge) {
   if (RR.gameBridge.scrubResearchArrays) RR.gameBridge.scrubResearchArrays()
   if (RR.gameBridge.sanitizeAndNormalizeResearchLists) RR.gameBridge.sanitizeAndNormalizeResearchLists()
  }
 } catch (e) {
  try {
   if (console && console.log) console.log("[RR] repairNow error: " + e.message)
  } catch (_e2) {}
 }
}

/* ------------------------------- apply -------------------------------- */

function rrar_apply(opts) {
 var plan = (opts && opts.plan) || { perCategory: {}, specials: { added: [] } }
 var targets = (opts && opts.targets) || null
 var snapshot = (opts && opts.snapshot) || (RR.gameBridge && RR.gameBridge.snapshotResearch ? RR.gameBridge.snapshotResearch() : { invented: [], uninvented: [] })

 // 1) Assemble canon (selection + defaults + specials), de-dup with invented priority
 var canon = rrar_assembleCanonFromPlan(plan, snapshot)

 // 2) Write canon through bridge (preserve indices when possible)
 try {
  if (RR.gameBridge && RR.gameBridge.applyRefPreserving) {
   RR.gameBridge.applyRefPreserving(canon.inv, canon.uninv)
  }
 } catch (_e1) {}

 // 3) Prune loaded extras down to per-category targets (protect defaults / in-use; specials won’t be considered extras)
 try {
  rrar_pruneLoadedToTargets(targets, canon, snapshot)
 } catch (_e2) {}

 // 4) Re-apply canon after unloads to ensure lists only reference loaded objects
 try {
  if (RR.gameBridge && RR.gameBridge.applyRefPreserving) {
   RR.gameBridge.applyRefPreserving(canon.inv, canon.uninv)
  }
 } catch (_e3) {}

 // 5) Final safety repair
 rrar_repairNow()
}

/* ------------------------------ export -------------------------------- */

RR.applyAndRepair = {
 apply: rrar_apply,
 repairNow: rrar_repairNow,
}
/* ======================== END MODULE: RR.applyAndRepair ======================== */

/* ==========================================================================
MODULE: RR.ui  |  Window, widgets, events, and small notifications
PURPOSE: Shows the control panel (scan, multiplier, checkboxes, randomize),
         syncs prefs, displays status, and (NEW) asks for confirmation
         before running Randomize.
========================================================================== */

var RR = typeof RR !== "undefined" ? RR : {}

var RR_UI_CLASS = "research-randomizer"
var RR_UI_MULTIPLIERS = [1.0, 1.5, 2.0, 3.0]

var RR_UI_controller = null
var RR_UI_window = null
var RR_UI_confirmWindow = null // <— track the confirm window handle

/* helpers */
function rr_toLocalString(ts) {
 if (!ts) {
  return "—"
 }
 try {
  return new Date(ts).toLocaleString()
 } catch (e) {
  var d = new Date(ts)
  var pad = function (n) {
   return (n < 10 ? "0" : "") + n
  }
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
 }
}
function rr_uiGetWidget(win, name) {
 if (!win) {
  return null
 }
 try {
  if (win.findWidget) {
   return win.findWidget(name)
  }
 } catch (e) {}
 try {
  var i,
   ws = win.widgets || []
  for (i = 0; i < ws.length; i++) {
   if (ws[i].name === name) {
    return ws[i]
   }
  }
 } catch (e2) {}
 return null
}
function rr_uiCurrentPrefs() {
 return RR_UI_controller && RR_UI_controller.getPrefs ? RR_UI_controller.getPrefs() : { multiplier: 1.0, guaranteeATM: false, guaranteeInfo: false, excludeCustom: false }
}
function rr_indexForMultiplier(val) {
 for (var i = 0; i < RR_UI_MULTIPLIERS.length; i++) {
  if (RR_UI_MULTIPLIERS[i] === val) {
   return i
  }
 }
 return 0
}
function rr_readPrefsFromWidgets(win) {
 var dd = rr_uiGetWidget(win, "multiplier")
 var a = rr_uiGetWidget(win, "guaranteeATM")
 var k = rr_uiGetWidget(win, "guaranteeInfo")
 var c = rr_uiGetWidget(win, "excludeCustom")
 var idx = dd ? dd.selectedIndex : 0
 return { multiplier: RR_UI_MULTIPLIERS[idx] || 1.0, guaranteeATM: a ? !!a.isChecked : false, guaranteeInfo: k ? !!k.isChecked : false, excludeCustom: c ? !!c.isChecked : false }
}
function rr_savePrefsFromWidgets(win) {
 if (!RR_UI_controller || !RR_UI_controller.onSavePrefs) {
  return
 }
 var prefs = rr_readPrefsFromWidgets(win)
 RR_UI_controller.onSavePrefs(prefs)
}
function rr_applyPrefsToWidgets(win, prefs) {
 var dd = rr_uiGetWidget(win, "multiplier")
 var a = rr_uiGetWidget(win, "guaranteeATM")
 var k = rr_uiGetWidget(win, "guaranteeInfo")
 var c = rr_uiGetWidget(win, "excludeCustom")
 if (dd) {
  dd.selectedIndex = rr_indexForMultiplier(prefs.multiplier || 1.0)
 }
 if (a) {
  a.isChecked = !!prefs.guaranteeATM
 }
 if (k) {
  k.isChecked = !!prefs.guaranteeInfo
 }
 if (c) {
  c.isChecked = !!prefs.excludeCustom
 }
}
function rr_setStatus(win, status) {
 var s1 = rr_uiGetWidget(win, "statusBaseline")
 var s2 = rr_uiGetWidget(win, "statusCatalog")
 if (s1) {
  s1.text = "Baseline: " + (status && status.hasBaseline ? rr_toLocalString(status.baselineAt) : "—")
 }
 if (s2) {
  s2.text = "Catalog: " + (status && status.hasCatalog ? rr_toLocalString(status.catalogAt) : "—")
 }
}

/* --- Confirmation window for Randomize --- */
function rr_closeConfirmWindow() {
 try {
  if (RR_UI_confirmWindow && RR_UI_confirmWindow.close) {
   RR_UI_confirmWindow.close()
  }
 } catch (_e) {}
 RR_UI_confirmWindow = null
}

function rr_openRandomizeConfirm() {
 if (typeof ui === "undefined" || !ui || !ui.openWindow) {
  // Headless / no UI -> run directly
  return RR_UI_controller && RR_UI_controller.onRandomize ? RR_UI_controller.onRandomize() : undefined
 }

 // If one is already open, close it first
 rr_closeConfirmWindow()

 // Build new confirm window and keep the handle
 var w = ui.openWindow({
  classification: "research-randomizer-confirm",
  width: 320,
  height: 80,
  title: "Confirm Randomize",
  colours: [24, 24, 24],
  widgets: [
   { type: "label", x: 12, y: 18, width: 296, height: 14, name: "warn", text: "Warning: game may freeze for several seconds, proceed?" },
   {
    type: "button",
    x: 60,
    y: 38,
    width: 80,
    height: 18,
    name: "cancel",
    text: "Cancel",
    onClick: function () {
     // Close by handle: robust and immediate
     rr_closeConfirmWindow()
    },
   },
   {
    type: "button",
    x: 160,
    y: 38,
    width: 80,
    height: 18,
    name: "ok",
    text: "Proceed",
    onClick: function () {
     rr_closeConfirmWindow()
     if (RR_UI_controller && RR_UI_controller.onRandomize) {
      RR_UI_controller.onRandomize()
     }
    },
   },
  ],
  onClose: function () {
   // Ensure our handle is cleared even if user closes via [X]
   RR_UI_confirmWindow = null
  },
 })

 RR_UI_confirmWindow = w
 return w
}

/* window build/focus */
function rr_buildWindow() {
 if (typeof ui === "undefined" || !ui || !ui.openWindow) {
  try {
   if (console && console.log) {
    console.log("[RR] UI not available in this build.")
   }
  } catch (e) {}
  return null
 }

 var prefs = rr_uiCurrentPrefs()
 var status = RR_UI_controller && RR_UI_controller.getStatus ? RR_UI_controller.getStatus() : null

 var win = ui.openWindow({
  classification: RR_UI_CLASS,
  width: 330,
  height: 188,
  title: "Research Randomizer",
  colours: [24, 24, 24],
  widgets: [
   // Row 1: Multiplier
   { type: "label", x: 12, y: 22, width: 80, height: 14, text: "Multiplier" },
   {
    type: "dropdown",
    name: "multiplier",
    x: 90,
    y: 18,
    width: 120,
    height: 14,
    items: ["1.0x", "1.5x", "2.0x", "3.0x"],
    selectedIndex: rr_indexForMultiplier(prefs.multiplier || 1.0),
    onChange: function () {
     rr_savePrefsFromWidgets(win)
    },
   },

   // Row 2: Checkboxes
   {
    type: "checkbox",
    name: "guaranteeATM",
    x: 12,
    y: 44,
    width: 306,
    height: 14,
    text: "Guarantee ATM (Cash Machine)",
    isChecked: !!prefs.guaranteeATM,
    onChange: function () {
     rr_savePrefsFromWidgets(win)
    },
   },
   {
    type: "checkbox",
    name: "guaranteeInfo",
    x: 12,
    y: 60,
    width: 306,
    height: 14,
    text: "Guarantee Info Kiosk",
    isChecked: !!prefs.guaranteeInfo,
    onChange: function () {
     rr_savePrefsFromWidgets(win)
    },
   },
   {
    type: "checkbox",
    name: "excludeCustom",
    x: 12,
    y: 76,
    width: 306,
    height: 14,
    text: "Exclude custom-source items",
    isChecked: !!prefs.excludeCustom,
    onChange: function () {
     rr_savePrefsFromWidgets(win)
    },
   },

   // Row 3: Buttons
   {
    type: "button",
    name: "scanBtn",
    x: 12,
    y: 104,
    width: 120,
    height: 18,
    text: "Smart Scan",
    onClick: function () {
     if (RR_UI_controller && RR_UI_controller.onScan) {
      RR_UI_controller.onScan()
     }
     if (RR_UI_controller && RR_UI_controller.getStatus) {
      rr_setStatus(win, RR_UI_controller.getStatus())
     }
    },
   },
   {
    type: "button",
    name: "randomizeBtn",
    x: 144,
    y: 104,
    width: 120,
    height: 18,
    text: "Randomize",
    onClick: function () {
     // Open confirmation dialog first
     rr_openRandomizeConfirm()
     if (RR_UI_controller && RR_UI_controller.getStatus) {
      rr_setStatus(win, RR_UI_controller.getStatus())
     }
    },
   },

   // Row 4: Status lines
   { type: "label", name: "statusBaseline", x: 12, y: 134, width: 300, height: 14, text: "Baseline: —" },
   { type: "label", name: "statusCatalog", x: 12, y: 150, width: 300, height: 14, text: "Catalog: —" },
  ],
  onClose: function () {
   RR_UI_window = null
  },
 })

 rr_applyPrefsToWidgets(win, prefs)
 rr_setStatus(win, status)
 return win
}

function rr_focusOrOpen() {
 try {
  if (typeof ui !== "undefined" && ui && ui.getWindow) {
   var existing = ui.getWindow(RR_UI_CLASS)
   if (existing) {
    RR_UI_window = existing
    existing.bringToFront()
    if (RR_UI_controller && RR_UI_controller.getStatus) {
     rr_setStatus(existing, RR_UI_controller.getStatus())
    }
    return
   }
  }
 } catch (e) {}
 RR_UI_window = rr_buildWindow()
}

/* public UI API */
RR.ui = {
 init: function (controller) {
  RR_UI_controller = controller
 },
 open: function () {
  rr_focusOrOpen()
 },
 flash: function (text) {
  try {
   if (typeof ui !== "undefined" && ui && ui.showError) {
    ui.showError("Research Randomizer", text)
   } else if (console && console.log) {
    console.log("[RR] " + text)
   }
  } catch (e) {}
 },
 refreshStatus: function (status) {
  var w = RR_UI_window
  if (!w && typeof ui !== "undefined" && ui && ui.getWindow) {
   w = ui.getWindow(RR_UI_CLASS)
  }
  if (w) {
   rr_setStatus(w, status)
  }
 },
}
/* ================================ END MODULE: RR.ui ================================ */

/* ==========================================================================
   MODULE: RR.main  |  Orchestrator + plugin entrypoint
   PURPOSE: Boots the plugin, hooks UI, runs scan/randomize flows, and sets a daily repair guard.
   ========================================================================== */

/* Global namespace */
var RR = typeof RR !== "undefined" ? RR : {}

/* Tiny safe wrapper for user-facing errors */
function rr_safeCall(fn, label) {
 try {
  return fn()
 } catch (e) {
  try {
   if (typeof ui !== "undefined" && ui && ui.showError) {
    ui.showError("Research Randomizer", (label || "Error") + ": " + e.message)
   }
  } catch (_e) {}
  try {
   if (typeof console !== "undefined" && console && console.log) {
    console.log("[RR] " + (label || "Error") + ": " + e.stack)
   }
  } catch (_e2) {}
  return null
 }
}

/* Main orchestrator */
RR.main = (function () {
 var started = false
 var lastDailyFixDay = -1

 function boot() {
  if (started) {
   return
  }
  started = true

  rr_safeCall(function () {
   if (RR.state && RR.state.init) {
    RR.state.init()
   }
  }, "state.init")
  rr_safeCall(function () {
   if (RR.ui && RR.ui.init) {
    RR.ui.init(controller())
   }
  }, "ui.init")

  rr_safeCall(function () {
   if (!RR.gameBridge || !RR.applyAndRepair) {
    return
   }
   var snap = RR.gameBridge.snapshotResearch()
   RR.applyAndRepair.repairNow(snap)
  }, "initial repair")

  registerMenu()
  registerDailyGuard()
 }

 function controller() {
  return {
   onScan: onScan,
   onRandomize: onRandomize,
   onSavePrefs: onSavePrefs,
   getPrefs: function () {
    return RR.state && RR.state.getPrefs ? RR.state.getPrefs() : {}
   },
   getStatus: getStatus,
  }
 }

 function onSavePrefs(prefs) {
  rr_safeCall(function () {
   if (RR.state && RR.state.savePrefs) {
    RR.state.savePrefs(prefs)
   }
  }, "savePrefs")
 }

 function getStatus() {
  var base = RR.state && RR.state.getBaseline ? RR.state.getBaseline() : null
  var cat = RR.state && RR.state.getCatalogMeta ? RR.state.getCatalogMeta() : null
  return {
   hasBaseline: !!base,
   baselineAt: base ? base.createdAt : null,
   hasCatalog: !!cat,
   catalogAt: cat ? cat.createdAt : null,
   prefs: RR.state && RR.state.getPrefs ? RR.state.getPrefs() : {},
  }
 }

 function onScan() {
  return rr_safeCall(function () {
   if (!RR.gameBridge || !RR.catalog) {
    return
   }
   var prefs = RR.state && RR.state.getPrefs ? RR.state.getPrefs() : {}
   var snap = RR.gameBridge.snapshotResearch()
   RR.catalog.runSmartScan({
    snapshot: snap,
    excludeCustom: !!prefs.excludeCustom,
   })
   if (RR.ui && RR.ui.flash) {
    RR.ui.flash("Scan complete.")
   }
  }, "scan")
 }

 function onRandomize() {
  return rr_safeCall(function () {
   if (!RR.gameBridge || !RR.baselineTargets || !RR.catalog || !RR.poolsAndFilters || !RR.selectionRules || !RR.applyAndRepair) {
    return
   }

   var prefs = RR.state && RR.state.getPrefs ? RR.state.getPrefs() : {}

   var snap = RR.gameBridge.snapshotResearch()
   RR.baselineTargets.ensureBaseline({ snapshot: snap })

   RR.catalog.ensureReady({
    snapshot: snap,
    excludeCustom: !!prefs.excludeCustom,
   })

   var targets = RR.baselineTargets.computeTargets({
    multiplier: prefs.multiplier,
   })

   var inUse = RR.gameBridge.detectRidesInUse()

   var pools = RR.poolsAndFilters.build({
    snapshot: snap,
    inUse: inUse,
    excludeCustom: !!prefs.excludeCustom,
   })

   var plan = RR.selectionRules.select({
    pools: pools,
    targets: targets,
    guaranteeATM: !!prefs.guaranteeATM,
    guaranteeInfo: !!prefs.guaranteeInfo,
   })

   RR.applyAndRepair.apply({
    plan: plan,
    targets: targets,
    snapshot: snap,
   })

   if (RR.ui && RR.ui.flash) {
    RR.ui.flash("Randomization complete.")
   }
   if (RR.ui && RR.ui.refreshStatus) {
    RR.ui.refreshStatus(getStatus())
   }
  }, "randomize")
 }

 function registerMenu() {
  try {
   if (typeof ui !== "undefined" && ui && ui.registerMenuItem) {
    ui.registerMenuItem("Research Randomizer", function () {
     if (RR.ui && RR.ui.open) {
      RR.ui.open()
     }
    })
   }
  } catch (e) {}
 }

 function registerDailyGuard() {
  try {
   if (typeof context !== "undefined" && context && context.subscribe) {
    var daily = function () {
     try {
      var day = typeof date !== "undefined" && date ? date.day : -1
      if (day !== lastDailyFixDay && day !== -1) {
       lastDailyFixDay = day
       if (RR.gameBridge && RR.applyAndRepair) {
        var snap = RR.gameBridge.snapshotResearch()
        RR.applyAndRepair.repairNow(snap)
       }
      }
     } catch (e) {}
    }
    try {
     context.subscribe("interval.day", daily)
    } catch (_a) {}
    try {
     context.subscribe("interval.tick", function () {
      daily()
     })
    } catch (_b) {}
   }
  } catch (e) {
   try {
    if (console && console.log) {
     console.log("[RR] Daily guard not registered: " + e.message)
    }
   } catch (_e) {}
  }
 }

 return {
  boot: boot,
  runRandomizeForTests: onRandomize,
 }
})()

function main() {
 if (RR && RR.main && RR.main.boot) {
  RR.main.boot()
 }
}

registerPlugin({
 name: "research-randomizer",
 version: "2.0",
 authors: ["PlateGlassArmour"],
 licence: "MIT",
 type: "remote",
 targetApiVersion: 80,
 minApiVersion: 60,
 main: main,
})
/* ============================= END MODULE: RR.main ============================= */
