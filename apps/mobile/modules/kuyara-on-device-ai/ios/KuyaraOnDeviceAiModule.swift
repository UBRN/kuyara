// ADR 0034 section 6: the only Foundation Models surface in the app.
//
// Structured JSON goes in and structured JSON comes out; prose never crosses this boundary
// in either direction. Nothing here logs the input, the output or any part of either: a
// recommendation request is user data and an on-device model is the reason it never leaves
// the device. Errors are raised as coded exceptions whose message names one failure from a
// closed list written here.

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
// result sends the request to the Worker. The code appended to the message is the only
// detail that crosses, and it is a member of a closed list this file writes, never text the
// framework or the model produced: a failure that says nothing is a failure nobody can fix.
internal final class OnDeviceAiFailedException: Exception, @unchecked Sendable {
  private let failureCode: String

  init(
    _ failureCode: String = "unknown",
    file: String = #fileID,
    line: UInt = #line,
    function: String = #function
  ) {
    self.failureCode = failureCode
    super.init(file: file, line: line, function: function)
  }

  override var reason: String {
    "On-device selection could not be completed. (\(failureCode))"
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
        // The schema already constrains `optionId` and `archetypeId` through `schema:`;
        // echoing its 24-value `anyOf` into the prompt as well spends the 4096-token
        // session window twice over on identifiers the decoder is bound by regardless.
        includeSchemaInPrompt: false,
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

/// The generation failures the framework raises, as fixed lowercase codes. Nothing here is
/// framework text: an unrecognised case is reported as unknown rather than described.
@available(iOS 26.0, *)
private func generationCode(_ error: LanguageModelSession.GenerationError) -> String {
  switch error {
  case .exceededContextWindowSize:
    return "exceeded_context_window"
  case .assetsUnavailable:
    return "assets_unavailable"
  case .guardrailViolation:
    return "guardrail_violation"
  case .unsupportedGuide:
    return "unsupported_guide"
  case .unsupportedLanguageOrLocale:
    return "unsupported_language_or_locale"
  case .decodingFailure:
    return "decoding_failure"
  case .rateLimited:
    return "rate_limited"
  case .concurrentRequests:
    return "concurrent_requests"
  case .refusal:
    return "refusal"
  @unknown default:
    return "unknown"
  }
}

/// The caller enforces the same budget on the JavaScript side. Enforcing it here too means a
/// session that never settles is cancelled rather than left running behind an abandoned call.
@available(iOS 26.0, *)
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
  } catch let error as LanguageModelSession.GenerationError {
    throw OnDeviceAiFailedException(generationCode(error))
  } catch {
    // Provider errors carry model detail; only the coded failure crosses the boundary.
    throw OnDeviceAiFailedException()
  }
}
#endif
