'use strict';

const path = require('path');
const { expect } = require('chai');
const sinon = require('sinon');
const {
  processExit,
  fixtureCompare: _fixtureCompare
} = require('git-fixtures');
const { isGitClean } = require('git-diff-apply');
const createReactAppUpdater = require('../../src');
const utils = require('../../src/utils');
const buildTmp = require('../helpers/build-tmp');
const {
  assertNoUnstaged,
  assertNoStaged
} = require('../helpers/assertions');
const semver = require('semver');

const commitMessage = 'add files';

const shouldRunUpdateTests = semver.major(process.version) >= 8;

describe('Integration - index', function() {
  this.timeout(30 * 1000);

  let cwd;
  let sandbox;
  let tmpPath;

  before(function() {
    cwd = process.cwd();
  });

  beforeEach(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() {
    sandbox.restore();

    process.chdir(cwd);
  });

  function merge({
    fixturesPath,
    dirty,
    from,
    to = '2.1.1',
    reset,
    compareOnly,
    statsOnly,
    runCodemods,
    listCodemods
  }) {
    tmpPath = buildTmp({
      fixturesPath,
      commitMessage,
      dirty
    });

    process.chdir(tmpPath);

    let promise = createReactAppUpdater({
      from,
      to,
      reset,
      compareOnly,
      statsOnly,
      runCodemods,
      listCodemods
    });

    return processExit({
      promise,
      cwd: tmpPath,
      commitMessage,
      expect
    });
  }

  function fixtureCompare({
    mergeFixtures
  }) {
    let actual = tmpPath;
    let expected = path.join(cwd, mergeFixtures);

    _fixtureCompare({
      expect,
      actual,
      expected
    });
  }

  it.skip('handles dirty', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      dirty: true
    }).then(({
      status,
      stderr
    }) => {
      expect(status).to.equal(`?? a-random-new-file
`);

      expect(stderr).to.contain('You must start with a clean working directory');
      expect(stderr).to.not.contain('UnhandledPromiseRejectionWarning');
    });
  });

  it('handles non-create-react-app app', function() {
    return merge({
      fixturesPath: 'test/fixtures/package-json/non-create-react-app'
    }).then(({
      stderr
    }) => {
      expect(isGitClean({ cwd: tmpPath })).to.be.ok;

      expect(stderr).to.contain('Create React App project type could not be determined');
    });
  });

  it('handles non-npm dir', function() {
    return merge({
      fixturesPath: 'test/fixtures/package-json/missing'
    }).then(({
      stderr
    }) => {
      expect(isGitClean({ cwd: tmpPath })).to.be.ok;

      expect(stderr).to.contain('No package.json was found in this directory');
    });
  });

  it('handles malformed package.json', function() {
    return merge({
      fixturesPath: 'test/fixtures/package-json/malformed'
    }).then(({
      stderr
    }) => {
      expect(isGitClean({ cwd: tmpPath })).to.be.ok;

      expect(stderr).to.contain('The package.json is malformed');
    });
  });

  it.skip('updates glimmer app', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/glimmer-app',
      from: '0.5.0',
      to: '0.6.1'
    }).then(({
      status
    }) => {
      fixtureCompare({
        mergeFixtures: 'test/fixtures/merge/glimmer-app'
      });

      expect(status).to.match(/^M {2}src\/index\.ts$/m);

      assertNoUnstaged(status);
    });
  });

  it.skip('needs --from if glimmer app before 0.6.3', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/glimmer-app',
      to: '0.6.1'
    }).then(({
      stderr
    }) => {
      expect(isGitClean({ cwd: tmpPath })).to.be.ok;

      expect(stderr).to.contain('version cannot be determined');
    });
  });

  it.skip('resets app', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      reset: true
    }).then(({
      status
    }) => {
      fixtureCompare({
        mergeFixtures: 'test/fixtures/reset/my-app'
      });

      expect(status).to.match(/^ D app\/controllers\/application\.js$/m);

      assertNoStaged(status);
    });
  });

  it.skip('opens compare url', function() {
    let opn = sandbox.stub(utils, 'opn');

    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      compareOnly: true
    }).then(({
      result,
      status
    }) => {
      assertNoUnstaged(status);

      expect(result, 'don\'t accidentally print anything to the console').to.be.undefined;

      expect(opn.calledOnce).to.be.ok;
      expect(opn.args[0][0]).to.equal('https://github.com/ember-cli/ember-new-output/compare/v2.11.1...v3.2.0-beta.1');
    });
  });

  it.skip('resolves semver ranges', function() {
    let opn = sandbox.stub(utils, 'opn');

    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      from: '2.11',
      to: '^2',
      compareOnly: true
    }).then(() => {
      expect(opn.args[0][0]).to.equal('https://github.com/ember-cli/ember-new-output/compare/v2.11.1...v2.18.2');
    });
  });

  it.skip('shows stats only', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      statsOnly: true
    }).then(({
      result,
      status
    }) => {
      assertNoStaged(status);

      expect(result).to.equal(`project type: app
from version: 2.11.1
to version: 3.2.0-beta.1
output repo: https://github.com/ember-cli/ember-new-output
applicable codemods: `);
    });
  });

  // this one can be removed once the above starts returning codemods
  it.skip('shows stats only - codemods', function() {
    return merge({
      fixturesPath: 'test/fixtures/codemod/min-node/my-app',
      statsOnly: true
    }).then(({
      result,
      status
    }) => {
      assertNoStaged(status);

      expect(result).to.equal(`project type: app
from version: 3.2.0-beta.1
to version: 3.2.0-beta.1
output repo: https://github.com/ember-cli/ember-new-output
applicable codemods: ember-modules-codemod, ember-qunit-codemod, ember-test-helpers-codemod, es5-getter-ember-codemod, qunit-dom-codemod`);
    });
  });

  it.skip('lists codemods', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      listCodemods: true
    }).then(({
      result,
      status
    }) => {
      assertNoStaged(status);

      expect(JSON.parse(result)).to.have.own.property('ember-modules-codemod');
    });
  });

  (shouldRunUpdateTests ? it : it.skip)('can update a normal app', function() {
    this.timeout(60 * 60 * 1000);

    return merge({
      fixturesPath: 'test/fixtures/local/my-app'
    }).then(({
      status
    }) => {
      fixtureCompare({
        mergeFixtures: 'test/fixtures/merge/my-app'
      });

      assertNoUnstaged(status);
    });
  });

  (shouldRunUpdateTests ? it : it.skip)('can update an ejected app', function() {
    this.timeout(60 * 60 * 1000);

    return merge({
      fixturesPath: 'test/fixtures/local/ejected-app'
    }).then(({
      status
    }) => {
      fixtureCompare({
        mergeFixtures: 'test/fixtures/merge/ejected-app'
      });

      assertNoUnstaged(status);
    });
  });
});
