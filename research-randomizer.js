/* =========================
   Research Randomizer (ES5)
   ========================= */

// Namespace used as a prefix for sharedStorage keys
var NS_RR = "PlateGlassArmour.ResearchRandomizer"

// Canonical research categories used by OpenRCT2
var CATEGORIES = ["transport", "gentle", "rollercoaster", "thrill", "water", "shop", "scenery"]

// API type name for scenery groups
var SCENERY_API_TYPE = "scenery_group"

// Supported research multipliers and display labels
var MULTIPLIERS = [1.0, 1.5, 2.0, 3.0]
var MULTI_LABELS = ["1.0x", "1.5x", "2.0x", "3.0x"]
var selectedMultiplierIndex = 0

// Identifiers for guaranteed shop items when toggled
var GUARANTEE = {
 CASH_MACHINE: "rct2.ride.atm1",
 INFO_KIOSK: "rct2.ride.infok",
}

// Default scenery groups and toilet block kept fixed in lists
var FIXED_GUARANTEED_IDENTIFIERS = [
 "rct2.scenery_group.scgwalls",
 "rct2.scenery_group.scgpathx",
 "rct2.scenery_group.scgshrub",
 "rct2.scenery_group.scggardn",
 "rct2.scenery_group.scgfence",
 "rct2.scenery_group.scgtrees",
 "rct1.ride.toilets",
]

// UI preferences for guaranteed shop items
var ensureCashMachine = false
var ensureInfoKiosk = false

/* ---------------- Persistent prefs ---------------- */
// Return the sharedStorage key for plugin preferences
function _prefsKey() {
 return NS_RR + ".prefs"
}

// Read persisted user preferences from sharedStorage
function getPrefs() {
 var defaults = { schema: 1, multIdx: 0, cash: false, info: false }
 try {
  var stored = context.sharedStorage.get(_prefsKey())
  if (stored && typeof stored === "object") {
   if (typeof stored.schema !== "number" || stored.schema < 1) stored.schema = 1
   if (typeof stored.multIdx !== "number") stored.multIdx = 0
   if (typeof stored.cash !== "boolean") stored.cash = false
   if (typeof stored.info !== "boolean") stored.info = false
   defaults = stored
  }
 } catch (e) {}
 return defaults
}

// Persist user preferences to sharedStorage
function setPrefs(prefs) {
 try {
  context.sharedStorage.set(_prefsKey(), prefs || {})
 } catch (e) {}
}

// Apply persisted preferences to runtime state
function _applyPrefs() {
 var prefs = getPrefs()
 selectedMultiplierIndex = typeof prefs.multIdx === "number" && prefs.multIdx >= 0 && prefs.multIdx < MULTIPLIERS.length ? prefs.multIdx : 0
 ensureCashMachine = !!prefs.cash
 ensureInfoKiosk = !!prefs.info
}

// Save current runtime preference state
function _savePrefs() {
 setPrefs({ schema: 1, multIdx: selectedMultiplierIndex, cash: !!ensureCashMachine, info: !!ensureInfoKiosk })
}

/* ---------------- UI helpers ---------------- */
// Show a non-blocking warning/error dialog
function warnBox(title, text) {
 if (typeof ui !== "undefined" && ui.showError) ui.showError(title, text)
}

// Show a confirm window; invoke onProceed if accepted
function popupConfirm(title, text, onProceed) {
 if (typeof ui === "undefined") {
  if (onProceed) onProceed()
  return
 }
 var klass = "rr-confirm-" + context.getRandom(0, 1e6)
 ui.openWindow({
  classification: klass,
  title: title,
  width: 460,
  height: 240,
  widgets: [
   { type: "label", x: 12, y: 18, width: 436, height: 160, text: text },
   {
    type: "button",
    x: 100,
    y: 190,
    width: 110,
    height: 20,
    text: "Cancel",
    onClick: function () {
     var w = ui.getWindow(klass)
     if (w) w.close()
    },
   },
   {
    type: "button",
    x: 250,
    y: 190,
    width: 110,
    height: 20,
    text: "Proceed",
    onClick: function () {
     var w = ui.getWindow(klass)
     if (w) w.close()
     if (onProceed) onProceed()
    },
   },
  ],
 })
}

/* ---------------- Object helpers ---------------- */
// Map logical category to API object type
function _apiTypeFor(type) {
 return type === "scenery" ? SCENERY_API_TYPE : type
}

// Validate that a rideType is a usable numeric value
function isValidRideType(rideType) {
 return typeof rideType === "number" && isFinite(rideType) && rideType >= 0 && rideType !== 255
}

// Check whether a category string is recognized
function isKnownCategory(category) {
 for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i] === category) return true
 return false
}

// Build a canonical key for (type, identifier, rideType)
function stableKeyFromParts(type, identifier, rideType) {
 if (type === "ride") {
  return isValidRideType(rideType) ? "ride|" + identifier + "|" + String(rideType) : "ride|" + identifier + "|bad"
 }
 return "scenery|" + identifier
}

// Try to resolve the identifier string given a ref type and index
function tryGetIdentifier(type, index) {
 var apiType = _apiTypeFor(type)
 try {
  var objA = objectManager.getObject(apiType, index)
  if (objA && objA.identifier) return objA.identifier
 } catch (e) {}
 try {
  var objB = context.getObject(apiType, index)
  if (objB && objB.identifier) return objB.identifier
 } catch (e2) {}
 return null
}

// Return a lightweight resolved object handle if the identifier is currently loaded
function resolveLoadedObject(type, identifier) {
 var apiType = _apiTypeFor(type)
 try {
  var all = context.getAllObjects(apiType)
  for (var i = 0; i < all.length; i++) {
   var obj = all[i]
   if (obj && obj.identifier === identifier) {
    if (type === "ride") return { type: "ride", object: obj.index, rideType: obj.rideType, rideTypeSet: obj.rideType && typeof obj.rideType.length === "number" ? obj.rideType : null, name: obj.name }
    if (type === "scenery") return { type: "scenery", object: obj.index, name: obj.name }
   }
  }
 } catch (e) {}
 return null
}

// Ensure an object is loaded by identifier; attempt to load if necessary
function ensureLoaded(type, identifier) {
 if (resolveLoadedObject(type, identifier)) return true
 try {
  if (objectManager && objectManager.load) objectManager.load(identifier)
 } catch (e) {}
 return !!resolveLoadedObject(type, identifier)
}

// Extract a de-duplicated array of rideType values from a ride object
function getRideTypeArray(rideObj) {
 if (!rideObj) return []
 var raw = []
 if (rideObj.rideTypeSet && typeof rideObj.rideTypeSet.length === "number") {
  for (var i = 0; i < rideObj.rideTypeSet.length; i++) raw.push(rideObj.rideTypeSet[i])
 } else if (rideObj.rideType && typeof rideObj.rideType.length === "number") {
  for (var j = 0; j < rideObj.rideType.length; j++) raw.push(rideObj.rideType[j])
 } else if (typeof rideObj.rideType === "number") {
  raw.push(rideObj.rideType)
 }
 var filtered = [],
  seen = {}
 for (var k = 0; k < raw.length; k++) {
  var rt = raw[k]
  if (!isValidRideType(rt)) continue
  var key = String(rt)
  if (!seen[key]) {
   seen[key] = true
   filtered.push(rt)
  }
 }
 return filtered
}

// Choose a usable rideType for identifier, favoring preferredRt if valid
function deriveRideType(identifier, preferredRt) {
 if (!ensureLoaded("ride", identifier)) return null
 var obj = resolveLoadedObject("ride", identifier)
 if (!obj) return null
 var options = getRideTypeArray(obj)
 if (!options.length) return null
 if (isValidRideType(preferredRt)) {
  for (var i = 0; i < options.length; i++) if (options[i] === preferredRt) return preferredRt
 }
 return options[0]
}

