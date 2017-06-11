"use strict";
import express from 'express';
const router = express.Router();
import cache from 'memory-cache';
import multer from 'multer';
const upload = multer(); // for parsing multipart/form-data

/* Notes
 *
 * - Measurements are always recorded using floating point numbers.
 * - Measurement recordings will ALWAYS include a timestamp.
 * - Measurement recordings MAY NOT ALWAYS include additional information.
 * - The additional information recorded may evolve over time, as different garden
 *     instruments are used.
 *
 * Measurement Object Ex:
 * {
 *   timestamp: "2015-09-01T16:00:00.000Z", // Always sent as an ISO-8061 string in UTC
 *   temperature: 22.4,
 *   dewPoint: 18.6 // in celcius
 *   precipitation: 142.2 // in mm
 *   ...
 * }
 */


/* ---------------------- Routes ------------------------------*/

// Sends a Measurement
// NOTE: Will overwrite data without throwing an error, if data waas previously stored for this
// timestamp
// QUESTION: How to handle the case where the same field is defined multiple times in the data blob?
router.post('/', upload.array(),
  validateTimestamp,
  validateNumericalData,
  function(req, res) {
    saveMeasurement(req.formattedTimestamp, req.body);
    res.setHeader('Location', `/measurements/${req.formattedTimestamp}`);
    res.status(201).end();
  }
)

/** Returns one Measurement if provided a timestamp (ex: 2015-09-01T16:20:00.000Z)
 * or an array of Measurements if provided a date (ex: 2015-09-01)
 */
router.get('/:timestamp',
  validateTimestamp,
  function (req, res) {
    const measurements = getMeasurements(req.formattedTimestamp);
    if (measurements) {
      res.send(measurements);
    } else {
      res.status(404).end('No data found');
    }
  }
)

// Replaces a recorded Measurement - This is almost identical to POST route. The difference is that
// if no data currently exists, the update here will fail.
router.put('/:timestamp', upload.array(),
  validateTimestamp,
  validateNumericalData,
  validateMatchingTimestamps,
  validateHasExistingData,
  function(req, res) {
    saveMeasurement(req.formattedTimestamp, req.body);
    res.status(204).end();
  }
)

// Updates a Measurement - Similar to PUT, but only updates the fields outlined in this request.
// All other fields remain unchanged.
router.patch('/:timestamp', upload.array(),
  validateTimestamp,
  validateNumericalData,
  validateMatchingTimestamps,
  validateHasExistingData,
  function (req, res) {
    updateMeasurement(req.formattedTimestamp, req.body);
    res.status(204).end();
  }
)

// Deletes a recorded Measurement
router.delete('/:timestamp',
  validateTimestamp,
  validateHasExistingData,
  function (req, res) {
    cache.del(req.formattedTimestamp);
    res.status(204).end();
  }
)


/* ---------------------- Middleware ------------------------------*/

/**
 *
 * Checks that a valid timestamp is present. Returns the datetime formatted in a consistent manner.
 * @param  {Object} params request body params
 * @return {String|null}        formatted datetime string
 */
function validateTimestamp(req, res, next) {
  const errorMessage = 'Must provide timestamp in ISO format';
  const timestamp = req.params.timestamp || (Object.keys(req.body).length && req.body.timestamp);
  if (!timestamp) {
    reportError(res, errorMessage);
  }

  const date = new Date(timestamp);
  if (isNaN(date)) {
    reportError(res, errorMessage);
  }

  if (isTime(timestamp)) {
    req.formattedTimestamp = date.toISOString();
  } else {
    req.formattedTimestamp = date.toISOString().substring(0, 10);
  }
  next();
}

function validateNumericalData(req, res, next) {
  let validationFailed = false;
  for (const field in req.body) {
    if (field !== 'timestamp' && isNaN(req.body[field])) {
      validationFailed = true;
      break;
    }
  }

  if (validationFailed) {
    reportError(res, 'Data must consist of floating point numbers only');
  } else {
    next();
  }
}

function validateMatchingTimestamps(req, res, next) {
  if (req.params.timestamp !== req.body.timestamp) {
    res.status(409).end('Mismatched timestamps in data');
  } else {
    next();
  }
}

function validateHasExistingData(req, res, next) {
  const recordedData = !!getMeasurements(req.formattedTimestamp);
  if (recordedData) {
    next();
  } else {
    res.status(404).end('No stored data to act on');
  }
}

/* ---------------------- Model ------------------------------*/

/**
 * Records a Measurement for this timestamp.
 * Assumption: If you try recording data to for the same timestamp multipe times, only the last
 * data will stored.
 *
 * @param  {String} timestamp - should have been formatted by our validator
 * @param  {Object} data      - key/value pairs, where values are always floating point values.
 */
function saveMeasurement(timestamp, data) {
  cache.put(timestamp, data);
}

/**
 * Updates fields in an existing Measuremnt. Fields not listed in newData will not be updated.
 * Only support the following stats: min, max, average
 * @param  {String} timestamp
 * @param  {Object} newData   - key/value pairs, where values are always floating point values.
 */
function updateMeasurement(timestamp, newData) {
  const oldRecord = cache.get(timestamp);
  const updatedRecord = Object.assign({}, oldRecord, newData);
  cache.put(timestamp, updatedRecord);
}

/**
 * Returns one Measurement if provided a timestamp (ex: 2015-09-01T16:20:00.000Z)
 * or an array of Measurements if provided a date (ex: 2015-09-01).
 * Will return null if no data is saved for the timestamp.
 * @param  {String} timestamp
 * @return {Measurement|Measurement[]|null}
 */
function getMeasurements(timestamp) {
  // This is a timestamp, not a date
  if (isTime(timestamp)) {
    const measurement = cache.get(timestamp);
    return measurement ? measurement : null;
  }

  // Pull all data available for this date
  const output = [];
  for (let key of cache.keys()) {
    if (key.indexOf(timestamp) !== -1) {
      output.push(cache.get(key));
    }
  }

  return output.length ? output : null;
}

function reportError(res, errorMessage) {
  res.status(400).send(errorMessage);
}

function isTime(timestampStr) {
  return timestampStr.indexOf('T') !== -1;
}

module.exports = router
