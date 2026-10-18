import Foundation

// Reads the outfit summary the app writes into the App Group container after each recommendation
// snapshot save (ADR 0042 section 3). The file is a derived feed: this code only reads it, and a
// file that fails any check below reads as stale, never as yesterday's outfit.

let kuyaraAppGroup = "group.com.ubrn.kuyara"

struct OutfitSummary: Decodable, Sendable {
  struct Labels: Decodable, Sendable {
    let chosenFor: String?
    let anotherOption: String
  }

  struct Outfit: Decodable, Sendable {
    let optionId: String
    let name: String
    let pieces: [String]
  }

  let version: Int
  let language: String
  let timeZone: String
  let validFrom: Date
  let validUntil: Date
  let spokenLine: String
  let labels: Labels
  let outfits: [Outfit]
}

enum OutfitSummaryState: Sendable {
  // A valid summary for the current dressing day with at least one outfit.
  case outfits(OutfitSummary)
  // A valid summary for the current dressing day that holds no outfit: its spoken line says so.
  case noOutfit(OutfitSummary)
  // Absent, unreadable, of an unknown version, from another time zone or outside its window.
  // `language` is the file's language when the file could still be read that far.
  case stale(language: String?)
}

enum OutfitSummaryReader {
  static let fileName = "outfit-summary.json"
  static let supportedVersion = 1

  static func read(now: Date = Date()) -> OutfitSummaryState {
    guard
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: kuyaraAppGroup),
      let data = try? Data(contentsOf: container.appending(path: fileName, directoryHint: .notDirectory))
    else {
      return .stale(language: nil)
    }
    return decode(data, now: now, timeZone: TimeZone.current.identifier)
  }

  static func decode(_ data: Data, now: Date, timeZone: String) -> OutfitSummaryState {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let container = try decoder.singleValueContainer()
      let text = try container.decode(String.self)
      if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text) {
        return date
      }
      return try Date.ISO8601FormatStyle().parse(text)
    }
    let language = (try? decoder.decode(LanguageEnvelope.self, from: data))?.language
    guard
      let summary = try? decoder.decode(OutfitSummary.self, from: data),
      summary.version == supportedVersion,
      summary.timeZone == timeZone,
      summary.validFrom <= now,
      now < summary.validUntil
    else {
      return .stale(language: language)
    }
    return summary.outfits.isEmpty ? .noOutfit(summary) : .outfits(summary)
  }

  private struct LanguageEnvelope: Decodable {
    let language: String?
  }
}

// The card shows one outfit at a time. The shown outfit's option id is kept in the app's own
// UserDefaults together with the summary's validUntil, so a new dressing day or a new file
// window starts again at kuyara's first pick. This is the only thing these intents write.
enum OutfitCardPosition {
  private static let optionIdKey = "siriOutfitCard.optionId"
  private static let validUntilKey = "siriOutfitCard.validUntil"

  static func currentIndex(in summary: OutfitSummary) -> Int {
    storedIndex(in: summary) ?? 0
  }

  static func showFirst(of summary: OutfitSummary) {
    store(summary.outfits.first?.optionId, validUntil: summary.validUntil)
  }

  // The next outfit after the shown one, or the first when the shown one is no longer in the file.
  static func advance(in summary: OutfitSummary) {
    guard !summary.outfits.isEmpty else { return }
    let next = storedIndex(in: summary).map { ($0 + 1) % summary.outfits.count } ?? 0
    store(summary.outfits[next].optionId, validUntil: summary.validUntil)
  }

  private static func storedIndex(in summary: OutfitSummary) -> Int? {
    let defaults = UserDefaults.standard
    guard
      defaults.double(forKey: validUntilKey) == summary.validUntil.timeIntervalSince1970,
      let optionId = defaults.string(forKey: optionIdKey)
    else {
      return nil
    }
    return summary.outfits.firstIndex { $0.optionId == optionId }
  }

  private static func store(_ optionId: String?, validUntil: Date) {
    let defaults = UserDefaults.standard
    defaults.set(optionId, forKey: optionIdKey)
    defaults.set(validUntil.timeIntervalSince1970, forKey: validUntilKey)
  }
}
