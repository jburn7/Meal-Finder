var express = require('express');
var app = express();

app.get('/', function (req, res) {
  res.send('this is our project');
});

app.listen(0, function () {
  console.log('App listening on port 3000');
});