/* ---------------- Research helpers ---------------- */
// Snapshot the current research lists into a canonical array of records
function snapshotCanonFromResearch() {
 var research = park.research
 var out = { invented: [], uninvented: [] }
 function push(list, dest) {
  for (var i = 0; i < list.length; i++) {
   var item = list[i]
   if (item == null) continue
   if (item.type !== "ride" && item.type !== "scenery") continue
   var identifier = tryGetIdentifier(item.type, item.object)
   if (!identifier) continue
   var rec = { type: item.type, identifier: identifier, category: item.category }
   if (item.type === "ride" && isValidRideType(item.rideType)) rec.rideType = item.rideType
   if (item.type === "scenery") rec.category = "scenery"
   dest.push(rec)
  }
 }
 push(research.inventedItems, out.invented)
 push(research.uninventedItems, out.uninvented)
 return out
}

// Confirm a research reference has sane shape and values
function _isSaneRefShape(ref) {
 if (!ref) return false
 if (ref.type !== "ride" && ref.type !== "scenery") return false
 if (typeof ref.object !== "number" || !isFinite(ref.object)) return false
 if (ref.type === "ride" && !isValidRideType(ref.rideType)) return false
 if (!isKnownCategory(ref.type === "scenery" ? "scenery" : ref.category)) return false
 return true
}

// Normalize, validate, and de-duplicate the research lists in-place
function sanitizeAndNormalizeResearchLists() {
 try {
  var inv = park.research.inventedItems || []
  var uninv = park.research.uninventedItems || []

  function normalizeRef(raw) {
   if (!raw) return null
   if (raw.type !== "ride" && raw.type !== "scenery") return null
   var id = tryGetIdentifier(raw.type, raw.object)
   if (!id) return null
   if (raw.type === "ride") {
    var rt = raw.rideType
    if (!isValidRideType(rt)) {
     rt = deriveRideType(id, rt)
     if (!isValidRideType(rt)) return null
    }
    var cat = isKnownCategory(raw.category) ? raw.category : null
    return { type: "ride", object: raw.object, rideType: rt, category: cat, __id: id }
   } else {
    return { type: "scenery", object: raw.object, category: "scenery", __id: id }
   }
  }

  var normalizedInv = [],
   normalizedUninv = [],
   i
  for (i = 0; i < inv.length; i++) {
   var a = normalizeRef(inv[i])
   if (a) normalizedInv.push(a)
  }
  for (i = 0; i < uninv.length; i++) {
   var b = normalizeRef(uninv[i])
   if (b) normalizedUninv.push(b)
  }

  var seen = {},
   outInv = [],
   outUn = []

  function pushUnique(list, into) {
   for (var j = 0; j < list.length; j++) {
    var it = list[j]
    if (it.type === "ride" && !isKnownCategory(it.category)) continue
    var key = it.type === "ride" ? stableKeyFromParts("ride", it.__id, it.rideType) : stableKeyFromParts("scenery", it.__id, null)
    if (!seen[key]) {
     seen[key] = true
     var ref = it.type === "ride" ? { type: "ride", object: it.object, rideType: it.rideType, category: it.category } : { type: "scenery", object: it.object, category: "scenery" }
     if (_isSaneRefShape(ref)) into.push(ref)
    }
   }
  }

  pushUnique(normalizedInv, outInv)

  var invSet = {},
   idA,
   kA
  for (i = 0; i < outInv.length; i++) {
   idA = tryGetIdentifier(outInv[i].type, outInv[i].object)
   kA = outInv[i].type === "ride" ? stableKeyFromParts("ride", idA, outInv[i].rideType) : stableKeyFromParts("scenery", idA, null)
   invSet[kA] = true
  }

  for (i = 0; i < normalizedUninv.length; i++) {
   var u = normalizedUninv[i]
   var idU = u.__id
   var kU = u.type === "ride" ? stableKeyFromParts("ride", idU, u.rideType) : stableKeyFromParts("scenery", idU, null)
   if (!invSet[kU] && !seen[kU]) {
    seen[kU] = true
    var ref2 = u.type === "ride" ? { type: "ride", object: u.object, rideType: u.rideType, category: u.category } : { type: "scenery", object: u.object, category: "scenery" }
    if (_isSaneRefShape(ref2)) outUn.push(ref2)
   }
  }

  park.research.inventedItems = outInv
  park.research.uninventedItems = outUn
 } catch (e) {}
}

// Remove any references that no longer resolve to a loaded identifier
function scrubResearchArrays() {
 try {
  var inv = park.research.inventedItems || []
  var uninv = park.research.uninventedItems || []
  function isAlive(ref) {
   return ref && tryGetIdentifier(ref.type, ref.object) !== null
  }
  var i,
   outInv = [],
   outUn = []
  for (i = 0; i < inv.length; i++) if (isAlive(inv[i])) outInv.push(inv[i])
  for (i = 0; i < uninv.length; i++) if (isAlive(uninv[i])) outUn.push(uninv[i])
  park.research.inventedItems = outInv
  park.research.uninventedItems = outUn
 } catch (e) {}
}

