import AppIntents
import SwiftUI

// The snippet card: system fonts and colors only, compact, no glow or haptic (ADR 0042 section 1).
struct OutfitCardView: View {
  enum Content {
    case outfit(OutfitSummary.Outfit, summary: OutfitSummary)
    case message(String, CardStrings)
  }

  let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      switch content {
      case .outfit(let outfit, let summary):
        outfitBody(outfit, summary: summary)
      case .message(let line, let strings):
        Text(line)
          .font(.body)
          .fixedSize(horizontal: false, vertical: true)
        Button(intent: OpenKuyaraIntent()) {
          Text(strings.openKuyara)
        }
        .buttonStyle(.bordered)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding()
  }

  @ViewBuilder
  private func outfitBody(_ outfit: OutfitSummary.Outfit, summary: OutfitSummary) -> some View {
    Button(intent: OpenOutfitIntent(optionId: outfit.optionId)) {
      VStack(alignment: .leading, spacing: 4) {
        Text(outfit.name)
          .font(.headline)
          .foregroundStyle(.primary)
          .lineLimit(2)
        Text(outfit.pieces.formatted(.list(type: .and).locale(Locale(identifier: summary.language))))
          .font(.subheadline)
          .foregroundStyle(.primary)
          .lineLimit(3)
        if let chosenFor = summary.labels.chosenFor {
          Text(chosenFor)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint(CardStrings(language: summary.language).openOutfitHint)
    if summary.outfits.count > 1 {
      Button(intent: NextOutfitIntent()) {
        Text(summary.labels.anotherOption)
      }
      .buttonStyle(.bordered)
    }
  }
}
