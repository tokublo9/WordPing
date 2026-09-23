const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { updatePodfile } = require('../plugins/withCocoaPodsDeploymentTarget');

test('Expo config declares iOS 15.1 and installs the CocoaPods target plugin', () => {
  const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  const plugins = app.expo.plugins;
  const buildProperties = plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties',
  );

  assert.equal(buildProperties?.[1]?.ios?.deploymentTarget, '15.1');
  assert.ok(plugins.includes('./plugins/withCocoaPodsDeploymentTarget'));
});

test('the generated Podfile forces every CocoaPods target to the configured version', () => {
  const podfile = `target 'WordMemo' do
  post_install do |installer|
    react_native_post_install(
      installer
    )
  end
end
`;

  const updated = updatePodfile(podfile);
  assert.match(
    updated,
    /deployment_target = podfile_properties\['ios\.deploymentTarget'\] \|\| '15\.1'/u,
  );
  assert.match(updated, /installer\.pods_project\.targets\.each do \|pod_target\|/u);
  assert.match(
    updated,
    /build_config\.build_settings\['IPHONEOS_DEPLOYMENT_TARGET'\] = deployment_target/u,
  );
  assert.ok(
    updated.indexOf("build_settings['IPHONEOS_DEPLOYMENT_TARGET']") >
      updated.indexOf('react_native_post_install('),
    'the override must run after React Native post-install changes',
  );
  assert.equal(updatePodfile(updated), updated, 'the config plugin must be idempotent');
});
