// @flow
import BaseAPI from './BaseAPI';
import {
  ADL,
  CMI,
  CMICommentsFromLearnerObject,
  CMICommentsFromLMSObject,
  CMIInteractionsCorrectResponsesObject,
  CMIInteractionsObject,
  CMIInteractionsObjectivesObject,
  CMIObjectivesObject,
} from './cmi/scorm2004_cmi';
import * as Util from './utilities';
import {scorm2004_constants} from './constants/api_constants';
import {scorm2004_error_codes} from './constants/error_codes';
import {correct_responses} from './constants/response_constants';
import {valid_languages} from './constants/language_constants';
import {scorm2004_regex} from './regex';

const constants = scorm2004_constants;

/**
 * API class for SCORM 2004
 */
export default class Scorm2004API extends BaseAPI {
  #version: '1.0';

  /**
   * Constructor for SCORM 2004 API
   */
  constructor() {
    super(scorm2004_error_codes);

    this.cmi = new CMI(this);
    this.adl = new ADL(this);

    // Rename functions to match 2004 Spec and expose to modules
    this.Initialize = this.lmsInitialize;
    this.Terminate = this.lmsTerminate;
    this.GetValue = this.lmsGetValue;
    this.SetValue = this.lmsSetValue;
    this.Commit = this.lmsCommit;
    this.GetLastError = this.lmsGetLastError;
    this.GetErrorString = this.lmsGetErrorString;
    this.GetDiagnostic = this.lmsGetDiagnostic;
  }

  /**
   * Getter for #version
   * @return {string}
   */
  get version() {
    return this.#version;
  }

  /**
   * @return {string} bool
   */
  lmsInitialize() {
    return this.initialize('Initialize');
  }

  /**
   * @return {string} bool
   */
  lmsTerminate() {
    return this.terminate('Terminate', true);
  }

  /**
   * @param {string} CMIElement
   * @return {string}
   */
  lmsGetValue(CMIElement) {
    return this.getValue('GetValue', true, CMIElement);
  }

  /**
   * @param {string} CMIElement
   * @param {any} value
   * @return {string}
   */
  lmsSetValue(CMIElement, value) {
    return this.setValue('SetValue', true, CMIElement, value);
  }

  /**
   * Orders LMS to store all content parameters
   *
   * @return {string} bool
   */
  lmsCommit() {
    return this.commit('Commit');
  }

  /**
   * Returns last error code
   *
   * @return {string}
   */
  lmsGetLastError() {
    return this.getLastError('GetLastError');
  }

  /**
   * Returns the errorNumber error description
   *
   * @param {(string|number)} CMIErrorCode
   * @return {string}
   */
  lmsGetErrorString(CMIErrorCode) {
    return this.getErrorString('GetErrorString', CMIErrorCode);
  }

  /**
   * Returns a comprehensive description of the errorNumber error.
   *
   * @param {(string|number)} CMIErrorCode
   * @return {string}
   */
  lmsGetDiagnostic(CMIErrorCode) {
    return this.getDiagnostic('GetDiagnostic', CMIErrorCode);
  }

  /**
   * Sets a value on the CMI Object
   *
   * @param {string} CMIElement
   * @param {any} value
   */
  setCMIValue(CMIElement, value) {
    this._commonSetCMIValue('SetValue', true, CMIElement, value);
  }

