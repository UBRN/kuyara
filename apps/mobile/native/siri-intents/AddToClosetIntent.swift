import AppIntents
import Foundation

// "Add to my Closet in kuyara" (ADR 0042 section 2): Siri asks for the piece in its own words and
// the app opens at the Closet add form with that phrase. The intent matches nothing and saves
// nothing; the person confirms in the app.
struct AddToClosetIntent: AppIntent {
  static let title = LocalizedStringResource("Add to Closet", table: "SiriIntents")
  static let description = IntentDescription(
    LocalizedStringResource("Opens the Closet's add form with the piece you name.", table: "SiriIntents")
  )

  @Parameter(
    title: LocalizedStringResource("Piece", table: "SiriIntents"),
    requestValueDialog: IntentDialog(LocalizedStringResource("Which piece would you like to add?", table: "SiriIntents"))
  )
  var phrase: String

  static let supportedModes: IntentModes = .foreground(.immediate)

  @MainActor
  func perform() async throws -> some IntentResult {
    let trimmed = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw $phrase.needsValueError()
    }
    await KuyaraLink.open(KuyaraLink.closetAdd(phrase: trimmed))
    return .result()
  }
}
