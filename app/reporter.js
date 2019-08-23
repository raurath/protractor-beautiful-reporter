var util = require('./util'),
    _ = require('underscore'),
    path = require('path');

/** Function: defaultPathBuilder
 * This function builds paths for a screenshot file. It is appended to the
 * constructors base directory and gets prependend with `.png` or `.json` when
 * storing a screenshot or JSON meta data file.
 *
 * Parameters:
 *     (Object) spec - The spec currently reported
 *     (Array) descriptions - The specs and their parent suites descriptions
 *     (Object) result - The result object of the current test spec.
 *     (Object) capabilities - WebDrivers capabilities object containing
 *                             in-depth information about the Selenium node
 *                             which executed the test case.
 *
 * Returns:
 *     (String) containing the built path
 */
function defaultPathBuilder(spec, descriptions, results, capabilities) {
    return util.generateGuid();
}

/** Function: defaultMetaDataBuilder
 * Uses passed information to generate a meta data object which can be saved
 * along with a screenshot.
 * You do not have to add the screenshots file path since this will be appended
 * automatically.
 *
 * Parameters:
 *     (Object) spec - The spec currently reported
 *     (Array) descriptions - The specs and their parent suites descriptions
 *     (Object) result - The result object of the current test spec.
 *     (Object) capabilities - WebDrivers capabilities object containing
 *                             in-depth information about the Selenium node
 *                             which executed the test case.
 *
 * Returns:
 *     (Object) containing meta data to store along with a screenshot
 */
function defaultMetaDataBuilder(spec, descriptions, results, capabilities) {
    var metaData = {
        description: descriptions.join(' '),
        passed: results.passed(),
        os: capabilities.caps_.platform,
        sessionId: capabilities.caps_['webdriver.remote.sessionid'],
        instanceId: process.pid,
        browser: {
            name: capabilities.caps_.browserName,
            version: capabilities.caps_.version
        }
    };

    if (results.items_.length > 0) {
        var result = results.items_[0];
        if (!results.passed()) {
            var failedItem = _.where(results.items_, {passed_: false})[0];
            if (failedItem) {
                metaData.message = failedItem.message || 'Failed';
                metaData.trace = failedItem.trace ? (failedItem.trace.stack || 'No Stack trace information') : 'No Stack trace information';
            }

        } else {
            metaData.message = result.message || 'Passed';
            metaData.trace = result.trace.stack;
        }

    }

    return metaData;
}

function jasmine2MetaDataBuilder(spec, descriptions, results, capabilities) {

    let isPassed = results.status === 'passed';
    let isPending = ['pending', 'disabled', 'excluded'].includes(results.status);

    let metaData = {
        description: descriptions.join(' '),
        passed: isPassed,
        pending: isPending,
        os: capabilities.get('platform'),
        sessionId: capabilities.get('webdriver.remote.sessionid'),
        instanceId: process.pid,
        browser: {
            name: capabilities.get('browserName'),
            version: capabilities.get('version')
        }
    };

    if (isPassed) {
        metaData.message = (results.passedExpectations[0] || {}).message || 'Passed';
        metaData.trace = (results.passedExpectations[0] || {}).stack;
    } else if (isPending) {
        metaData.message = results.pendingReason || 'Pending';
    } else {

        if (results.failedExpectations[0].message) {
            metaData.message = results.failedExpectations.map(result => result.message);
        } else {
            metaData.message = 'Failed';
        }

        if (results.failedExpectations[0].stack) {
            metaData.trace = results.failedExpectations.map(result => result.stack);
        } else {
            metaData.trace = 'No Stack trace information';
        }
    }

    return metaData;
}


function sortFunction(a, b) {
    if (a.sessionId < b.sessionId) return -1;
    else if (a.sessionId > b.sessionId) return 1;

    if (a.timestamp < b.timestamp) return -1;
    else if (a.timestamp > b.timestamp) return 1;

    return 0;
}


