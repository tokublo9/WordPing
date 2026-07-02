const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const PODFILE_FIX = `    # Patch fmt/base.h so -DFMT_USE_CONSTEVAL=0 is respected (Xcode 26 / Clang 20 consteval strictness)
    fmt_base_h = File.join(installer.config.project_root, 'fmt/include/fmt/base.h')
    if File.exist?(fmt_base_h)
      content = File.read(fmt_base_h)
      unless content.include?('#ifndef FMT_USE_CONSTEVAL')
        content = content.sub(
          "// Detect consteval, C++20 constexpr extensions and std::is_constant_evaluated.\\n#if !defined(__cpp_lib_is_constant_evaluated)",
          "// Detect consteval, C++20 constexpr extensions and std::is_constant_evaluated.\\n#ifndef FMT_USE_CONSTEVAL\\n#if !defined(__cpp_lib_is_constant_evaluated)"
        ).sub(
          "#elif FMT_GCC_VERSION >= 1002 || FMT_CLANG_VERSION >= 1101\\n#  define FMT_USE_CONSTEVAL 1\\n#else\\n#  define FMT_USE_CONSTEVAL 0\\n#endif\\n#if FMT_USE_CONSTEVAL",
          "#elif FMT_GCC_VERSION >= 1002 || FMT_CLANG_VERSION >= 1101\\n#  define FMT_USE_CONSTEVAL 1\\n#else\\n#  define FMT_USE_CONSTEVAL 0\\n#endif\\n#endif  // FMT_USE_CONSTEVAL\\n#if FMT_USE_CONSTEVAL"
        )
        File.write(fmt_base_h, content)
      end
    end
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) -DFMT_USE_CONSTEVAL=0'
      end
    end`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (!contents.includes('FMT_USE_CONSTEVAL')) {
        contents = contents.replace(
          /(\s+end\nend\n?)$/,
          `\n${PODFILE_FIX}\n$1`
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return cfg;
    },
  ]);
};
