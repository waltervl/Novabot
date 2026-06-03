const { withGradleProperties } = require('@expo/config-plugins');

/**
 * withSerialNativeBuild — make the Android native (gradle) build deterministic.
 *
 * Problem: with org.gradle.parallel=true (the RN/Expo default) gradle runs the
 * CMake build tasks of different native modules concurrently. react-native-
 * worklets and expo-modules-core have no declared inter-module ordering, so
 * expo-modules-core's ninja can start linking against
 * react-native-worklets/.../libworklets.so before the worklets build task has
 * produced + copied it, failing with:
 *   ninja: error: '.../libworklets.so', needed by '.../libexpo-modules-core.so',
 *   missing and no known rule to make it
 * This is a RACE: EAS --local builds clean every time, so 14 builds won the race
 * and one lost it (lost reliably once the machine was under heavy load, which
 * shifts gradle's parallel scheduling). A release pipeline can't depend on that.
 *
 * Fix: org.gradle.parallel=false runs module tasks sequentially, so worklets
 * fully builds before expo-modules-core links it. ninja inside a single module
 * build still uses all cores, so the build stays reasonably fast — only the
 * cross-module concurrency (the source of the race) is removed.
 */
module.exports = function withSerialNativeBuild(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const setProp = (key, value) => {
      const existing = props.find((p) => p.type === 'property' && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    };
    setProp('org.gradle.parallel', 'false');
    return cfg;
  });
};