/** Class: ScreenshotReporter
 * Creates a new screenshot reporter using the given `options` object.
 *
 * For more information, please look at the README.md file.
 *
 * Parameters:
 *     (Object) options - Object with options as described below.
 *
 * Possible options:
 *     (String) baseDirectory - The path to the directory where screenshots are
 *                              stored. If not existing, it gets created.
 *                              Mandatory.
 *     (Function) pathBuilder - A function which returns a path for a screenshot
 *                              to be stored. Optional.
 *     (Function) metaDataBuilder - Function which returns an object literal
 *                                  containing meta data to store along with
 *                                  the screenshot. Optional.
 *     (Boolean) takeScreenShotsForSkippedSpecs - Do you want to capture a
 *                                                screenshot for a skipped spec?
 *                                                Optional (default: false).
 */
function ScreenshotReporter(options) {
    options = options || {};
    if (!options.baseDirectory || options.baseDirectory.length === 0) {
        throw new Error('Please pass a valid base directory to store the ' +
            'screenshots into.');
    } else {
        this.baseDirectory = options.baseDirectory;
    }

    if (typeof (options.cssOverrideFile) !== 'undefined' && _.isString(options.cssOverrideFile)) {
        this.cssOverrideFile = options.cssOverrideFile;
    } else {
        this.cssOverrideFile = null;
    }

    if (typeof (options.screenshotsSubfolder) !== 'undefined' && _.isString(options.screenshotsSubfolder)) {
        this.screenshotsSubfolder = options.screenshotsSubfolder;
    } else {
        this.screenshotsSubfolder = '';
    }

    if (typeof (options.jsonsSubfolder) !== 'undefined' && _.isString(options.jsonsSubfolder)) {
        this.jsonsSubfolder = options.jsonsSubfolder;
    } else {
        this.jsonsSubfolder = '';
    }

    this.pathBuilder = options.pathBuilder || defaultPathBuilder;
    this.docTitle = options.docTitle || 'Test Results';
    this.docName = options.docName || 'report.html';
    this.screenshotOnFailure = typeof options.screenshotOnFailure !== 'undefined' ? options.screenshotOnFailure : false;
    this.metaDataBuilder = options.metaDataBuilder || defaultMetaDataBuilder;
    this.jasmine2MetaDataBuilder = options.jasmine2MetaDataBuilder || jasmine2MetaDataBuilder;
    this.sortFunction = options.sortFunction || sortFunction;
    this.preserveDirectory = typeof options.preserveDirectory !== 'undefined' ? options.preserveDirectory : true;
    this.excludeSkippedSpecs = options.excludeSkippedSpecs || false;
    this.takeScreenShotsForSkippedSpecs =
        options.takeScreenShotsForSkippedSpecs || false;
    this.gatherBrowserLogs =
        options.gatherBrowserLogs || true;
    this.takeScreenShotsOnlyForFailedSpecs =
        options.takeScreenShotsOnlyForFailedSpecs || false;
    this.clientDefaults = options.clientDefaults || {};
    if (options.searchSettings) { //settings in earlier "format" there?
        this.clientDefaults.searchSettings = options.searchSettings;
    }
    if (options.columnSettings) {
        this.clientDefaults.columnSettings = options.columnSettings;
    }
    this.customCssInline = options.customCssInline;

    this.finalOptions = {
        excludeSkippedSpecs: this.excludeSkippedSpecs,
        takeScreenShotsOnlyForFailedSpecs: this.takeScreenShotsOnlyForFailedSpecs,
        takeScreenShotsForSkippedSpecs: this.takeScreenShotsForSkippedSpecs,
        metaDataBuilder: this.metaDataBuilder,
        pathBuilder: this.pathBuilder,
        sortFunction: this.sortFunction,
        baseDirectory: this.baseDirectory,
        screenshotsSubfolder: this.screenshotsSubfolder,
        docTitle: this.docTitle,
        docName: this.docName,
        cssOverrideFile: this.cssOverrideFile,
        prepareAssets: true,
        clientDefaults: this.clientDefaults,
        customCssInline: this.customCssInline
    };
    if (!this.preserveDirectory) {
        util.removeDirectory(this.finalOptions.baseDirectory);
    }
    this.screenshotArray = [];
}