// Purge all research refs for a specific typed identifier, honoring a protect set
function purgeResearchRefsForIdentifierTyped(type, identifier, protectSet) {
 try {
  if (protectSet && protectSet[type + "|" + identifier]) return
  var inv = park.research.inventedItems || []
  var uninv = park.research.uninventedItems || []
  function keep(ref) {
   if (!ref) return false
   var id = tryGetIdentifier(ref.type, ref.object)
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

// Purge all ride research refs for a given identifier
function purgeResearchRefsForIdentifier(identifier, protectSet) {
 purgeResearchRefsForIdentifierTyped("ride", identifier, protectSet || {})
}

// Convert canonical records to concrete references, reusing existing where possible
function materializeCanonToRefs(invCanon, uninvCanon) {
 var refMap = {}
 function indexExisting(list) {
  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (!it) continue
   var id = tryGetIdentifier(it.type, it.object)
   if (!id) continue
   var key = it.type === "ride" ? stableKeyFromParts("ride", id, it.rideType) : stableKeyFromParts("scenery", id, null)
   if (!refMap[key]) refMap[key] = it
  }
 }
 indexExisting(park.research.inventedItems)
 indexExisting(park.research.uninventedItems)

 function buildRef(rec) {
  if (rec.type === "ride" && !isValidRideType(rec.rideType)) {
   var fixedRt = deriveRideType(rec.identifier, rec.rideType)
   if (!isValidRideType(fixedRt)) return null
   rec = { type: "ride", identifier: rec.identifier, category: rec.category, rideType: fixedRt }
  }
  var key = rec.type === "ride" ? stableKeyFromParts("ride", rec.identifier, rec.rideType) : stableKeyFromParts("scenery", rec.identifier, null)

  var reuse = refMap[key]
  if (reuse) {
   var reusedRef = { type: reuse.type, object: reuse.object, category: rec.type === "scenery" ? "scenery" : rec.category }
   if (rec.type === "ride") reusedRef.rideType = rec.rideType
   if (_isSaneRefShape(reusedRef)) return reusedRef
  }

  if (!ensureLoaded(rec.type, rec.identifier)) return null
  var obj = resolveLoadedObject(rec.type, rec.identifier)
  if (!obj) return null

  if (rec.type === "ride" && !isValidRideType(rec.rideType)) {
   var rt2 = deriveRideType(rec.identifier, rec.rideType)
   if (!isValidRideType(rt2)) return null
   rec.rideType = rt2
  }

  var out = { type: rec.type, object: obj.object, category: rec.type === "scenery" ? "scenery" : rec.category }
  if (rec.type === "ride") out.rideType = rec.rideType
  if (!_isSaneRefShape(out)) return null
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

// Write concrete references to the game, then scrub and normalize
function applyRefPreserving(invCanon, uninvCanon) {
 var mats = materializeCanonToRefs(invCanon, uninvCanon)
 park.research.inventedItems = mats.inv
 park.research.uninventedItems = mats.uninv
 scrubResearchArrays()
 sanitizeAndNormalizeResearchLists()
}

/* ---------------- Shared storage ---------------- */
// Get a value from sharedStorage with a fallback
function getSS(key, fallback) {
 try {
  var value = context.sharedStorage.get(key)
  return typeof value === "undefined" ? fallback : value
 } catch (e) {
  return fallback
 }
}

// Set a value in sharedStorage
function setSS(key, val) {
 try {
  context.sharedStorage.set(key, val)
 } catch (e) {}
}

// Read the global object catalog (ride-type pairs + scenery groups)
function getCatalogV2() {
 return getSS(NS_RR + ".catalogV2", {})
}

// Persist the global object catalog
function setCatalogV2(cat) {
 setSS(NS_RR + ".catalogV2", cat || {})
}

// Read plugin metadata (timestamps, counters, etc.)
function getMeta() {
 return getSS(NS_RR + ".meta", {})
}

// Persist plugin metadata
function setMeta(m) {
 setSS(NS_RR + ".meta", m || {})
}

// Read the set/map of unusable ride types encountered
function getBadRT() {
 return getSS(NS_RR + ".badRideTypes", {})
}

// Persist the set/map of unusable ride types encountered
function setBadRT(map) {
 setSS(NS_RR + ".badRideTypes", map || {})
}

// Produce a per-level key derived from park name and map size
function levelKey() {
 var name = ""
 try {
  name = park.name || ""
 } catch (e) {}
 var sx = 0,
  sy = 0
 try {
  sx = map && map.size && map.size.x ? map.size.x : 0
  sy = map && map.size && map.size.y ? map.size.y : 0
 } catch (e2) {}
 return name + "|" + sx + "x" + sy
}

// Read the captured per-level baseline, if present
function getBaseline() {
 return getSS(NS_RR + ".baseline." + levelKey(), null)
}

// Persist the per-level baseline snapshot
function setBaseline(baseline) {
 setSS(NS_RR + ".baseline." + levelKey(), baseline || null)
}

// Clear catalog, metadata, bad ride types, and baseline
function purgeCatalog() {
 setCatalogV2({})
 setMeta({})
 setBadRT({})
 setBaseline(null)
 warnBox("Delete Smart Scan data", "Persistent catalog and per-level baseline cleared.")
}

/* ---------------- Loaded object snapshots ---------------- */
// Build a set of currently loaded identifiers for rides and scenery groups
function loadedIdentifierSets() {
 var out = { ride: {}, scenery: {} }
 try {
  var rides = context.getAllObjects("ride")
  for (var i = 0; i < rides.length; i++) if (rides[i] && rides[i].identifier) out.ride[rides[i].identifier] = true
 } catch (e) {}
 try {
  var groups = context.getAllObjects(SCENERY_API_TYPE)
  for (var j = 0; j < groups.length; j++) if (groups[j] && groups[j].identifier) out.scenery[groups[j].identifier] = true
 } catch (e2) {}
 return out
}

/* ---------------- Smart Scan core ---------------- */
// Check if a comprehensive scan is needed and why
function computeScanNeeded() {
 if (!objectManager || !objectManager.installedObjects) return { needed: true, reason: "object list unavailable" }
 var catalog = getCatalogV2(),
  bad = getBadRT(),
  list = objectManager.installedObjects
 function hasAnyRideKey(id) {
  for (var k in catalog)
   if (catalog.hasOwnProperty(k)) {
    if (k.indexOf(id + "|") === 0) return true
   }
  return false
 }
 for (var key in catalog)
  if (catalog.hasOwnProperty(key)) {
   var e = catalog[key]
   if (e && e.type === "ride" && !e.category) {
    if (!bad[String(e.rideType)]) return { needed: true, reason: "uncategorized rides" }
   }
  }
 for (var i = 0; i < list.length; i++) {
  var io = list[i]
  if (!io) continue
  if (io.type === SCENERY_API_TYPE) {
   if (!catalog[io.identifier]) return { needed: true, reason: "new scenery groups" }
  } else if (io.type === "ride") {
   if (!hasAnyRideKey(io.identifier)) return { needed: true, reason: "new rides" }
  }
 }
 return { needed: false, reason: "" }
}

// Load all installed ride/scenery objects that are not yet loaded
function loadAllIfNeeded() {
 if (!objectManager || !objectManager.installedObjects) return { newly: 0, already: 0 }
 var list = objectManager.installedObjects,
  newly = 0,
  already = 0
 for (var i = 0; i < list.length; i++) {
  var io = list[i]
  if (!io || (io.type !== "ride" && io.type !== SCENERY_API_TYPE)) continue
  if (resolveLoadedObject(io.type === SCENERY_API_TYPE ? "scenery" : io.type, io.identifier)) {
   already++
   continue
  }
  try {
   objectManager.load(io.identifier)
   newly++
  } catch (e) {}
 }
 return { newly: newly, already: already }
}

// Build or update the catalog by scanning all installed objects
function scanAllToCatalog() {
 var cat = getCatalogV2(),
  list = objectManager.installedObjects || []
 var ridesSeen = 0,
  groupsSeen = 0,
  pairsAdded = 0,
  pairsTotal = 0
 for (var i = 0; i < list.length; i++) {
  var io = list[i]
  if (!io) continue
  if (io.type === SCENERY_API_TYPE) {
   groupsSeen++
   if (!cat[io.identifier] || cat[io.identifier].type !== "scenery") {
    cat[io.identifier] = { type: "scenery", identifier: io.identifier, category: "scenery" }
    pairsAdded++
   }
   pairsTotal++
   continue
  }
  if (io.type !== "ride") continue
  if (!ensureLoaded("ride", io.identifier)) continue
  var ro = resolveLoadedObject("ride", io.identifier)
  if (!ro) continue
  var rtypes = getRideTypeArray(ro)
  if (!rtypes.length) continue
  ridesSeen++
  for (var r = 0; r < rtypes.length; r++) {
   var rt = rtypes[r],
    key = io.identifier + "|" + String(rt)
   if (!cat[key] || cat[key].type !== "ride" || cat[key].rideType !== rt) {
    cat[key] = { type: "ride", identifier: io.identifier, rideType: rt, name: ro.name || "", category: null }
    pairsAdded++
   }
   pairsTotal++
  }
 }
 setCatalogV2(cat)
 return { ridesSeen: ridesSeen, groupsSeen: groupsSeen, pairsAdded: pairsAdded, pairsTotal: pairsTotal }
}

// Learn rideType->category mappings from current research arrays
function learnRideTypeCategoriesFromResearch(intoMap) {
 var map_ = intoMap || {}
 function harvest(list) {
  for (var i = 0; i < list.length; i++) {
   var it = list[i]
   if (it && it.type === "ride" && isValidRideType(it.rideType) && typeof it.category === "string") map_[String(it.rideType)] = it.category
  }
 }
 harvest(park.research.inventedItems)
 harvest(park.research.uninventedItems)
 return map_
}

// Attempt to derive categories for unknown rideTypes by temporarily inserting them
function probeCategoriesForUnknownRideTypes(rtMap, cat) {
 var bad = getBadRT(),
  unknown = []
 for (var key in cat)
  if (cat.hasOwnProperty(key)) {
   var e = cat[key]
   if (e && e.type === "ride") {
    var rtKey = String(e.rideType)
    if (!rtMap[rtKey] && !bad[rtKey]) unknown.push({ identifier: e.identifier, rideType: e.rideType })
   }
  }
 if (!unknown.length) return { derived: 0 }
 var original = snapshotCanonFromResearch()
 var test = []
 for (var i = 0; i < unknown.length; i++) {
  var p = unknown[i]
  if (!isValidRideType(p.rideType)) {
   bad[String(p.rideType)] = true
   continue
  }
  if (!ensureLoaded("ride", p.identifier)) continue
  var obj = resolveLoadedObject("ride", p.identifier)
  if (!obj) continue
  test.push({ type: "ride", object: obj.object, rideType: p.rideType, category: "gentle" })
 }
 if (!test.length) {
  setBadRT(bad)
  return { derived: 0 }
 }
 park.research.inventedItems = test
 park.research.uninventedItems = []
 var derived = 0,
  seenGood = {}
 var back = park.research.inventedItems
 for (var j = 0; j < back.length; j++) {
  var it = back[j]
  if (isValidRideType(it.rideType) && typeof it.category === "string") {
   rtMap[String(it.rideType)] = it.category
   seenGood[String(it.rideType)] = true
   derived++
  }
 }
 for (var u = 0; u < test.length; u++) {
  var rtKey2 = String(test[u].rideType)
  if (!seenGood[rtKey2]) bad[rtKey2] = true
 }
 setBadRT(bad)
 applyRefPreserving(original.invented, original.uninvented)
 return { derived: derived }
}

// Write known rideType->category mappings back into the catalog
function writeCategoriesToCatalog(rtMap) {
 var cat = getCatalogV2(),
  changed = 0,
  categorized = 0
 for (var key in cat)
  if (cat.hasOwnProperty(key)) {
   var e = cat[key]
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
 setCatalogV2(cat)
 return { changed: changed, categorized: categorized }
}

// Summarize counts per category across the catalog
function summarizeCatalogCategories() {
 var cat = getCatalogV2()
 var counts = { transport: 0, gentle: 0, rollercoaster: 0, thrill: 0, water: 0, shop: 0, scenery: 0 }
 for (var key in cat)
  if (cat.hasOwnProperty(key)) {
   var e = cat[key]
   if (!e || !e.category) continue
   if (counts.hasOwnProperty(e.category)) counts[e.category]++
  }
 return counts
}

/* --- Per-level baseline --- */
// Check if an identifier is one of the default fixed items
function isDefaultFixed(id) {
 for (var i = 0; i < FIXED_GUARANTEED_IDENTIFIERS.length; i++) if (FIXED_GUARANTEED_IDENTIFIERS[i] === id) return true
 return false
}

// Check if identifier refers to a sticky shop (ATM or Info Kiosk)
function isStickyShopIdentifier(id) {
 return id === GUARANTEE.CASH_MACHINE || id === GUARANTEE.INFO_KIOSK
}

// Build a set of ride identifiers currently in use on the map
function collectInUseRideIdentifiers() {
 var set = {}
 try {
  var rides = map && map.rides ? map.rides : []
  for (var i = 0; i < rides.length; i++) {
   var ride = rides[i]
   var ro = ride && ride.object
   var identifier = ro && (ro.identifier || (ro.installedObject && ro.installedObject.identifier))
   if (identifier) set["ride|" + identifier] = true
  }
 } catch (e) {}
 return set
}

// Capture the fixed default items from either invented or uninvented list
function captureDefaultsPosition(original, inventedList) {
 var map_ = {},
  list = inventedList ? original.invented : original.uninvented
 for (var i = 0; i < list.length; i++) {
  var r = list[i]
  if (isDefaultFixed(r.identifier)) {
   if (r.type === "scenery" && !r.category) r.category = "scenery"
   map_[r.identifier] = r
  }
 }
 return map_
}

// Capture sticky shop records that are already in invented
function captureStickyShopsInInvented(original) {
 var map_ = {}
 for (var i = 0; i < original.invented.length; i++) {
  var r = original.invented[i]
  if (r && r.type === "ride" && r.category === "shop" && isStickyShopIdentifier(r.identifier)) map_[r.identifier] = r
 }
 return map_
}

// Ensure a baseline snapshot exists; otherwise create one from current state
function ensureBaselineFromSnapshot(original, inUseSet) {
 var base = getBaseline()
 if (base) return base
 var fixedInv = [],
  fixedUninv = [],
  nonFixedInv = [],
  nonFixedUninv = []
 var stickyInInv = captureStickyShopsInInvented(original)
 function isFixed(rec) {
  return isDefaultFixed(rec.identifier) || (rec.type === "ride" && inUseSet["ride|" + rec.identifier]) || !!stickyInInv[rec.identifier]
 }
 function split(list) {
  for (var i = 0; i < list.length; i++) (isFixed(list[i]) ? (list === original.invented ? fixedInv : fixedUninv) : list === original.invented ? nonFixedInv : nonFixedUninv).push(list[i])
 }
 split(original.invented)
 split(original.uninvented)
 function countByCategory(list) {
  var m = {},
   i
  for (i = 0; i < CATEGORIES.length; i++) m[CATEGORIES[i]] = 0
  for (i = 0; i < list.length; i++) if (m.hasOwnProperty(list[i].category)) m[list[i].category]++
  return m
 }
 var invNonFixedByCat = countByCategory(nonFixedInv)
 var allNonFixedByCat = countByCategory(nonFixedInv.concat(nonFixedUninv))
 var stickyCount = 0
 for (var sid in stickyInInv) if (stickyInInv.hasOwnProperty(sid)) stickyCount++
 if (stickyCount > 0) {
  invNonFixedByCat.shop += stickyCount
  allNonFixedByCat.shop += stickyCount
 }
 var baseObj = {
  schema: 2,
  capturedUtc: Date.now(),
  invNonFixedByCat: invNonFixedByCat,
  allNonFixedByCat: allNonFixedByCat,
  inventedTotalBaseline: original.invented.length,
  defaultsInInvented: captureDefaultsPosition(original, true),
  defaultsInUninvented: captureDefaultsPosition(original, false),
  stickyShopsInInvented: stickyInInv,
  deterministicTargets: {},
 }
 setBaseline(baseObj)
 return baseObj
}

/* --- Deterministic targets --- */
// Compute per-category total targets for a multiplier using round-to-sum logic
function _deterministicTargets(base, multIdx) {
 if (!base.deterministicTargets) base.deterministicTargets = {}
 if (base.deterministicTargets[multIdx]) return base.deterministicTargets[multIdx]
 var mult = MULTIPLIERS[multIdx],
  totalsByCat = base.allNonFixedByCat
 var cats = CATEGORIES.slice(0),
  sumBase = 0
 for (var i = 0; i < cats.length; i++) sumBase += totalsByCat[cats[i]] || 0
 var targetSum = Math.round(sumBase * mult)
 var out = {},
  floorsSum = 0,
  rema = []
 for (var i2 = 0; i2 < cats.length; i2++) {
  var c = cats[i2],
   baseCount = totalsByCat[c] || 0
  var exact = baseCount * mult,
   flo = Math.floor(exact)
  out[c] = flo
  floorsSum += flo
  rema.push({ c: c, frac: exact - flo, order: i2 })
 }
 var need = targetSum - floorsSum
 rema.sort(function (a, b) {
  if (b.frac !== a.frac) return b.frac - a.frac
  return a.order - b.order
 })
 var idx = 0
 while (need > 0 && idx < rema.length) {
  out[rema[idx].c] += 1
  need--
  idx++
 }
 base.deterministicTargets[multIdx] = out
 setBaseline(base)
 return out
}

/* --- Defaults & sticky shops remain --- */
// Reinsert defaults and sticky shops into their original lists
function forceDefaultListMembership(original, invCanon, uninvCanon, base) {
 var defInv = captureDefaultsPosition(original, true)
 var defUninv = captureDefaultsPosition(original, false)
 var stickyInv = base && base.stickyShopsInInvented ? base.stickyShopsInInvented : {}
 function strip(arr) {
  var out = []
  for (var i = 0; i < arr.length; i++) if (!isDefaultFixed(arr[i].identifier) && !stickyInv[arr[i].identifier]) out.push(arr[i])
  return out
 }
 invCanon = strip(invCanon)
 uninvCanon = strip(uninvCanon)
 for (var id in defInv) if (defInv.hasOwnProperty(id)) invCanon.unshift(defInv[id])
 for (var id2 in defUninv) if (defUninv.hasOwnProperty(id2)) uninvCanon.unshift(defUninv[id2])
 for (var sid in stickyInv) if (stickyInv.hasOwnProperty(sid)) invCanon.unshift(stickyInv[sid])
 return { inv: invCanon, uninv: uninvCanon }
}

/* --- Loaded helpers for pruning/unload --- */
// Enumerate loaded rides with their rideTypes and mapped categories
function loadedRidePairs(catalog) {
 var out = []
 try {
  var rides = context.getAllObjects("ride") || []
  for (var i = 0; i < rides.length; i++) {
   var r = rides[i]
   if (!r || !r.identifier) continue
   var types = getRideTypeArray({ rideType: r.rideType, rideTypeSet: r.rideType })
   for (var k = 0; k < types.length; k++) {
    var cat = (catalog[r.identifier + "|" + String(types[k])] || {}).category
    if (!cat) continue
    out.push({ identifier: r.identifier, rideType: types[k], category: cat, name: r.name || "" })
   }
  }
 } catch (e) {}
 return out
}

// Enumerate loaded scenery groups mapped in the catalog
function loadedSceneryGroups(catalog) {
 var out = []
 try {
  var groups = context.getAllObjects(SCENERY_API_TYPE) || []
  for (var i = 0; i < groups.length; i++) {
   var g = groups[i]
   if (!g || !g.identifier) continue
   var e = catalog[g.identifier]
   if (e && e.type === "scenery") out.push({ identifier: g.identifier, category: "scenery", name: g.name || "" })
  }
 } catch (e) {}
 return out
}

// Unload any extra objects not needed to restore original/baseline state
function unloadExtrasToRestore(preLoaded, originalSnap) {
 try {
  var keep = {},
   i
  for (i = 0; i < originalSnap.invented.length; i++) keep[originalSnap.invented[i].type + "|" + originalSnap.invented[i].identifier] = true
  for (i = 0; i < originalSnap.uninvented.length; i++) keep[originalSnap.uninvented[i].type + "|" + originalSnap.uninvented[i].identifier] = true
  var inUse = collectInUseRideIdentifiers()
  var originalScenery = {}
  for (i = 0; i < originalSnap.invented.length; i++) if (originalSnap.invented[i].type === "scenery") originalScenery["scenery|" + originalSnap.invented[i].identifier] = true
  for (i = 0; i < originalSnap.uninvented.length; i++) if (originalSnap.uninvented[i].type === "scenery") originalScenery["scenery|" + originalSnap.uninvented[i].identifier] = true
  var protect = {}
  for (var k in inUse) if (inUse.hasOwnProperty(k)) protect[k] = true
  for (var k2 in originalScenery) if (originalScenery.hasOwnProperty(k2)) protect[k2] = true

  var now = loadedIdentifierSets()
  for (var rid in now.ride)
   if (now.ride.hasOwnProperty(rid)) {
    if (!preLoaded.ride[rid] && !keep["ride|" + rid] && !protect["ride|" + rid]) {
     try {
      objectManager.unload(rid)
     } catch (e) {}
     purgeResearchRefsForIdentifierTyped("ride", rid, protect)
    }
   }
  for (var sg in now.scenery)
   if (now.scenery.hasOwnProperty(sg)) {
    if (!preLoaded.scenery[sg] && !keep["scenery|" + sg] && !protect["scenery|" + sg]) {
     try {
      objectManager.unload(sg)
     } catch (e2) {}
     purgeResearchRefsForIdentifierTyped("scenery", sg, protect)
    }
   }
  scrubResearchArrays()
  sanitizeAndNormalizeResearchLists()
 } catch (e3) {}
}

/* --- Smart Scan --- */
// Perform a smart scan, updating catalog and repairing research arrays
function onSmartScanClicked() {
 var status = computeScanNeeded()
 if (!status.needed) {
  warnBox("Smart Scan", "Scan already complete.")
  return
 }
 var originalSnap = snapshotCanonFromResearch()
 var preLoaded = loadedIdentifierSets()
 var inUseSet = collectInUseRideIdentifiers()
 ensureBaselineFromSnapshot(originalSnap, inUseSet)
 popupConfirm("Smart Scan", "A scan is required (" + status.reason + "). This may briefly freeze the game.\nProceed?", function () {
  loadAllIfNeeded()
  scanAllToCatalog()
  var rtMap = learnRideTypeCategoriesFromResearch({})
  probeCategoriesForUnknownRideTypes(rtMap, getCatalogV2())
  writeCategoriesToCatalog(rtMap)
  summarizeCatalogCategories()
  applyRefPreserving(originalSnap.invented, originalSnap.uninvented)
  unloadExtrasToRestore(preLoaded, originalSnap)
  var meta = getMeta()
  meta.lastScanUtc = Date.now()
  setMeta(meta)
  warnBox("Smart Scan", "Catalog updated.")
  rebuildWindow()
 })
}

/* ---------------- Randomization core helpers ---------------- */
// Shuffle an array in-place using the game's RNG
function shuffleGameRng(arr) {
 for (var i = arr.length - 1; i > 0; i--) {
  var j = context.getRandom(0, i + 1),
   t = arr[i]
  arr[i] = arr[j]
  arr[j] = t
 }
}

// Count records by category for canonical lists
function countByCategoryCanon(list) {
 var m = {},
  i
 for (i = 0; i < CATEGORIES.length; i++) m[CATEGORIES[i]] = 0
 for (i = 0; i < list.length; i++) {
  var c = list[i].category
  if (m.hasOwnProperty(c)) m[c] += 1
 }
 return m
}

// Build a canonical unique key for a canonical record
function recKey(r) {
 return r.type === "ride" ? stableKeyFromParts("ride", r.identifier, r.rideType) : stableKeyFromParts("scenery", r.identifier, null)
}

// Construct per-category candidate pools from original/cached data
function buildPools(original, catalog, inUseSet) {
 var pools = { transport: [], gentle: [], rollercoaster: [], thrill: [], water: [], shop: [], scenery: [] }
 function consider(rec) {
  if (!rec || !rec.identifier || !rec.type) return
  if (isDefaultFixed(rec.identifier)) return
  if (rec.type === "ride" && inUseSet["ride|" + rec.identifier]) return
  if (pools.hasOwnProperty(rec.category)) pools[rec.category].push(rec)
 }
 var i
 for (i = 0; i < original.invented.length; i++) consider(original.invented[i])
 for (i = 0; i < original.uninvented.length; i++) consider(original.uninvented[i])
 for (var key in catalog)
  if (catalog.hasOwnProperty(key)) {
   var e = catalog[key]
   if (!e || !e.category) continue
   if (isDefaultFixed(e.identifier)) continue
   if (e.type === "ride" && inUseSet["ride|" + e.identifier]) continue
   if (e.type === "ride") consider({ type: "ride", identifier: e.identifier, category: e.category, rideType: e.rideType })
   else if (e.type === "scenery") consider({ type: "scenery", identifier: e.identifier, category: "scenery" })
  }
 for (var c = 0; c < CATEGORIES.length; c++) {
  var name = CATEGORIES[c],
   arr = pools[name],
   seen = {},
   out = []
  for (var a = 0; a < arr.length; a++) {
   var k = recKey(arr[a])
   if (!seen[k]) {
    seen[k] = true
    out.push(arr[a])
   }
  }
  pools[name] = out
 }
 return pools
}

// Build canonical invented/uninvented lists from pools and targets
function buildCanonFromPools(pools, targetTotalsByCat, targetInvByCat) {
 var chosenByCat = {}
 for (var i = 0; i < CATEGORIES.length; i++) chosenByCat[CATEGORIES[i]] = []
 for (var cat in pools)
  if (pools.hasOwnProperty(cat)) {
   var pool = pools[cat].slice(0)
   shuffleGameRng(pool)
   var need = Math.max(0, Math.min(pool.length, targetTotalsByCat[cat] || 0))
   for (var k = 0; k < need; k++) chosenByCat[cat].push(pool[k])
  }
 var invCanon = [],
  uninvCanon = []
 for (var ci = 0; ci < CATEGORIES.length; ci++) {
  var cname = CATEGORIES[ci],
   bucket = chosenByCat[cname].slice(0)
  shuffleGameRng(bucket)
  var invNeed = Math.min(targetInvByCat[cname] || 0, bucket.length)
  for (var x = 0; x < bucket.length; x++) (x < invNeed ? invCanon : uninvCanon).push(bucket[x])
 }
 return { inv: invCanon, uninv: uninvCanon }
}

// Build a guaranteed record (shop) for a specific identifier if possible
function ensureGuaranteedRecord(identifier, catalog) {
 ensureLoaded("ride", identifier)
 var o = resolveLoadedObject("ride", identifier)
 var rt = null
 for (var k in catalog)
  if (catalog.hasOwnProperty(k)) {
   var e = catalog[k]
   if (e && e.type === "ride" && e.identifier === identifier) {
    rt = e.rideType
    break
   }
  }
 if (!isValidRideType(rt) && o) {
  var arr = getRideTypeArray(o)
  if (arr.length) rt = arr[0]
 }
 if (!isValidRideType(rt)) return null
 return { type: "ride", identifier: identifier, rideType: rt, category: "shop" }
}

/* --- culling with squared duplicate penalty --- */
// Unload/prune loaded objects to match category targets while protecting defaults/in-use
function pruneLoadedToTargets(targetTotalsByCat, invCanon, uninvCanon, catalog, originalSnap) {
 var inUseSet = collectInUseRideIdentifiers()
 var originalScenery = {},
  i
 for (i = 0; i < originalSnap.invented.length; i++) if (originalSnap.invented[i].type === "scenery") originalScenery["scenery|" + originalSnap.invented[i].identifier] = true
 for (i = 0; i < originalSnap.uninvented.length; i++) if (originalSnap.uninvented[i].type === "scenery") originalScenery["scenery|" + originalSnap.uninvented[i].identifier] = true
 var protect = {}
 for (var k in inUseSet) if (inUseSet.hasOwnProperty(k)) protect[k] = true
 for (var k2 in originalScenery) if (originalScenery.hasOwnProperty(k2)) protect[k2] = true

 var canonSet = {},
  key
 for (i = 0; i < invCanon.length; i++) canonSet[recKey(invCanon[i])] = true
 for (i = 0; i < uninvCanon.length; i++) canonSet[recKey(uninvCanon[i])] = true

 var loadedPairs = loadedRidePairs(catalog)
 var rideBuckets = { transport: [], gentle: [], rollercoaster: [], thrill: [], water: [], shop: [] }
 for (i = 0; i < loadedPairs.length; i++) {
  var p = loadedPairs[i]
  if (!rideBuckets[p.category]) continue
  var fixedDefault = isDefaultFixed(p.identifier)
  var inUse = !!inUseSet["ride|" + p.identifier]
  var inCanon = !!canonSet["ride|" + p.identifier + "|" + p.rideType]
  rideBuckets[p.category].push({ id: p.identifier, rt: p.rideType, inCanon: inCanon, fixed: fixedDefault || inUse })
 }
 for (var c = 0; c < CATEGORIES.length; c++) {
  var cat = CATEGORIES[c]
  if (cat === "scenery") continue
  var arr = rideBuckets[cat] || [],
   nonFixed = [],
   canonCount = 0
  for (i = 0; i < arr.length; i++) {
   if (arr[i].fixed) continue
   if (arr[i].inCanon) canonCount++
   nonFixed.push(arr[i])
  }
  var target = Math.max(0, targetTotalsByCat[cat] || 0)
  var current = nonFixed.length
  if (current <= target) continue
  var extras = []
  for (i = 0; i < nonFixed.length; i++) if (!nonFixed[i].inCanon) extras.push(nonFixed[i])
  if (!extras.length) continue
  while (current > target && extras.length) {
   var rtFreq = {}
   for (i = 0; i < extras.length; i++) {
    var keyRT = String(extras[i].rt)
    rtFreq[keyRT] = (rtFreq[keyRT] || 0) + 1
   }
   var weights = []
   for (i = 0; i < extras.length; i++) {
    var cnt = rtFreq[String(extras[i].rt)] || 0
    var w = cnt * cnt
    if (w < 1) w = 1
    weights.push(w)
   }
   var idx = (function (arrX, w) {
    var total = 0
    for (var q = 0; q < w.length; q++) total += w[q]
    if (total <= 0) return -1
    var r_ = context.getRandom(0, total),
     acc = 0
    for (var j = 0; j < w.length; j++) {
     acc += w[j]
     if (r_ < acc) return j
    }
    return arrX.length - 1
   })(extras, weights)
   if (idx < 0) break
   var victim = extras[idx]
   if (!protect["ride|" + victim.id] && !isDefaultFixed(victim.id)) {
    try {
     objectManager.unload(victim.id)
    } catch (e) {}
    purgeResearchRefsForIdentifierTyped("ride", victim.id, protect)
    scrubResearchArrays()
    sanitizeAndNormalizeResearchLists()
    current--
   }
   extras.splice(idx, 1)
  }
 }

 var loadedGroups = loadedSceneryGroups(catalog)
 var sceneryNonFixed = []
 for (i = 0; i < loadedGroups.length; i++) {
  var g = loadedGroups[i]
  var fixed = isDefaultFixed(g.identifier) || !!protect["scenery|" + g.identifier]
  var inCanonSc = !!canonSet["scenery|" + g.identifier]
  if (!fixed) sceneryNonFixed.push({ id: g.identifier, inCanon: inCanonSc })
 }
 var targetScenery = Math.max(0, targetTotalsByCat.scenery || 0)
 var currentScenery = sceneryNonFixed.length
 if (currentScenery > targetScenery) {
  var extrasSc = []
  for (i = 0; i < sceneryNonFixed.length; i++) if (!sceneryNonFixed[i].inCanon) extrasSc.push(sceneryNonFixed[i])
  while (currentScenery > targetScenery && extrasSc.length) {
   var idxSc = context.getRandom(0, extrasSc.length)
   if (idxSc < 0 || idxSc >= extrasSc.length) break
   var victimSc = extrasSc[idxSc]
   if (!protect["scenery|" + victimSc.id] && !isDefaultFixed(victimSc.id)) {
    try {
     objectManager.unload(victimSc.id)
    } catch (e4) {}
    purgeResearchRefsForIdentifierTyped("scenery", victimSc.id, protect)
    scrubResearchArrays()
    sanitizeAndNormalizeResearchLists()
    currentScenery--
   }
   extrasSc.splice(idxSc, 1)
  }
 }
}

/* ---------------- HARD RESET between runs ---------------- */
// Build baseline canonical lists that restore defaults/in-use before a second run
function _baselineCanonForReset() {
 var original = snapshotCanonFromResearch()
 var base = getBaseline()
 var inUseSet = collectInUseRideIdentifiers()
 var catalog = getCatalogV2()

 var invCanon = [],
  uninvCanon = []
 function pushDefault(map_, intoInv) {
  for (var id in map_)
   if (map_.hasOwnProperty(id)) {
    var rec = map_[id]
    if (rec.type === "scenery") {
     invCanon.push({ type: "scenery", identifier: id, category: "scenery" })
    } else if (rec.type === "ride") {
     var rt = isValidRideType(rec.rideType) ? rec.rideType : deriveRideType(id, rec.rideType)
     if (isValidRideType(rt)) {
      ;(intoInv ? invCanon : uninvCanon).push({ type: "ride", identifier: id, category: rec.category || "shop", rideType: rt })
     }
    }
   }
 }
 if (base) {
  pushDefault(base.defaultsInInvented || {}, true)
  pushDefault(base.defaultsInUninvented || {}, false)
  pushDefault(base.stickyShopsInInvented || {}, true)
 } else {
  var invDef = captureDefaultsPosition(original, true)
  var unDef = captureDefaultsPosition(original, false)
  pushDefault(invDef, true)
  pushDefault(unDef, false)
 }
 for (var k in inUseSet)
  if (inUseSet.hasOwnProperty(k)) {
   var parts = k.split("|"),
    identifier = parts[1],
    already = false,
    i
   for (i = 0; i < invCanon.length; i++) if (invCanon[i].type === "ride" && invCanon[i].identifier === identifier) already = true
   for (i = 0; i < uninvCanon.length; i++) if (uninvCanon[i].type === "ride" && uninvCanon[i].identifier === identifier) already = true
   if (!already) {
    var rtFound = null
    for (var ck in catalog)
     if (catalog.hasOwnProperty(ck)) {
      var e = catalog[ck]
      if (e && e.type === "ride" && e.identifier === identifier && isKnownCategory(e.category)) {
       rtFound = e.rideType
       invCanon.push({ type: "ride", identifier: identifier, rideType: rtFound, category: e.category })
       break
      }
     }
    if (!rtFound) {
     rtFound = deriveRideType(identifier, null)
     if (isValidRideType(rtFound)) invCanon.push({ type: "ride", identifier: identifier, rideType: rtFound, category: "gentle" })
    }
   }
  }
 var seen = {}
 function dedupe(list) {
  var out = []
  for (var i = 0; i < list.length; i++) {
   var k2 = list[i].type === "ride" ? stableKeyFromParts("ride", list[i].identifier, list[i].rideType) : stableKeyFromParts("scenery", list[i].identifier, null)
   if (!seen[k2]) {
    seen[k2] = true
    out.push(list[i])
   }
  }
  return out
 }
 invCanon = dedupe(invCanon)
 uninvCanon = dedupe(uninvCanon)
 return { inv: invCanon, uninv: uninvCanon }
}

// Perform a hard reset to baseline before a subsequent randomization run
function hardResetTechnologyBeforeSecondRun() {
 var preLoaded = loadedIdentifierSets()
 var canon = _baselineCanonForReset()
 applyRefPreserving(canon.inv, canon.uninv)
 unloadExtrasToRestore(preLoaded, { invented: canon.inv, uninvented: canon.uninv })
 var m = getMeta()
 if (m.reassert) m.reassert = null
 setMeta(m)
}

/* ---------------- REPAIR-ONLY WATCHDOG (new) ---------------- */
// Aggressively rebuild research arrays in-place to remove dupes/stale refs
function deepDedupeRepairResearch() {
 try {
  function repairList(list) {
   var out = [],
    seen = {},
    i
   for (i = 0; i < list.length; i++) {
    var it = list[i]
    if (!it || (it.type !== "ride" && it.type !== "scenery")) continue
    var id = tryGetIdentifier(it.type, it.object)
    if (!id) continue
    if (it.type === "ride") {
     var rt = isValidRideType(it.rideType) ? it.rideType : deriveRideType(id, it.rideType)
     if (!isValidRideType(rt)) continue
     ensureLoaded("ride", id)
     var obj = resolveLoadedObject("ride", id)
     if (!obj) continue
     var rec = { type: "ride", object: obj.object, rideType: rt, category: isKnownCategory(it.category) ? it.category : null }
     if (!isKnownCategory(rec.category)) continue
     var key = "ride|" + id + "|" + String(rt)
     if (!seen[key]) {
      seen[key] = true
      out.push(rec)
     }
    } else {
     ensureLoaded("scenery", id)
     var sg = resolveLoadedObject("scenery", id)
     if (!sg) continue
     var keyS = "scenery|" + id
     if (!seen[keyS]) {
      seen[keyS] = true
      out.push({ type: "scenery", object: sg.object, category: "scenery" })
     }
    }
   }
   return out
  }
  var inv = repairList(park.research.inventedItems || [])
  var uninv = repairList(park.research.uninventedItems || [])
  var invSet = {},
   i
  for (i = 0; i < inv.length; i++) {
   var iid = tryGetIdentifier(inv[i].type, inv[i].object)
   var k = inv[i].type === "ride" ? "ride|" + iid + "|" + String(inv[i].rideType) : "scenery|" + iid
   invSet[k] = true
  }
  var outUn = []
  for (i = 0; i < uninv.length; i++) {
   var uid = tryGetIdentifier(uninv[i].type, uninv[i].object)
   var k2 = uninv[i].type === "ride" ? "ride|" + uid + "|" + String(uninv[i].rideType) : "scenery|" + uid
   if (!invSet[k2]) outUn.push(uninv[i])
  }
  park.research.inventedItems = inv
  park.research.uninventedItems = outUn
 } catch (e) {}
}

// Subscribe a daily repair hook that only dedupes/repairs (no reassert)
var GUARD_HOOKED = false
function hookRepairGuard() {
 if (GUARD_HOOKED) return
 try {
  context.subscribe("interval.day", function () {
   deepDedupeRepairResearch()
  })
  GUARD_HOOKED = true
 } catch (e) {}
}
hookRepairGuard()

/* ---------------- Randomize ---------------- */
// Main click handler: randomize research while honoring fixed defaults & targets
function onRandomizeClicked() {
 var status = computeScanNeeded()
 if (status.needed) {
  warnBox("Randomize", "Please run Smart Scan first.")
  return
 }

 // Pre-scrub any lingering/hung refs before we snapshot
 deepDedupeRepairResearch()

 var catalog = getCatalogV2()
 var original = snapshotCanonFromResearch()
 var inUseSet = collectInUseRideIdentifiers()
 var base = ensureBaselineFromSnapshot(original, inUseSet)

 var m0 = getMeta(),
  lk0 = levelKey(),
  cnt = (m0.randomizeCountByLevel && m0.randomizeCountByLevel[lk0]) || 0
 if (cnt >= 1) {
  hardResetTechnologyBeforeSecondRun()
  deepDedupeRepairResearch()
  original = snapshotCanonFromResearch()
 }

 var fixedInv = [],
  fixedUninv = [],
  nonFixedInv = [],
  nonFixedUninv = []
 function isFixed(rec) {
  return isDefaultFixed(rec.identifier) || (rec.type === "ride" && inUseSet["ride|" + rec.identifier]) || (base.stickyShopsInInvented && base.stickyShopsInInvented[rec.identifier])
 }
 function split(list, intoFixed, intoNon) {
  for (var i = 0; i < list.length; i++) (isFixed(list[i]) ? intoFixed : intoNon).push(list[i])
 }
 split(original.invented, fixedInv, nonFixedInv)
 split(original.uninvented, fixedUninv, nonFixedUninv)

 var targetTotalsByCat = _deterministicTargets(base, selectedMultiplierIndex)

 var neededNonFixedInventedTotal = Math.max(0, (base.inventedTotalBaseline || 0) - fixedInv.length)
 var baselineInvTotal = 0
 for (var ii = 0; ii < CATEGORIES.length; ii++) baselineInvTotal += base.invNonFixedByCat[CATEGORIES[ii]] || 0
 var invTargets = {},
  sum = 0,
  rems = {},
  cat,
  i2
 if (baselineInvTotal > 0) {
  for (i2 = 0; i2 < CATEGORIES.length; i2++) {
   cat = CATEGORIES[i2]
   var raw = (base.invNonFixedByCat[cat] || 0) * (neededNonFixedInventedTotal / baselineInvTotal)
   var flo = Math.floor(raw)
   invTargets[cat] = flo
   sum += flo
   rems[cat] = raw - flo
  }
  var delta = neededNonFixedInventedTotal - sum
  while (delta > 0) {
   var best = null,
    bestRem = -1
   for (cat in rems)
    if (rems.hasOwnProperty(cat))
     if (rems[cat] > bestRem) {
      bestRem = rems[cat]
      best = cat
     }
   if (best === null) break
   invTargets[best] += 1
   rems[best] = 0
   delta--
  }
 } else {
  for (i2 = 0; i2 < CATEGORIES.length; i2++) invTargets[CATEGORIES[i2]] = 0
 }

 var pools = buildPools(original, catalog, inUseSet)
 var canon = buildCanonFromPools(pools, targetTotalsByCat, invTargets)
 var invCanon = fixedInv.concat(canon.inv),
  uninvCanon = fixedUninv.concat(canon.uninv)

 var enforced = forceDefaultListMembership(original, invCanon, uninvCanon, base)
 invCanon = enforced.inv
 uninvCanon = enforced.uninv

 var guarantees = []
 var g1 = ensureCashMachine ? ensureGuaranteedRecord(GUARANTEE.CASH_MACHINE, catalog) : null
 var g2 = ensureInfoKiosk ? ensureGuaranteedRecord(GUARANTEE.INFO_KIOSK, catalog) : null
 if (g1) guarantees.push(g1)
 if (g2) guarantees.push(g2)
 ;(function dedupeOnce() {
  var seen = {},
   out = [],
   i
  for (i = 0; i < invCanon.length; i++) {
   var k = recKey(invCanon[i])
   if (!seen[k]) {
    seen[k] = true
    out.push(invCanon[i])
   }
  }
  invCanon = out
  var invSet = {},
   out2 = []
  for (i = 0; i < invCanon.length; i++) invSet[recKey(invCanon[i])] = true
  for (i = 0; i < uninvCanon.length; i++) if (!invSet[recKey(uninvCanon[i])]) out2.push(uninvCanon[i])
  uninvCanon = out2
 })()

 var targetInventedTotalNoGuar = base.inventedTotalBaseline || 0
 var overflow = invCanon.length - targetInventedTotalNoGuar
 if (overflow > 0) {
  for (var m = invCanon.length - 1; m >= 0 && overflow > 0; m--) {
   var r = invCanon[m]
   var fixed = isDefaultFixed(r.identifier) || (r.type === "ride" && inUseSet["ride|" + r.identifier]) || (base.stickyShopsInInvented && base.stickyShopsInInvented[r.identifier])
   if (fixed) continue
   uninvCanon.push(r)
   invCanon.splice(m, 1)
   overflow--
  }
 } else if (overflow < 0) {
  overflow = -overflow
  while (overflow > 0 && uninvCanon.length > 0) {
   invCanon.push(uninvCanon.pop())
   overflow--
  }
 }
 for (var g = 0; g < guarantees.length; g++) if (guarantees[g]) invCanon.push(guarantees[g])

 shuffleGameRng(invCanon)
 shuffleGameRng(uninvCanon)

 applyRefPreserving(invCanon, uninvCanon)
 pruneLoadedToTargets(_deterministicTargets(base, selectedMultiplierIndex), invCanon, uninvCanon, getCatalogV2(), original)
 applyRefPreserving(invCanon, uninvCanon)

 // Post-write: immediately repair any stale/duplicate refs to kill “daily spawners”
 deepDedupeRepairResearch()

 var mmeta = getMeta(),
  lk = levelKey()
 if (!mmeta.randomizeCountByLevel) mmeta.randomizeCountByLevel = {}
 mmeta.randomizeCountByLevel[lk] = (mmeta.randomizeCountByLevel[lk] || 0) + 1
 setMeta(mmeta)

 rebuildWindow()
}

/* ---------------- UI ---------------- */
// Dropdown handler: set selected research multiplier
function onSetMultiplier(idx) {
 if (idx >= 0 && idx < MULTIPLIERS.length) selectedMultiplierIndex = idx
 _savePrefs()
 rebuildWindow()
}

// Checkbox handler: toggle guaranteed Cash Machine
function onToggleCash(b) {
 ensureCashMachine = !!b
 _savePrefs()
}

// Checkbox handler: toggle guaranteed Info Kiosk
function onToggleInfo(b) {
 ensureInfoKiosk = !!b
 _savePrefs()
}

// Close and reopen the main window to reflect current state
function rebuildWindow() {
 if (typeof ui === "undefined") return
 var w = ui.getWindow("research-randomizer")
 if (w) w.close()
 openWindow()
}

// Open (or re-open) the main plugin window
function openWindow() {
 if (typeof ui === "undefined") return
 _applyPrefs()
 var y = 46
 var widgets = [
  { type: "button", x: 12, y: 18, width: 336, height: 20, text: "Smart Scan", onClick: onSmartScanClicked },
  { type: "button", x: 12, y: y, width: 336, height: 18, text: "Delete Smart Scan data", onClick: purgeCatalog },
  { type: "label", x: 12, y: y + 24, width: 120, height: 12, text: "Research Multiplier:" },
  { type: "dropdown", x: 140, y: y + 22, width: 208, height: 14, items: MULTI_LABELS, selectedIndex: selectedMultiplierIndex, onChange: onSetMultiplier },
  { type: "checkbox", x: 12, y: y + 44, width: 200, height: 14, text: "Start with Cash Machine", isChecked: ensureCashMachine, onChange: onToggleCash },
  { type: "checkbox", x: 12, y: y + 62, width: 200, height: 14, text: "Start with Info Kiosk", isChecked: ensureInfoKiosk, onChange: onToggleInfo },
  { type: "button", x: 12, y: y + 86, width: 336, height: 20, text: "Randomize Research", onClick: onRandomizeClicked },
 ]
 var height = y + 118
 ui.openWindow({ classification: "research-randomizer", width: 360, height: height, title: "Research Randomizer", widgets: widgets })
}

// Plugin entry point: apply prefs, repair once, and register menu item
function main() {
 _applyPrefs()
 // Initial repair at load in case the save already contains a “daily spawner”
 deepDedupeRepairResearch()
 if (typeof ui !== "undefined") ui.registerMenuItem("Research Randomizer", openWindow)
}

/* ---------------- Boilerplate ---------------- */
// DO NOT CHANGE: Standardized plugin metadata block
registerPlugin({ name: "research-randomizer", version: "1.0", authors: ["PlateGlassArmour"], type: "remote", licence: "MIT", targetApiVersion: 80, minApiVersion: 60, main: main })
