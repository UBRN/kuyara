import Foundation
import UIKit

// Deep links into the app. Every dynamic part is percent-encoded with only the URI unreserved
// characters left as they are (":" becomes "%3A"), so the app's router decodes each part once.
enum KuyaraLink {
  private static let unreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  )

  static let home = URL(string: "kuyara:///")!

  // The outfit detail route, `/[id]`.
  static func outfit(optionId: String) -> URL {
    URL(string: "kuyara:///" + encode(optionId))!
  }

  // The Closet add form with the phrase the person said; the app's matcher reads it there.
  static func closetAdd(phrase: String) -> URL {
    URL(string: "kuyara:///wardrobe/new?phrase=" + encode(phrase))!
  }

  static func encode(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? ""
  }

  // The system refuses `OpenURLIntent` for a custom scheme ("launch is prohibited"), so an
  // intent that opens the app runs in the foreground and hands the link to the app itself,
  // which routes it like any other `kuyara://` link.
  @MainActor
  static func open(_ url: URL) async {
    _ = await UIApplication.shared.open(url)
  }
}

// The few lines the binary carries itself (ADR 0042 section 3). They are read in the summary
// file's language when the file names one, otherwise in the app's current localization.
struct CardStrings: Sendable {
  static let table = "SiriIntents"

  let bundle: Bundle

  init(language: String?) {
    if
      let language, ["tr", "en"].contains(language),
      let path = Bundle.main.path(forResource: language, ofType: "lproj"),
      let bundle = Bundle(path: path)
    {
      self.bundle = bundle
    } else {
      self.bundle = .main
    }
  }

  var staleLine: String {
    bundle.localizedString(forKey: "Today's outfit is ready when you open kuyara.", value: nil, table: Self.table)
  }

  var openKuyara: String {
    bundle.localizedString(forKey: "Open kuyara", value: nil, table: Self.table)
  }

  var openOutfitHint: String {
    bundle.localizedString(forKey: "Opens this outfit in kuyara.", value: nil, table: Self.table)
  }
}
