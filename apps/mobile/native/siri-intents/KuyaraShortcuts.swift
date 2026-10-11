import AppIntents

// The app's only two App Shortcuts. Every phrase carries the app name; the Turkish phrases are in
// AppShortcuts.xcstrings, keyed by the English ones.
struct KuyaraShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: ShowTodayOutfitIntent(),
      phrases: [
        "What should I wear today in \(.applicationName)?",
        "What's my outfit today in \(.applicationName)?",
        "Show today's outfit in \(.applicationName)",
      ],
      shortTitle: LocalizedStringResource("Today's Outfit", table: "SiriIntents"),
      systemImageName: "tshirt"
    )
    AppShortcut(
      intent: AddToClosetIntent(),
      phrases: [
        "Add to my Closet in \(.applicationName)",
        "Add a piece to my Closet in \(.applicationName)",
        "Add clothes to \(.applicationName)",
      ],
      shortTitle: LocalizedStringResource("Add to Closet", table: "SiriIntents"),
      systemImageName: "plus"
    )
  }
}
