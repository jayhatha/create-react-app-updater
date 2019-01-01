'use strict';

const run = require('./run-async');
const pMap = require('p-map');
const pRetry = require('p-retry');
const semver = require('semver');

function crawl({
  parentVersions,
  childVersions,
  childVersion,
  parentPackageName,
  childPackageName
}) {
  let parentVersion;

  let minChildVersion = semver.minSatisfying(childVersions, childVersion);

  let sortedParentVersions = parentVersions.sort((a, b) => {
    return semver.lt(a, b) ? 1 : -1;
  });

  return pMap(sortedParentVersions, _parentVersion => {
    if (parentVersion) {
      return;
    }

    return pRetry(() => {
      return run(`npm info ${parentPackageName}@${_parentVersion} dependencies --json`).then(results => {
        if (parentVersion) {
          return;
        }

        // some versions may be missing deps
        if (!results) {
          return;
        }

        let dependencies = JSON.parse(results);
        let _childVersion = dependencies[childPackageName];

        if (_childVersion === childVersion) {
          parentVersion = _parentVersion;
        } else if (!semver.prerelease(_childVersion)) {
          let _minChildVersion = semver.minSatisfying(childVersions, _childVersion);
          if (semver.lte(_minChildVersion, minChildVersion)) {
            parentVersion = _parentVersion;
          }
        }
      }).catch(err => {
        // occurs sometimes when running multiple npm calls at once
        if (typeof err !== 'string' || !err.includes('npm update check failed')) {
          throw new pRetry.AbortError(err);
        }

        // https://github.com/sindresorhus/p-retry/issues/14
        // throw err;
        throw new Error(err);
      });
    }, { retries: 5 });
  }, { concurrency: 5 }).then(() => {
    return parentVersion;
  });
}

function npm(pkg, field) {
  return run(`npm info ${pkg} ${field} --json`).then(JSON.parse);
}

function getTimes(packageName) {
  return npm(packageName, 'time').then(time => {
    delete time['created'];
    delete time['modified'];
    return time;
  });
}

function getVersions(packageName) {
  return npm(packageName, 'versions');
}

function getVersionAtTime(times, time) {
  time = new Date(time);
  let versionsInRange = Object.keys(times).filter(version => {
    return new Date(times[version]) < time;
  });
  let version = semver.maxSatisfying(versionsInRange, '');
  return version;
}

module.exports = function getPackageVersion({
  dependencies,
  devDependencies
}, projectType) {
  return Promise.all([
    getTimes('create-react-app'),
    getTimes('react-scripts')
  ]).then(([
    createReactAppTimes,
    reactScriptsTimes
  ]) => {
    let reactScriptsVersions = Object.keys(reactScriptsTimes);

    return Promise.resolve().then(() => {
      let allDeps = Object.assign({}, dependencies, devDependencies);

      if (projectType === 'ejected') {
        return getVersions('react-dev-utils').then(reactDevUtilsVersions => {
          let reactDevUtilsVersion = allDeps['react-dev-utils'];

          return crawl({
            parentVersions: reactScriptsVersions,
            childVersions: reactDevUtilsVersions,
            childVersion: reactDevUtilsVersion,
            parentPackageName: 'react-scripts',
            childPackageName: 'react-dev-utils'
          });
        });
      }

      let reactScriptsVersion = semver.minSatisfying(reactScriptsVersions, allDeps['react-scripts']);

      return reactScriptsVersion;
    }).then(reactScriptsVersion => {
      if (!reactScriptsVersion) {
        throw 'React Scripts version could not be determined';
      }

      let reactScriptsTime = reactScriptsTimes[reactScriptsVersion];

      let createReactAppVersion = getVersionAtTime(createReactAppTimes, reactScriptsTime);

      if (!createReactAppVersion) {
        throw 'Create React App version could not be determined';
      }

      return {
        'create-react-app': createReactAppVersion,
        'react-scripts': reactScriptsVersion
      };
    });
  });
};