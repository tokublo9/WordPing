const { withPodfile } = require('@expo/config-plugins');

const START_MARKER = '# @generated begin wordcore-ios-deployment-target';
const END_MARKER = '# @generated end wordcore-ios-deployment-target';

const PODS_DEPLOYMENT_TARGET_BLOCK = `    ${START_MARKER}
    # Some podspecs still declare older iOS versions. Apply the deployment
    # target written by expo-build-properties after React Native's post-install
    # hook so the generated Pods project cannot restore those stale values.
    deployment_target = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = deployment_target
      end
    end
    ${END_MARKER}`;

/** Add the CocoaPods-wide target override to Expo's generated Podfile. */
function updatePodfile(contents) {
  if (contents.includes(START_MARKER)) return contents;

  const postInstallStart = contents.indexOf('  post_install do |installer|');
  const postInstallEnd = contents.lastIndexOf('\n  end\nend');
  if (postInstallStart === -1 || postInstallEnd < postInstallStart) {
    throw new Error(
      'Could not find Expo\'s post_install block in ios/Podfile; ' +
      'the CocoaPods deployment target was not applied.',
    );
  }

  return (
    contents.slice(0, postInstallEnd) +
    `\n\n${PODS_DEPLOYMENT_TARGET_BLOCK}` +
    contents.slice(postInstallEnd)
  );
}

function withCocoaPodsDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    podfileConfig.modResults.contents = updatePodfile(podfileConfig.modResults.contents);
    return podfileConfig;
  });
}

module.exports = withCocoaPodsDeploymentTarget;
module.exports.updatePodfile = updatePodfile;
