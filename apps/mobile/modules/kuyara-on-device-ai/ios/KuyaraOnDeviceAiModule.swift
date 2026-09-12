// ADR 0034 section 6: the only Foundation Models surface in the app.
//
// Structured JSON goes in and structured JSON comes out; prose never crosses this boundary
// in either direction. Nothing here logs the input, the output or any part of either: a
// recommendation request is user data and an on-device model is the reason it never leaves
// the device. Errors are raised as coded exceptions with fixed messages.

import ExpoModulesCore

#if canImport(FoundationModels)
import FoundationModels
#endif

// The twelve archetype identifiers of ADR 0007. The closed list lives in
// packages/contracts/src/ai-v1.ts (`outfitArchetypeIds`); it cannot be imported into Swift,
// so it is mirrored here and must be changed in both places together. The mobile mapper
// rejects anything outside the list, so a drift fails closed onto the Worker tier.
private let allowedArchetypeIds = [
  "everyday_easy",
  "smart_casual",
  "office_ready",
  "weekend_relaxed",
  "layered_warmth",
  "cold_shield",
  "rain_ready",
  "snow_day",
  "wind_guard",
  "light_and_airy",
  "on_the_move",
  "in_between",
]

// Mirrors the Worker's system prompt (apps/worker/src/ai/ai-prompt.ts) line for line, so the
// two executors are given the same task. English only: the answer is identifiers, never copy.
private let instructions = [
  "Pick exactly three supplied options by optionId.",
  "Never invent an optionId.",
  "Make the three picks meaningfully different.",
  "Prefer formalities in the supplied formalityOrder; no formality is excluded.",
  "Give each pick one archetypeId from the allowed list.",
  "Use three different archetypeIds.",
  "Output structured data only, with no prose.",
].joined(separator: "\n")

private let statusAvailable = "available"
private let statusUnavailable = "unavailable"

// One failure, because the JavaScript side keeps one: every on-device outcome except a
// result sends the request to the Worker. A finer taxonomy here would name distinctions
// nothing reads, and the reasons themselves must not carry model detail across the boundary.
internal final class OnDeviceAiFailedException: Exception, @unchecked Sendable {
  override var reason: String {
    "On-device selection could not be completed."
  }
}

public final class KuyaraOnDeviceAiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KuyaraOnDeviceAi")

    // No inference, no quota, no measurable time: this is a capability read, not a probe.
    AsyncFunction("getAvailability") { () -> [String: String] in
      return currentAvailability()
    }

    AsyncFunction("selectOutfits") { (input: String, timeoutMs: Int) -> String in
      return try await selectOutfits(input: input, timeoutMs: timeoutMs)
    }
  }
}

private func currentAvailability() -> [String: String] {
  #if canImport(FoundationModels)
  if #available(iOS 26.0, *) {
    switch SystemLanguageModel.default.availability {
    case .available:
      return ["status": statusAvailable]
    case .unavailable(let reason):
      return ["status": statusUnavailable, "reason": coarseReason(reason)]
    @unknown default:
      return ["status": statusUnavailable, "reason": "unknown"]
    }
  }
  return ["status": statusUnavailable, "reason": "unsupported_os"]
  #else
  return ["status": statusUnavailable, "reason": "unsupported_os"]
  #endif
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private func coarseReason(
  _ reason: SystemLanguageModel.Availability.UnavailableReason
) -> String {
  switch reason {
  case .deviceNotEligible:
    return "device_not_eligible"
  case .appleIntelligenceNotEnabled:
    return "apple_intelligence_not_enabled"
  case .modelNotReady:
    return "model_not_ready"
  @unknown default:
    // A reason this build does not know is reported as unknown rather than guessed.
    return "unknown"
  }
}
#endif

private func selectOutfits(input: String, timeoutMs: Int) async throws -> String {
  #if canImport(FoundationModels)
  if #available(iOS 26.0, *) {
    guard case .available = SystemLanguageModel.default.availability else {
      throw OnDeviceAiFailedException()
    }
    let optionIds = try suppliedOptionIds(from: input)
    let schema = try pickSchema(optionIds: optionIds)
    return try await withTimeout(milliseconds: timeoutMs) {
      // One session per call, non-streaming, no transcript carried between requests.
      let session = LanguageModelSession(instructions: instructions)
      let response = try await session.respond(
        to: input,
        schema: schema,
        includeSchemaInPrompt: true,
        options: GenerationOptions(sampling: .greedy)
      )
      return response.content.jsonString
    }
  }
  throw OnDeviceAiFailedException()
  #else
  throw OnDeviceAiFailedException()
  #endif
}

#if canImport(FoundationModels)
/// The option identifiers the caller supplied, read back out of the model input so guided
/// generation can constrain `optionId` to exactly that set. Nothing else is read.
private func suppliedOptionIds(from input: String) throws -> [String] {
  guard
    let data = input.data(using: .utf8),
    let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let options = root["options"] as? [[String: Any]]
  else {
    throw OnDeviceAiFailedException()
  }
  let ids = options.compactMap { $0["optionId"] as? String }
  guard !ids.isEmpty, ids.count == options.count else {
    throw OnDeviceAiFailedException()
  }
  return ids
}

@available(iOS 26.0, *)
private func pickSchema(optionIds: [String]) throws -> GenerationSchema {
  let optionIdSchema = DynamicGenerationSchema(name: "OptionId", anyOf: optionIds)
  let archetypeIdSchema = DynamicGenerationSchema(
    name: "ArchetypeId",
    anyOf: allowedArchetypeIds
  )
  let pick = DynamicGenerationSchema(
    name: "Pick",
    properties: [
      DynamicGenerationSchema.Property(
        name: "optionId",
        schema: DynamicGenerationSchema(referenceTo: "OptionId")
      ),
      DynamicGenerationSchema.Property(
        name: "archetypeId",
        schema: DynamicGenerationSchema(referenceTo: "ArchetypeId")
      ),
    ]
  )
  let root = DynamicGenerationSchema(
    name: "OutfitPicks",
    properties: [
      DynamicGenerationSchema.Property(
        name: "picks",
        schema: DynamicGenerationSchema(
          arrayOf: DynamicGenerationSchema(referenceTo: "Pick"),
          minimumElements: 3,
          maximumElements: 3
        )
      )
    ]
  )
  do {
    return try GenerationSchema(
      root: root,
      dependencies: [optionIdSchema, archetypeIdSchema, pick]
    )
  } catch {
    throw OnDeviceAiFailedException()
  }
}

/// The caller enforces the same budget on the JavaScript side. Enforcing it here too means a
/// session that never settles is cancelled rather than left running behind an abandoned call.
private func withTimeout(
  milliseconds: Int,
  _ work: @escaping @Sendable () async throws -> String
) async throws -> String {
  let budget = max(milliseconds, 1)
  do {
    return try await withThrowingTaskGroup(of: String.self) { group in
      group.addTask { try await work() }
      group.addTask {
        try await Task.sleep(nanoseconds: UInt64(budget) * 1_000_000)
        throw OnDeviceAiFailedException()
      }
      guard let first = try await group.next() else {
        throw OnDeviceAiFailedException()
      }
      group.cancelAll()
      return first
    }
  } catch let exception as Exception {
    throw exception
  } catch {
    // Provider errors carry model detail; only the coded failure crosses the boundary.
    throw OnDeviceAiFailedException()
  }
}
#endif
