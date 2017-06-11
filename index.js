var express = require('express');
var cache = require('memory-cache');
var bodyParser = require('body-parser');
var measurements = require('./measurements');
var stats = require('./stats');

var app = express();
app.use(bodyParser.json()); // for parsing application/json

// Responds with "hello world" when a GET request is made to the homepage
app.get('/', function (req, res) {
  var output = 'Welcome to Sarah\'s Garden. Here\'s some info on what you can do';
  output += `To record a measurement: POST /measurements`;
  // TODO: print help information
  res.send(output);
})

app.use('/measurements', measurements);
app.use('/stats', stats);

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
