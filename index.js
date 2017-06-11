var express = require('express');
var cache = require('memory-cache');
var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data

var app = express();
app.use(bodyParser.json()); // for parsing application/json

/* Notes
 *
 * - Measurements are always recorded using floating point numbers.
 * - Measurement recordings will ALWAYS include a timestamp.
 * - Measurement recordings MAY NOT ALWAYS include additional information.
 * - The additional information recorded may change over time, as different garden
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


/* ---------------------- Middleware ------------------------------*/

function isTime(timestampStr) {
  return timestampStr.indexOf('T') !== -1;
}

/**
 *
 * Checks that a valid timestamp is present. Returns the datetime formatted in a consistent manner.
 * @param  {Object} params request body params
 * @return {String|null}        formatted datetime string
 */
function validateTimestamp(req, res, next) {
  var errorMessage = 'Must provide timestamp in ISO format';
  var timestamp = req.params.timestamp || (Object.keys(req.body).length && req.body.timestamp);
  if (!timestamp) {
    reportError(res, errorMessage);
  }

  var date = new Date(timestamp);
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

// TODO: report error if the same data point is included multiple times inside this blob?
function validateNumericalData(req, res, next) {
  var validationFailed = false;
  for (field in req.body) {
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
  var recordedData = !!getMeasurements(req.formattedTimestamp);
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

function updateMinCalc(input, newValue) {
  var min = parseFloat(input);
  if (typeof input === 'undefined' || newValue < input) {
    min = newValue;
  }
  return min;
}

function updateMaxCalc(input, newValue) {
  var max = parseFloat(input);
  if (typeof input === 'undefined' || newValue > input) {
    max = newValue;
  }

  return max;
}

function updateAvgCalc(input) {
  var sum = input.reduce((acc, val) => parseFloat(acc) + parseFloat(val));
  return sum / input.length;
}

/**
 * Expects valid Datetime objects. Returns false if this timestamp is not within our time range.
 * @param  {Datetime} input
 * @param  {Object} query - query params from the URL
 * @return {[type]}       [description]
 */
function isWithinTimeRange(input, query) {
  // Note: Could use moment.js for a more robust solution. This is good enough for now.
  const timestamp = Date.parse(input);

  if (query.fromDateTime && query.toDateTime) {
    return withinRange = query.fromDateTime.valueOf() <= timestamp.valueOf() &&
        timestamp.valueOf() < query.toDateTime.valueOf();
  } else if (query.fromDateTime && query.fromDateTime.valueOf() <= timestamp.valueOf()) {
    return true;
  } else if (query.toDateTime && timestamp.valueOf() < query.toDateTime.valueOf()) {
    return true;
  }

  return false;
}

function expandParam(query, key) {
  var output = [];
  // If multiple 'metrics' query params are defined, they will be bundled into an array
  if (Array.isArray(query[key])) {
    output = output.concat(query[key]);
  } else {
    output.push(query[key]);
  }

  return output;
}

// Metrics are properties like "precipitation", "temperature"
function buildMetricsParam(query) {
  return expandParam(query, 'metric');
}

function buildStatsParam(query) {
  var stats = expandParam(query, 'stat');

  // We only support certain types of stat calculations
  var output = {};
  var allowedStats = ['min', 'max', 'average'];
  stats.filter((key) => allowedStats.indexOf(key) !== -1)
      .forEach((key) => output[key] = true);
  return output;
}

/**
 * Calculates stats based on all the measurements we've recorded.
 * @param  {Object} query - optional. URL query params you can use to filter the data
 * @param  {string} query.stat - ex: min, max, average
 * @param  {string} query.metric - ex: precipitation, temperature
 * @param  {string} query.toDateTime - ISO formatted. ex: 2015-09-01T16:00:01.000Z
 * @param  {string} query.fromDateTime - ISO formatted. ex: 2015-09-01T16:00:01.000Z
 */
function calculateStats(query) {
  var keys = Object.keys(query|| {});
  // Metrics are properties like "precipitation", "temperature"
  var metrics = buildMetricsParam(query);
  // Stats are things like min, max, average.
  // Detect which stats we are interested in, since we only support a few specific actions.
  var stats = buildStatsParam(query);
  var areDatesRestricted = false;
  if (query.fromDateTime) {
    areDatesRestricted = true;
    query.fromDateTime = Date.parse(query.fromDateTime);
  }
  if (query.toDateTime) {
    areDatesRestricted = true;
    query.toDateTime = Date.parse(query.toDateTime);
  }

  var runningStats = {};
  var accumulatedDataPoints = {};
  var timestamps = cache.keys();
  for (timestamp of timestamps) {
    var data = cache.get(timestamp);
    if (areDatesRestricted && !isWithinTimeRange(timestamp, query)) {
      continue;
    }

    metrics.forEach((metric) => {
      if (typeof data[metric] !== 'undefined') {
        if (!accumulatedDataPoints[metric]) {
          accumulatedDataPoints[metric] = [data[metric]];
          runningStats[metric] = {};
        } else {
          accumulatedDataPoints[metric].push(data[metric]);
        }

        if (stats.min) {
          runningStats[metric].min = updateMinCalc(runningStats[metric].min, data[metric])
        }

        if (stats.max) {
          runningStats[metric].max = updateMaxCalc(runningStats[metric].max, data[metric])
        }
      }
    });
  }

  var output = [];
  metrics.forEach((metric) => {
    if (stats.min && runningStats[metric]) {
      output.push([metric, 'min', runningStats[metric].min]);
    }
    if (stats.max && runningStats[metric]) {
      output.push([metric, 'max', runningStats[metric].max]);
    }
    if (stats.average && accumulatedDataPoints[metric] && accumulatedDataPoints[metric].length) {
      output.push([metric, 'average', updateAvgCalc(accumulatedDataPoints[metric])]);
    }
  });
  return output;
}


/* ---------------------- Routes ------------------------------*/
function reportError(res, errorMessage) {
  res.status(400).send(errorMessage);
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
    var measurement = cache.get(timestamp);
    return measurement ? measurement : null;
  }

  // Pull all data available for this date
  var output = [];
  for (key of cache.keys()) {
    if (key.indexOf(timestamp) !== -1) {
      output.push(cache.get(key));
    }
  }

  return output.length ? output : null;
}

// Responds with "hello world" when a GET request is made to the homepage
app.get('/', function (req, res) {
  var output = 'Welcome to Sarah\'s Garden. Here\'s some info on what you can do';
  output += `To record a measurement: POST /measurements`;
  // TODO: print help information
  res.send(output);
})

// Sends a Measurement
app.post('/measurements', upload.array(),
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
app.get('/measurements/:timestamp',
  validateTimestamp,
  function (req, res) {
    var measurements = getMeasurements(req.formattedTimestamp);
    if (measurements) {
      res.send(measurements);
    } else {
      res.status(404).end('No data found');
    }
  }
)

// Replaces a recorded Measurement - This is almost identical to POST route. The difference is that
// if no data currently exists, the update here will fail.
app.put('/measurements/:timestamp', upload.array(),
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
app.patch('/measurements/:timestamp', upload.array(),
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
app.delete('/measurements/:timestamp',
  validateTimestamp,
  validateHasExistingData,
  function (req, res) {
    cache.del(req.formattedTimestamp);
    res.status(204).end();
  }
)

// Returns an array of Statistics. If no stats recorded for a particular metric,
// an empty array will be returned. Note, multple 'stat' and 'metric' params can be specified.
//
// Params can be something like:
//   stat: min
//   stat: max
//   stat: average
//   metric: dewPoint
//   fromDateTime: 2015-09-01T16:00:00.000Z
//   toDateTime: 2015-09-01T16:00:00.000Z
app.get('/stats', function (req, res) {
  // res.send(req.query);
  res.send(calculateStats(req.query));
})

// 404 - Page not found
app.use(function (req, res, next) {
  res.status(404).send("Sorry can't find that!");
})

// 500 - Unspecified server error
app.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
  cache.put( "2015-09-01T16:00:00.000Z" , {
    "timestamp": "2015-09-01T16:00:00.000Z" ,
    "temperature":  "27.1",
    "dewPoint":  "16.9"
  });
  cache.put("2015-09-01T16:10:00.000Z", {
    "timestamp": "2015-09-01T16:10:00.000Z",
    "temperature":  "27.3"
  });
  cache.put("2015-09-01T16:20:00.000Z", {
    "timestamp": "2015-09-01T16:20:00.000Z",
    "temperature":  "27.5",
    "dewPoint":  "17.1"
  });
  cache.put("2015-09-01T16:30:00.000Z", {
    "timestamp": "2015-09-01T16:30:00.000Z",
    "temperature":  "27.4",
    "dewPoint":  "17.3"
  });
  cache.put("2015-09-01T16:40:00.000Z", {
    "timestamp": "2015-09-01T16:40:00.000Z",
    "temperature":  "27.2",
  });
  cache.put("2015-09-01T17:00:00.000Z", {
    "timestamp": "2015-09-01T17:00:00.000Z",
    "temperature":  "28.1",
    "dewPoint":  "18.3"
  });
})