  /**
   * Gets or builds a new child element to add to the array.
   *
   * @param {string} CMIElement
   * @param {any} value
   * @return {any}
   */
  getChildElement(CMIElement, value) {
    let newChild;

    if (this.stringContains(CMIElement, 'cmi.objectives')) {
      newChild = new CMIObjectivesObject(this);
    } else if (this.stringContains(CMIElement, '.correct_responses')) {
      const parts = CMIElement.split('.');
      const index = Number(parts[2]);
      const interaction = this.cmi.interactions.childArray[index];
      if (typeof interaction.type === 'undefined') {
        this.throwSCORMError(scorm2004_error_codes.DEPENDENCY_NOT_ESTABLISHED);
      } else {
        const interaction_type = interaction.type;
        const interaction_count = interaction.correct_responses._count;
        if (interaction_type === 'choice') {
          for (let i = 0; i < interaction_count && this.lastErrorCode ===
          0; i++) {
            const response = interaction.correct_responses.childArray[i];
            if (response.pattern === value) {
              this.throwSCORMError(scorm2004_error_codes.GENERAL_SET_FAILURE);
            }
          }
        }

        const response_type = correct_responses[interaction_type];
        let nodes = [];
        if (response_type.delimiter !== '') {
          nodes = String(value).split(response_type.delimiter);
        } else {
          nodes[0] = value;
        }

        if (nodes.length > 0 && nodes.length <= response_type.max) {
          this.checkCorrectResponseValue(interaction_type, nodes, value);
        } else if (nodes.length > response_type.max) {
          this.throwSCORMError(scorm2004_error_codes.GENERAL_SET_FAILURE,
              'Data Model Element Pattern Too Long');
        }
      }
      if (this.lastErrorCode === 0) {
        newChild = new CMIInteractionsCorrectResponsesObject(this);
      }
    } else if (this.stringContains(CMIElement, '.objectives')) {
      newChild = new CMIInteractionsObjectivesObject(this);
    } else if (this.stringContains(CMIElement, 'cmi.interactions')) {
      newChild = new CMIInteractionsObject(this);
    } else if (this.stringContains(CMIElement, 'cmi.comments_from_learner')) {
      newChild = new CMICommentsFromLearnerObject(this);
    } else if (this.stringContains(CMIElement, 'cmi.comments_from_lms')) {
      newChild = new CMICommentsFromLMSObject(this);
    }

    return newChild;
  }

  /**
   * Validate correct response.
   * @param {string} CMIElement
   * @param {*} value
   */
  validateCorrectResponse(CMIElement, value) {
    const parts = CMIElement.split('.');
    const index = Number(parts[2]);
    const pattern_index = Number(parts[4]);
    const interaction = this.cmi.interactions.childArray[index];

    const interaction_type = interaction.type;
    const interaction_count = interaction.correct_responses._count;
    if (interaction_type === 'choice') {
      for (let i = 0; i < interaction_count && this.lastErrorCode === 0; i++) {
        const response = interaction.correct_responses.childArray[i];
        if (response.pattern === value) {
          this.throwSCORMError(scorm2004_error_codes.GENERAL_SET_FAILURE);
        }
      }
    }

    const response_type = scorm2004_constants.correct_responses[interaction_type];
    if (typeof response_type.limit !== 'undefined' || interaction_count <
        response_type.limit) {
      let nodes = [];
      if (response_type.delimiter !== '') {
        nodes = String(value).split(response_type.delimiter);
      } else {
        nodes[0] = value;
      }

      if (nodes.length > 0 && nodes.length <= response_type.max) {
        this.checkCorrectResponseValue(interaction_type, nodes, value);
      } else if (nodes.length > response_type.max) {
        this.throwSCORMError(scorm2004_error_codes.GENERAL_SET_FAILURE,
            'Data Model Element Pattern Too Long');
      }

      if (this.lastErrorCode === 0 &&
          (!response_type.duplicate ||
              !this.checkDuplicatedPattern(interaction.correct_responses,
                  pattern_index, value)) ||
          (this.lastErrorCode === 0 && value === '')) {
        // do nothing, we want the inverse
      } else {
        if (this.lastErrorCode === 0) {
          this.throwSCORMError(scorm2004_error_codes.GENERAL_SET_FAILURE,
              'Data Model Element Pattern Already Exists');
        }
      }
    } else {
      this.throwSCORMError(scorm2004_error_codes.GENERAL_SET_FAILURE,
          'Data Model Element Collection Limit Reached');
    }
  }

  /**
   * Gets a value from the CMI Object
   *
   * @param {string} CMIElement
   * @return {*}
   */
  getCMIValue(CMIElement) {
    return this._commonGetCMIValue('GetValue', true, CMIElement);
  }

  /**
   * Returns the message that corresponds to errorNumber.
   *
   * @param {(string|number)} errorNumber
   * @param {boolean} detail
   * @return {string}
   */
  getLmsErrorMessageDetails(errorNumber, detail) {
    let basicMessage = '';
    let detailMessage = '';

    // Set error number to string since inconsistent from modules if string or number
    errorNumber = String(errorNumber);
    if (constants.error_descriptions[errorNumber]) {
      basicMessage = constants.error_descriptions[errorNumber].basicMessage;
      detailMessage = constants.error_descriptions[errorNumber].detailMessage;
    }

    return detail ? detailMessage : basicMessage;
  }

