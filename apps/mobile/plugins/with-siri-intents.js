// Adds the Siri outfit card and Closet-add App Intents to the main iOS app target (ADR 0042
// section 4): the App Group entitlement the outfit summary is shared through, and the tracked
// Swift and string catalog sources under native/siri-intents, copied into the generated project.
// It applies only to the generated iOS project (CNG); Android is untouched.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins');

const appGroupIdentifier = 'group.com.ubrn.kuyara';
const appGroupsKey = 'com.apple.security.application-groups';
const sourceDirectoryInProject = path.join('native', 'siri-intents');
const projectGroupName = 'SiriIntents';
const stringCatalogFileType = 'text.json.xcstrings';

function listSources(directory) {
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.swift') || file.endsWith('.xcstrings'))
    .sort();
  if (!files.some((file) => file.endsWith('.swift')) || !files.includes('AppShortcuts.xcstrings')) {
    throw new Error(`with-siri-intents: expected Swift sources and AppShortcuts.xcstrings in ${directory}.`);
  }
  return files;
}

function addAppGroup(entitlements) {
  const groups = entitlements[appGroupsKey] ?? [];
  if (!Array.isArray(groups)) {
    throw new Error(`with-siri-intents: ${appGroupsKey} is not an array.`);
  }
  return {
    ...entitlements,
    [appGroupsKey]: groups.includes(appGroupIdentifier) ? groups : [...groups, appGroupIdentifier],
  };
}

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : value;
}

// Adds the sources to a `SiriIntents` group inside the app's group and to the application
// target's Sources and Resources phases. Files already in the group are left as they are.
function addSourcesToProject(project, projectName, files) {
  IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
  const { firstProject } = project.getFirstProject();
  const mainGroup = project.getPBXGroupByKey(firstProject.mainGroup);
  const appGroupChild = mainGroup?.children.find((child) => child.comment === projectName);
  if (!appGroupChild) {
    throw new Error(`with-siri-intents: the "${projectName}" group is missing from the Xcode project; the template changed.`);
  }
  const appGroup = project.getPBXGroupByKey(appGroupChild.value);
  let groupChild = appGroup.children.find((child) => child.comment === projectGroupName);
  if (!groupChild) {
    // The template's app group has no path of its own (its files carry `<name>/File`), so the new
    // group's path is relative to the project folder unless the app group gained one.
    const groupPath = unquote(appGroup.path) ? projectGroupName : `${projectName}/${projectGroupName}`;
    const { uuid } = project.addPbxGroup([], projectGroupName, groupPath);
    groupChild = { value: uuid, comment: projectGroupName };
    appGroup.children.push(groupChild);
  }

  const groupName = `${projectName}/${projectGroupName}`;
  for (const file of files) {
    if (file.endsWith('.swift')) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: file, groupName, project });
    } else {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: file, groupName, project, isBuildFile: true });
    }
  }

  // The xcode library does not know string catalogs; without this type Xcode copies the catalog
  // as a plain file instead of compiling it into per-language .strings tables. It also writes
  // unset fields as the word `undefined`, which an explicit file type would then override.
  const references = project.pbxFileReferenceSection();
  for (const child of project.getPBXGroupByKey(groupChild.value).children) {
    const reference = references[child.value];
    for (const [key, value] of Object.entries(reference)) {
      if (value === undefined) delete reference[key];
    }
    if (child.comment.endsWith('.xcstrings')) {
      reference.lastKnownFileType = stringCatalogFileType;
    }
  }
  return project;
}

function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults = addAppGroup(mod.modResults);
    return mod;
  });
}

function withCopiedSources(config) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const { platformProjectRoot, projectName, projectRoot } = mod.modRequest;
      const sourceDirectory = path.join(projectRoot, sourceDirectoryInProject);
      const destination = path.join(platformProjectRoot, projectName, projectGroupName);
      fs.rmSync(destination, { recursive: true, force: true });
      fs.mkdirSync(destination, { recursive: true });
      for (const file of listSources(sourceDirectory)) {
        fs.copyFileSync(path.join(sourceDirectory, file), path.join(destination, file));
      }
      return mod;
    },
  ]);
}

function withProjectSources(config) {
  return withXcodeProject(config, (mod) => {
    const { projectName, projectRoot } = mod.modRequest;
    mod.modResults = addSourcesToProject(mod.modResults, projectName, listSources(path.join(projectRoot, sourceDirectoryInProject)));
    return mod;
  });
}

function withSiriIntents(config) {
  return withProjectSources(withCopiedSources(withAppGroupEntitlement(config)));
}

module.exports = withSiriIntents;
module.exports.addAppGroup = addAppGroup;
module.exports.addSourcesToProject = addSourcesToProject;
module.exports.listSources = listSources;