function expectFailed(rep) {
    var originalAddExpectationResult = jasmine.Spec.prototype.addExpectationResult;
    jasmine.Spec.prototype.addExpectationResult = function (passed, expectation) {
        var self = rep;
        if (!passed && self._screenshotReporter.screenshotOnFailure) {
            let baseName = self._screenshotReporter.pathBuilder(
                null,
                [expectation.message],
                null,
                null
            );
            let gUid = util.generateGuid();
            let screenShotFileName = path.basename(gUid + '.png');
            let screenShotFilePath = path.join(path.dirname(baseName + '.png'), self._screenshotReporter.screenshotsSubfolder);
            let screenShotPath = path.join(self._screenshotReporter.baseDirectory, screenShotFilePath, screenShotFileName);
            self._screenshotReporter.screenshotArray.push(path.join(self._screenshotReporter.screenshotsSubfolder, screenShotFileName));
            try {
                browser.takeScreenshot().then(png => {
                    util.storeScreenShot(png, screenShotPath);
                });
            }
            catch (ex) {
                if (ex['name'] === 'NoSuchWindowError') {
                    console.warn('Protractor-beautiful-reporter could not take the screenshot because target window is already closed');
                } else {
                    console.error(ex);
                    console.error('Protractor-beautiful-reporter could not take the screenshot');
                }
                metaData.screenShotFile = void 0;
            }
        }
        return originalAddExpectationResult.apply(this, arguments);
    }
};
class Jasmine2Reporter {

    constructor({screenshotReporter}) {

        /* `_asyncFlow` is a promise.
         * It is a "flow" that we create in `specDone`.
         * `suiteDone`, `suiteStarted` and `specStarted` will then add their steps to the flow and the `_awaitAsyncFlow`
         * function will wait for the flow to finish before running the next spec. */
        this._asyncFlow = null;

        this._screenshotReporter = screenshotReporter;
        this._suiteNames = [];

    }

    jasmineStarted() {

        /* Register `beforeEach` that will wait for all tasks in flow to be finished. */
        beforeEach(() => this._awaitAsyncFlow());
        afterAll(() => this._awaitAsyncFlow());

    }

    suiteStarted(result) {
        this._addTaskToFlow(async () => this._suiteNames.push(result.description));
    }

    suiteDone(result) {
        this._addTaskToFlow(async () => this._suiteNames.pop());
    }

    specStarted(result) {
        this._addTaskToFlow(async () => result.started = nowString());
    }

    specDone(result) {
        this._addTaskToFlow(async () => this._asyncSpecDone(result));
    }

    _addTaskToFlow(callback) {

        /* Create. */
        if (this._asyncFlow == null) {
            this._asyncFlow = callback();
        }
        /* Chain. */
        else {
            this._asyncFlow = this._asyncFlow.then(callback);
        }

    }

    /* @hack: `_awaitAsyncFlow` waits for `specDone` task to finish before running the next spec.*/
    async _awaitAsyncFlow() {
        await this._asyncFlow;
        this._asyncFlow = null;
    }

    async _asyncSpecDone(result) {
        // Don't report if it's skipped and we don't need it
        if (['pending', 'disabled', 'excluded'].includes(result.status) && this._screenshotReporter.excludeSkippedSpecs) {
            return;
        }

        result.stopped = nowString();

        await this._gatherBrowserLogs(result);
        await this._takeScreenShotAndAddMetaData(result);

    }

    async _gatherBrowserLogs(result) {

        if (!this._screenshotReporter.gatherBrowserLogs) {
            return;
        }

        const capabilities = await browser.getCapabilities();
        const browserName = capabilities.get('browserName');

        /* Skip incompatible browsers. */
        if (browserName == null || !browserName.toLowerCase().match(/chrome/)) {
            return;
        }

        result.browserLogs = await browser.manage().logs().get('browser');

    }

