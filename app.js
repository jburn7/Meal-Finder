// const path = require("path")
const express = require('express')
const request = require('request')
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const app = express()

// app.use(express.static(path.join(__dirname, "client", "build")))

app.set('port', (process.env.PORT || 5000))

app.get('/', function (req, res) {
    
    //can generate via Postman or just by looking at the API's documentation
    var options = {
        method: 'GET',
        url: 'https://eatstreet.com/publicapi/v1/restaurant/search',
        qs:
            {
                'access-token': "//TODO: insert eat street api key here",
                latitude: '42.350498',
                longitude: '-71.105400',
                'pickup-radius': '1'
            }
    }
    
    request(options, function (error, response, body) {
        if (error) throw new Error(error);
        
        var info = JSON.parse(body);
        
        var res_html = ""; //build here and send in one res.send()
        
        for (i = 0; i < info.restaurants.length; ++i) {
            res_html += info.restaurants[i].name + '<br>';
            
            //TODO: get restaurant id via info.apiKey, then use that id in the following url to get the menu:
            //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
            //so you will need to create a new request() where options just contains the following JSON entries:
            //method: 'GET', url: //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
            
            //then add the menu's contents to res_html
            //also when printing please use indents or some other way to indicate that this menu belongs to the given restaurant, so that it is not one long list of restaurants and menu items
        }
        
        res.send(res_html);
    });
})

// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "client", "build", "index.html"));
// });

app.listen(app.get('port'), function () {
  console.log('Node app running at localhost:' + app.get('port'))
})