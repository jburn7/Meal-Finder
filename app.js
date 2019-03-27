const express = require('express')
const request = require('request')
const path = require("path")
const bodyParser = require('body-parser')
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const app = express()
const dotenv = require('dotenv');

dotenv.config();

app.set('port', (process.env.PORT || 5000))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', function (req, res) {
    res.render('index')
})

app.post('/', urlencodedParser, function (req, res) {
    // TODO: validate POST data to check for errors
    
    //can generate via Postman or just by looking at the API's documentation
    var options = {
        method: 'GET',
        url: 'https://eatstreet.com/publicapi/v1/restaurant/search',
        qs: {
            'access-token': process.env.EATSTREET_KEY, // Uses API key in Heroku config vars
            'street-address': req.body['street-address'],
            'method': 'both',
            'pickup-radius': '1'
        }
    }
    
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            var rest_names = [] //build here and send in one res.send()
            
            for (i = 0; i < info.restaurants.length; ++i) {
                rest_names.push(info.restaurants[i].name)
                
                //TODO: get restaurant id via info.apiKey, then use that id in the following url to get the menu:
                //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
                //so you will need to create a new request() where options just contains the following JSON entries:
                //method: 'GET', url: //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
                
                //then add the menu's contents to res_html
                //also when printing please use indents or some other way to indicate that this menu belongs to the given restaurant, so that it is not one long list of restaurants and menu items
            }

            res.render('index-result', { data: rest_names })
        } 
        else { res.render('index-result', { data: [] }) }
    })
})

app.listen(app.get('port'), function () {
    console.log('Node app running at localhost:' + app.get('port'))
})