    async _takeScreenShotAndAddMetaData(result) {

        const capabilities = await browser.getCapabilities();
        let suite = this._buildSuite();

        let descriptions = util.gatherDescriptions(
            suite,
            [result.description]
        );

        let baseName = this._screenshotReporter.pathBuilder(
            null,
            descriptions,
            result,
            capabilities
        );

        let metaData = this._screenshotReporter.jasmine2MetaDataBuilder(
            null,
            descriptions,
            result,
            capabilities
        );

        let screenShotFileName = path.basename(baseName + '.png');
        let screenShotFilePath = path.join(path.dirname(baseName + '.png'), this._screenshotReporter.screenshotsSubfolder);

        let metaFile = baseName + '.json';
        let screenShotPath = path.join(this._screenshotReporter.baseDirectory, screenShotFilePath, screenShotFileName);
        let metaDataPath = path.join(this._screenshotReporter.baseDirectory, metaFile);
        let jsonPartsPath = path.join(this._screenshotReporter.baseDirectory, path.dirname(metaFile), this._screenshotReporter.jsonsSubfolder, path.basename(metaFile));

        metaData.browserLogs = [];

        let considerScreenshot = !(this._screenshotReporter.takeScreenShotsOnlyForFailedSpecs && result.status === 'passed')

        if (considerScreenshot) {
            this._screenshotReporter.screenshotArray.push(path.join(this._screenshotReporter.screenshotsSubfolder, screenShotFileName));
            metaData.screenShotFile = [...this._screenshotReporter.screenshotArray];
            this._screenshotReporter.screenshotArray.length = 0;
        }

        if (result.browserLogs) {
            metaData.browserLogs = result.browserLogs
        }

        metaData.timestamp = new Date(result.started).getTime();
        metaData.duration = new Date(result.stopped) - new Date(result.started);

        let testWasExecuted = ! (['pending','disabled','excluded'].includes(result.status));
        if (testWasExecuted && considerScreenshot) {
            try {
                const png = await browser.takeScreenshot();
                util.storeScreenShot(png, screenShotPath);
            }
            catch(ex) {
                if(ex['name'] === 'NoSuchWindowError') {
                    console.warn('Protractor-beautiful-reporter could not take the screenshot because target window is already closed');
                }else {
                    console.error(ex);
                    console.error('Protractor-beautiful-reporter could not take the screenshot');
                }
                metaData.screenShotFile = void 0;
            }
        }

        util.storeMetaData(metaData, jsonPartsPath, descriptions);
        util.addMetaData(metaData, metaDataPath, this._screenshotReporter.finalOptions);
        this._screenshotReporter.finalOptions.prepareAssets = false; // signal to utils not to write all files again

    }

    // Enabling backwards-compat.  Construct Jasmine v1 style spec.suite.
    _buildSuite() {

        const buildSuite = (suiteNames, i) => {
            if (i < 0) {
                return null;
            }
            return {
                description: suiteNames[i],
                parentSuite: buildSuite(suiteNames, i - 1)
            };
        };

        return buildSuite(this._suiteNames, this._suiteNames.length);

    }

}

/**
 * Returns a reporter that complies with the new Jasmine 2.x custom_reporter.js spec:
 * http://jasmine.github.io/2.1/custom_reporter.html
 */
ScreenshotReporter.prototype.getJasmine2Reporter = function () {

    let reporter = new Jasmine2Reporter({ screenshotReporter: this });
    expectFailed(reporter);
    return reporter;
};


/** Function: reportSpecResults
 * Backward compatibility
 * Jasmine 1 is no longer supported
 */
ScreenshotReporter.prototype.reportSpecResults =
    function reportSpecResults(spec) {
        throw new Error('Jasmine 1 is no longer supported. Please upgrade to Jasmine2.')
    };

function nowString() {
    return (new Date()).toISOString();
}

module.exports = ScreenshotReporter;