  /**
   * Check to see if a correct_response value has been duplicated
   * @param {CMIArray} correct_response
   * @param {number} current_index
   * @param {*} value
   * @return {boolean}
   */
  checkDuplicatedPattern = (correct_response, current_index, value) => {
    let found = false;
    const count = correct_response._count;
    for (let i = 0; i < count && !found; i++) {
      if (i !== current_index && correct_response.childArray[i] === value) {
        found = true;
      }
    }
    return found;
  };

  /**
   * Checks for a valid correct_response value
   * @param {string} interaction_type
   * @param {Array} nodes
   * @param {*} value
   */
  checkCorrectResponseValue(interaction_type, nodes, value) {
    const response = correct_responses[interaction_type];
    const formatRegex = new RegExp(response.format);
    for (let i = 0; i < nodes.length && this.lastErrorCode === 0; i++) {
      if (interaction_type.match(
          '^(fill-in|long-fill-in|matching|performance|sequencing)$')) {
        nodes[i] = this.removeCorrectResponsePrefixes(nodes[i]);
      }

      if (response.delimiter2 !== undefined) {
        const values = nodes[i].split(response.delimiter2);
        if (values.length === 2) {
          const matches = values[0].match(formatRegex);
          if (!matches) {
            this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
          } else {
            if (!values[1].match(new RegExp(response.format2))) {
              this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
            }
          }
        } else {
          this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
        }
      } else {
        const matches = nodes[i].match(formatRegex);
        if ((!matches && value !== '') ||
            (!matches && interaction_type === 'true-false')) {
          this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
        } else {
          if (interaction_type === 'numeric' && nodes.length > 1) {
            if (Number(nodes[0]) > Number(nodes[1])) {
              this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
            }
          } else {
            if (nodes[i] !== '' && response.unique) {
              for (let j = 0; j < i && this.lastErrorCode === 0; j++) {
                if (nodes[i] === nodes[j]) {
                  this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Remove prefixes from correct_response
   * @param {string} node
   * @return {*}
   */
  removeCorrectResponsePrefixes(node) {
    let seenOrder = false;
    let seenCase = false;
    let seenLang = false;

    const prefixRegex = new RegExp(
        '^({(lang|case_matters|order_matters)=([^}]+)})');
    let matches = node.match(prefixRegex);
    let langMatches = null;
    while (matches) {
      switch (matches[2]) {
        case 'lang':
          langMatches = node.match(scorm2004_regex.CMILangcr);
          if (langMatches) {
            const lang = langMatches[3];
            if (lang !== undefined && lang.length > 0) {
              if (valid_languages[lang.toLowerCase()] === undefined) {
                this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
              }
            }
          }
          seenLang = true;
          break;
        case 'case_matters':
          if (!seenLang && !seenOrder && !seenCase) {
            if (matches[3] !== 'true' && matches[3] !== 'false') {
              this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
            }
          }

          seenCase = true;
          break;
        case 'order_matters':
          if (!seenCase && !seenLang && !seenOrder) {
            if (matches[3] !== 'true' && matches[3] !== 'false') {
              this.throwSCORMError(scorm2004_error_codes.TYPE_MISMATCH);
            }
          }

          seenOrder = true;
          break;
        default:
          break;
      }
      node = node.substr(matches[1].length);
      matches = node.match(prefixRegex);
    }

    return node;
  }

  /**
   * Replace the whole API with another
   * @param {Scorm2004API} newAPI
   */
  replaceWithAnotherScormAPI(newAPI) {
    // Data Model
    this.cmi = newAPI.cmi;
    this.adl = newAPI.adl;
  }

  /**
   * Adds the current session time to the existing total time.
   *
   * @return {string} ISO8601 Duration
   */
  getCurrentTotalTime() {
    const totalTime = this.cmi.total_time;
    const sessionTime = this.cmi.session_time;

    return Util.addTwoDurations(totalTime, sessionTime,
        scorm2004_regex.CMITimespan);
  }
}
