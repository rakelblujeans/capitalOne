"use strict";
import express from 'express';
const router = express.Router();
import cache from 'memory-cache';
import bodyParser from 'body-parser';

import measurements from './measurements';
import stats from './stats';

var app = express();
app.use(bodyParser.json()); // for parsing application/json

// Responds with "hello world" when a GET request is made to the homepage
app.get('/', function (req, res) {
  var output = 'Welcome to Sarah\'s Garden. Here\'s some info on what you can do';
  output += `To record a measurement: POST /measurements`;
  // TODO: print more detailed help information...
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
})
