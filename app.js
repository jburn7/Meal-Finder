// const path = require("path")
const express = require('express')
const request = require('request')
const app = express()

// app.use(express.static(path.join(__dirname, "client", "build")))

app.set('port', (process.env.PORT || 5000))

app.get('/', function (req, res) {
  if (Object.keys(req.query).length == 0) {
    res.send('After the url type /?id=1234 to display the brewery name. Any id from 1 to 8029 will work.')
  } 
  else {
    request('https://api.openbrewerydb.org/breweries/' + req.query.id, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var info = JSON.parse(body)
        res.send('Brewery Name: ' + info.name + '<br>' + 'Website: ' + info.website_url)
      }
    })
  }
})

// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "client", "build", "index.html"));
// });

app.listen(app.get('port'), function () {
  console.log('Node app running at localhost:' + app.get('port'))
})