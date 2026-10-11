import AppIntents
import Foundation

// The Siri outfit card (ADR 0042 section 1). The card reads the summary file only; it generates
// nothing, calls no network and writes nothing but the shown outfit's id (OutfitCardPosition).

struct ShowTodayOutfitIntent: AppIntent {
  static let title = LocalizedStringResource("Today's Outfit", table: "SiriIntents")
  static let description = IntentDescription(
    LocalizedStringResource("Shows today's outfit from kuyara.", table: "SiriIntents")
  )

  func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetIntent {
    let line: String
    switch OutfitSummaryReader.read() {
    case .outfits(let summary):
      OutfitCardPosition.showFirst(of: summary)
      line = summary.spokenLine
    case .noOutfit(let summary):
      line = summary.spokenLine
    case .stale(let language):
      line = CardStrings(language: language).staleLine
    }
    return .result(dialog: "\(line)", snippetIntent: OutfitCardSnippetIntent())
  }
}

struct OutfitCardSnippetIntent: SnippetIntent {
  static let title = LocalizedStringResource("Outfit Card", table: "SiriIntents")
  static let isDiscoverable = false

  // Re-reads the file on every run, so a redraw after "Another option" shows the current file.
  @MainActor
  func perform() async throws -> some IntentResult & ShowsSnippetView {
    switch OutfitSummaryReader.read() {
    case .outfits(let summary):
      let outfit = summary.outfits[OutfitCardPosition.currentIndex(in: summary)]
      return .result(view: OutfitCardView(content: .outfit(outfit, summary: summary)))
    case .noOutfit(let summary):
      return .result(view: OutfitCardView(content: .message(summary.spokenLine, CardStrings(language: summary.language))))
    case .stale(let language):
      let strings = CardStrings(language: language)
      return .result(view: OutfitCardView(content: .message(strings.staleLine, strings)))
    }
  }
}

struct NextOutfitIntent: AppIntent {
  static let title = LocalizedStringResource("Another Option", table: "SiriIntents")
  static let isDiscoverable = false

  // The system re-runs the card's snippet intent after this returns.
  func perform() async throws -> some IntentResult {
    if case .outfits(let summary) = OutfitSummaryReader.read() {
      OutfitCardPosition.advance(in: summary)
    }
    return .result()
  }
}

struct OpenOutfitIntent: AppIntent {
  static let title = LocalizedStringResource("Open Outfit", table: "SiriIntents")
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .foreground(.immediate)

  @Parameter(title: LocalizedStringResource("Outfit", table: "SiriIntents"))
  var optionId: String

  init() {}

  init(optionId: String) {
    self.optionId = optionId
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    await KuyaraLink.open(KuyaraLink.outfit(optionId: optionId))
    return .result()
  }
}

struct OpenKuyaraIntent: AppIntent {
  static let title = LocalizedStringResource("Open kuyara", table: "SiriIntents")
  static let isDiscoverable = false
  static let supportedModes: IntentModes = .foreground(.immediate)

  @MainActor
  func perform() async throws -> some IntentResult {
    await KuyaraLink.open(KuyaraLink.home)
    return .result()
  }
}
