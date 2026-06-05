#!/usr/bin/env ruby
# frozen_string_literal: true
#
# setup_snapshot.rb — register the OpenNovaUITests target + shared scheme into
# the (gitignored, prebuild-generated) ios/OpenNova.xcodeproj.
#
# Run this once, and again after any `expo prebuild` (which regenerates the
# app's ios/ folder and wipes the target):
#
#   cd manuals/OpenNova
#   ruby fastlane/setup_snapshot.rb
#
# It is idempotent: an existing OpenNovaUITests target/scheme is removed and
# recreated. The canonical Swift sources live in fastlane/snapshot/ and are
# copied into ios/OpenNovaUITests/ so they survive prebuild.
#
# Requires the `xcodeproj` gem. If you don't have it on your Ruby, run with
# fastlane's bundled copy (no install needed):
#
#   cd manuals/OpenNova
#   FL=/opt/homebrew/Cellar/fastlane/*/libexec
#   GEM_HOME=$FL GEM_PATH=$FL ruby fastlane/setup_snapshot.rb

require 'fileutils'

begin
  require 'xcodeproj'
rescue LoadError
  abort(<<~MSG)
    error: the 'xcodeproj' gem is not available to this Ruby.
    Re-run with fastlane's bundled gems, e.g.:

      FL=$(echo /opt/homebrew/Cellar/fastlane/*/libexec)
      GEM_HOME="$FL" GEM_PATH="$FL" ruby fastlane/setup_snapshot.rb
  MSG
end

APP_DIR       = File.expand_path('../../../app', __dir__)  # repo/app (manuals/OpenNova/fastlane → app)
PROJECT_PATH  = File.join(APP_DIR, 'ios', 'OpenNova.xcodeproj')
APP_TARGET    = 'OpenNova'
TEST_TARGET   = 'OpenNovaUITests'
SRC_DIR       = File.join(__dir__, 'snapshot')             # canonical sources
DEST_DIR      = File.join(APP_DIR, 'ios', TEST_TARGET)
SWIFT_FILES   = %w[SnapshotUITests.swift SnapshotHelper.swift]
DEPLOY_TARGET = '15.1'
TEAM_ID       = 'KN3YQ3Z9SN'
BUNDLE_ID     = 'com.ramonvanbruggen.opennova.uitests'

abort("error: #{PROJECT_PATH} not found — run `expo prebuild` first") unless Dir.exist?(PROJECT_PATH)

# ── 1. Copy canonical Swift sources into ios/OpenNovaUITests/ ────────────────
FileUtils.mkdir_p(DEST_DIR)
SWIFT_FILES.each do |f|
  src = File.join(SRC_DIR, f)
  abort("error: missing canonical source #{src}") unless File.file?(src)
  FileUtils.cp(src, File.join(DEST_DIR, f))
end
puts "✓ copied #{SWIFT_FILES.join(', ')} → ios/#{TEST_TARGET}/"

# ── 2. Open project, remove any previous test target/group/scheme ───────────
project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == APP_TARGET }
abort("error: app target '#{APP_TARGET}' not found in project") unless app_target

project.targets.select { |t| t.name == TEST_TARGET }.each do |t|
  t.build_configuration_list&.build_configurations&.each(&:remove_from_project)
  t.build_configuration_list&.remove_from_project
  t.product_reference&.remove_from_project
  t.remove_from_project
end
existing_group = project.main_group[TEST_TARGET]
existing_group&.remove_from_project
project.root_object.attributes['TargetAttributes']&.reject! { |uuid, _| project.objects_by_uuid[uuid].nil? }

scheme_path = Xcodeproj::XCScheme.shared_data_dir(PROJECT_PATH).join("#{TEST_TARGET}.xcscheme")
FileUtils.rm_f(scheme_path)

# ── 3. Create the UI-test bundle target ─────────────────────────────────────
test_target = project.new_target(:ui_test_bundle, TEST_TARGET, :ios, DEPLOY_TARGET, nil, :swift)

group = project.main_group.new_group(TEST_TARGET, TEST_TARGET)
SWIFT_FILES.each do |f|
  ref = group.new_file(f) # resolves to SOURCE_ROOT/OpenNovaUITests/<f>
  test_target.source_build_phase.add_file_reference(ref)
end

test_target.build_configurations.each do |config|
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER'              => BUNDLE_ID,
    'PRODUCT_NAME'                           => '$(TARGET_NAME)',
    'TEST_TARGET_NAME'                       => APP_TARGET,
    'IPHONEOS_DEPLOYMENT_TARGET'             => DEPLOY_TARGET,
    'SWIFT_VERSION'                          => '5.0',
    'TARGETED_DEVICE_FAMILY'                 => '1,2',
    'DEVELOPMENT_TEAM'                       => TEAM_ID,
    'CODE_SIGN_STYLE'                        => 'Automatic',
    'GENERATE_INFOPLIST_FILE'                => 'YES',
    'MARKETING_VERSION'                      => '1.0',
    'CURRENT_PROJECT_VERSION'                => '1',
    'ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS'                => ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks'],
    'SWIFT_EMIT_LOC_STRINGS'                 => 'NO',
  )
end

test_target.add_dependency(app_target)

project.root_object.attributes['TargetAttributes'] ||= {}
project.root_object.attributes['TargetAttributes'][test_target.uuid] = {
  'CreatedOnToolsVersion' => '15.0',
  'ProvisioningStyle'     => 'Automatic',
  'TestTargetID'          => app_target.uuid,
}

# ── 4. Shared scheme — Release config so the JS bundle is embedded ───────────
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app_target)
scheme.add_build_target(test_target, false)
scheme.set_launch_target(app_target)

testable = Xcodeproj::XCScheme::TestAction::TestableReference.new(test_target)
scheme.test_action.add_testable(testable)

scheme.test_action.build_configuration    = 'Release'
scheme.launch_action.build_configuration   = 'Release'
scheme.profile_action.build_configuration  = 'Release'
scheme.analyze_action.build_configuration  = 'Release'
scheme.archive_action.build_configuration  = 'Release'

project.save
scheme.save_as(PROJECT_PATH, TEST_TARGET, true)

puts "✓ added target '#{TEST_TARGET}' (host: #{APP_TARGET}) + shared scheme '#{TEST_TARGET}' (Release)"
puts "✓ done — run screenshots with: cd manuals/OpenNova && fastlane snapshot"
