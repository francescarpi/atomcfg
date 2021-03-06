'use babel';

// eslint-disable-next-line import/extensions, import/no-extraneous-dependencies
import { CompositeDisposable } from 'atom';
import fs from 'fs-plus';
import path from 'path';
import * as helpers from 'atom-linter';
import rangeHelpers from './rangeHelpers';

// Local variables
const parseRegex = /(\d+):(\d+):\s(([A-Z])\d{2,3})\s+(.*)/g;

const extractRange = ({ code, message, lineNumber, colNumber, textEditor }) => {
  let result;
  // Make the given line 0-indexed
  const line = lineNumber - 1;
  switch (code) {
    case 'C901':
      result = rangeHelpers.tooComplex(textEditor, message, line);
      break;
    case 'F401':
      result = rangeHelpers.importedUnused(textEditor, message, line);
      break;
    case 'H201':
      // H201 - no 'except:' at least use 'except Exception:'

      // For some reason this rule marks the ":" as the location by default
      result = {
        line,
        col: colNumber - 7,
        endCol: colNumber,
      };
      break;
    case 'H501':
      result = rangeHelpers.noLocalsString(textEditor, line);
      break;
    default:
      // By default just correct the column to be 0-indexed
      result = {
        line,
        col: colNumber - 1,
      };
      break;
  }

  if (Object.hasOwnProperty.call(result, 'endCol')) {
    return [
      [result.line, result.col],
      [result.line, result.endCol],
    ];
  }

  let range;
  try {
    range = helpers.rangeFromLineNumber(textEditor, result.line, result.col);
  } catch (e) {
    // rangeFromLineNumber encountered a problem, throw the result and report
    // to the user.
    throw result;
  }

  return range;
};

const applySubstitutions = (givenExecPath, projDir) => {
  let execPath = givenExecPath;
  const projectName = path.basename(projDir);
  execPath = execPath.replace(/\$PROJECT_NAME/ig, projectName);
  execPath = execPath.replace(/\$PROJECT/ig, projDir);
  const paths = execPath.split(';');
  for (let i = 0; i < paths.length; i += 1) {
    if (fs.existsSync(paths[i])) {
      return paths[i];
    }
  }
  return execPath;
};

const getVersionString = async (versionPath) => {
  if (!Object.hasOwnProperty.call(getVersionString, 'cache')) {
    getVersionString.cache = new Map();
  }
  if (!getVersionString.cache.has(versionPath)) {
    getVersionString.cache.set(versionPath,
      await helpers.exec(versionPath, ['--version']));
  }
  return getVersionString.cache.get(versionPath);
};

const generateInvalidPointTrace = async (execPath, match, filePath, textEditor, point) => {
  const flake8Version = await getVersionString(execPath);
  const issueURL = 'https://github.com/AtomLinter/linter-flake8/issues/new';
  const title = encodeURIComponent(`Flake8 rule '${match[3]}' reported an invalid point`);
  const body = encodeURIComponent([
    `Flake8 reported an invalid point for the rule \`${match[3]}\`, ` +
    `with the messge \`${match[5]}\`.`,
    '', '',
    '<!-- If at all possible, please include code that shows this issue! -->',
    '', '',
    'Debug information:',
    `Atom version: ${atom.getVersion()}`,
    `Flake8 version: \`${flake8Version}\``,
  ].join('\n'));
  const newIssueURL = `${issueURL}?title=${title}&body=${body}`;
  return {
    type: 'Error',
    severity: 'error',
    html: 'ERROR: Flake8 provided an invalid point! See the trace for details. ' +
      `<a href="${newIssueURL}">Report this!</a>`,
    filePath,
    range: helpers.rangeFromLineNumber(textEditor, 0),
    trace: [
      {
        type: 'Trace',
        text: `Original message: ${match[3]} — ${match[5]}`,
        filePath,
        severity: 'info',
      },
      {
        type: 'Trace',
        text: `Requested point: ${point.line + 1}:${point.col + 1}`,
        filePath,
        severity: 'info',
      },
    ],
  };
};

export default {
  activate() {
    require('atom-package-deps').install('linter-flake8');

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.config.observe('linter-flake8.disableTimeout', (value) => {
        this.disableTimeout = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.projectConfigFile', (value) => {
        this.projectConfigFile = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.maxLineLength', (value) => {
        this.maxLineLength = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.ignoreErrorCodes', (value) => {
        this.ignoreErrorCodes = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.maxComplexity', (value) => {
        this.maxComplexity = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.selectErrors', (value) => {
        this.selectErrors = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.hangClosing', (value) => {
        this.hangClosing = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.executablePath', (value) => {
        this.executablePath = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.pycodestyleErrorsToWarnings', (value) => {
        this.pycodestyleErrorsToWarnings = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-flake8.flakeErrors', (value) => {
        this.flakeErrors = value;
      }),
    );
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  provideLinter() {
    return {
      name: 'Flake8',
      grammarScopes: ['source.python', 'source.python.django'],
      scope: 'file',
      lintOnFly: true,
      lint: async (textEditor) => {
        const filePath = textEditor.getPath();
        const fileText = textEditor.getText();

        const parameters = ['--format=default'];

        const projectPath = atom.project.relativizePath(filePath)[0];
        const baseDir = projectPath !== null ? projectPath : path.dirname(filePath);
        const configFilePath = await helpers.findCachedAsync(baseDir, this.projectConfigFile);

        if (this.projectConfigFile && baseDir !== null && configFilePath !== null) {
          parameters.push('--config', configFilePath);
        } else {
          if (this.maxLineLength) {
            parameters.push('--max-line-length', this.maxLineLength);
          }
          if (this.ignoreErrorCodes.length) {
            parameters.push('--ignore', this.ignoreErrorCodes.join(','));
          }
          if (this.maxComplexity) {
            parameters.push('--max-complexity', this.maxComplexity);
          }
          if (this.hangClosing) {
            parameters.push('--hang-closing');
          }
          if (this.selectErrors.length) {
            parameters.push('--select', this.selectErrors.join(','));
          }
        }

        parameters.push('-');

        const execPath = fs.normalize(applySubstitutions(this.executablePath, baseDir));
        const options = {
          stdin: fileText,
          cwd: path.dirname(textEditor.getPath()),
          stream: 'both',
        };
        if (this.disableTimeout) {
          options.timeout = Infinity;
        }

        const result = await helpers.exec(execPath, parameters, options);

        if (textEditor.getText() !== fileText) {
          // Editor contents have changed, tell Linter not to update
          return null;
        }

        if (result.stderr && result.stderr.length && atom.inDevMode()) {
          // eslint-disable-next-line no-console
          console.log(`flake8 stderr: ${result.stderr}`);
        }
        const messages = [];

        let match = parseRegex.exec(result.stdout);
        while (match !== null) {
          const line = Number.parseInt(match[1], 10) || 0;
          const col = Number.parseInt(match[2], 10) || 0;
          const isErr = (match[4] === 'E' && !this.pycodestyleErrorsToWarnings)
            || (match[4] === 'F' && this.flakeErrors);

          try {
            const range = extractRange({
              code: match[3],
              message: match[5],
              lineNumber: line,
              colNumber: col,
              textEditor,
            });
            messages.push({
              type: isErr ? 'Error' : 'Warning',
              text: `${match[3]} — ${match[5]}`,
              filePath,
              range,
            });
          } catch (point) {
            messages.push(await generateInvalidPointTrace(
              execPath, match, filePath, textEditor, point));
          }

          match = parseRegex.exec(result.stdout);
        }
        return messages;
      },
    };
  },
};
