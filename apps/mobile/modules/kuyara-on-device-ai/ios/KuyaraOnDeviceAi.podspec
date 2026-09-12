Pod::Spec.new do |s|
  s.name           = 'KuyaraOnDeviceAi'
  s.version        = '1.0.0'
  s.summary        = 'On-device outfit selection through Apple Foundation Models.'
  s.description    = 'ADR 0034: structured JSON in, structured JSON out, no prose and no logging.'
  s.author         = 'kuyara'
  s.homepage       = 'https://github.com/ubrn/kuyara'
  s.platforms      = {
    :ios => '26.0'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
