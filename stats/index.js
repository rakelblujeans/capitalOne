"use strict";
import express from 'express';
const router = express.Router()
import cache from 'memory-cache';

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
router.get('/', function (req, res) {
  res.send(calculateStats(req.query));
})


/* --------------------- PRIVATE FUNCTIONS --------------------- */

function updateMinCalc(input, newValue) {
  let min = parseFloat(input);
  if (typeof input === 'undefined' || newValue < input) {
    min = newValue;
  }
  return min;
}

function updateMaxCalc(input, newValue) {
  let max = parseFloat(input);
  if (typeof input === 'undefined' || newValue > input) {
    max = newValue;
  }

  return max;
}

function updateAvgCalc(input) {
  const sum = input.reduce((acc, val) => parseFloat(acc) + parseFloat(val));
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
    return query.fromDateTime.valueOf() <= timestamp.valueOf() &&
        timestamp.valueOf() < query.toDateTime.valueOf();
  } else if (query.fromDateTime && query.fromDateTime.valueOf() <= timestamp.valueOf()) {
    return true;
  } else if (query.toDateTime && timestamp.valueOf() < query.toDateTime.valueOf()) {
    return true;
  }

  return false;
}

function expandParam(query, key) {
  let output = [];
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
  const stats = expandParam(query, 'stat');

  // We only support certain types of stat calculations
  const output = {};
  const allowedStats = ['min', 'max', 'average'];
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
  const keys = Object.keys(query|| {});
  // Metrics are properties like "precipitation", "temperature"
  const metrics = buildMetricsParam(query);
  // Stats are things like min, max, average.
  // Detect which stats we are interested in, since we only support a few specific actions.
  const stats = buildStatsParam(query);
  let areDatesRestricted = false;
  if (query.fromDateTime) {
    areDatesRestricted = true;
    query.fromDateTime = Date.parse(query.fromDateTime);
  }
  if (query.toDateTime) {
    areDatesRestricted = true;
    query.toDateTime = Date.parse(query.toDateTime);
  }

  const runningStats = {};
  const accumulatedDataPoints = {};
  const timestamps = cache.keys();
  for (let timestamp of timestamps) {
    const data = cache.get(timestamp);
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

  const output = [];
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


module.exports = router
