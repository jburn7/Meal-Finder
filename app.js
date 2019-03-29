const express = require('express')
const request = require('request')
const path = require("path")
const bodyParser = require('body-parser')
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const app = express()
const dotenv = require('dotenv')
const request_promise = require('request-promise-lite')
const async = require('async')

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
    
    //async attempt to load menus
    
    const getRestNames = function(callback){
        return new Promise(function(resolve, reject){
            var options = {
                method: 'GET',
                url: 'https://eatstreet.com/publicapi/v1/restaurant/search',
                qs: {
                    'access-token': process.env.EATSTREET_KEY,
                    'street-address': req.body['street-address'],
                    'method': 'both',
                    'pickup-radius': '1'
                }
            }
            
            var restaurants = [];
            var info;
            let getRestJSON = function() {
                return new Promise(function (resolve, reject) {
                    request.get(options, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            info = JSON.parse(body);
                            resolve(info)
                        } else {
                            reject();
                        }
                    })
                })
            }
            
            Promise.resolve(getRestJSON()).then(() => callback(null, info))
        })
    }
    
    const getRestMenus = function(restJSON, callback){
        return new Promise(function(resolve, reject){
        
            var rest_keys = [];
            var rest_names = [];
            for(i = 0; i < restJSON.restaurants.length; ++i){
                rest_keys.push(restJSON.restaurants[i].apiKey);
                rest_names.push(restJSON.restaurants[i].name);
            }
            
            var menus = [[[]]];
            
            let getMenu = function(restaurant) {
                return new Promise(function(resolve, reject)
                {
                    var options = {
                        method: 'GET',
                        url: 'https://eatstreet.com/publicapi/v1/restaurant/' + restaurant + '/menu',
                        qs: {
                            'access-token': process.env.EATSTREET_KEY,
                            'apiKey': restaurant
                        }
                    }
        
                    request.get(options, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            const info = JSON.parse(body);
                            
                            
                            //TODO: need to keep track of the highest rated meal throughout every request, and keep track of its
                            //TODO: corresponding restaurant. we don't need to store every single meal into a giant array, just keep track
                            //TODO: of the leading one
                            //TODO: in the following loop, for every single meal item, we need to access the edamame API and find the nutrition
                            //TODO: for that meal. If its nutrition better matches the user's parameters, then store it and remove the old best meal
                            
                            
                            var category = [];
                            for(i = 0; i < info.length; ++i) {
                                var foodItems = [];
                                for(j = 0; j < info[i].items.length; ++j){
                                    foodItems.push(info[i].items[j].name);
                                }
                                category.push(foodItems);
                            }
                            menus.push(category);
                            resolve();
                        }
                        else {
                            reject();
                        }
                    })
                })
            }
            
            let menuPromises = rest_keys.map(getMenu);
            
            let menuPromisesDebug = [menuPromises[0], menuPromises[1]];
            
            //TODO: send the callback function the top meal and the restaurant corresponding to that top meal, not an array of every single meal
            Promise.all(menuPromisesDebug).then(() =>
                callback(null, rest_names, menus)).catch(
                    function(error){console.log(error)
                })
        })
    }
    
    async.waterfall([getRestNames, getRestMenus], function renderResult(error, restNames, restMenus){
        if (error) {
            res.render('index-result', {result: 'Error processing'})
        }
        else {
            res.render('index-result', {restaurants: restNames, menu: restMenus})
        }
    })
    
    
    
    
    
    
    
    
    
    
    
    //can generate via Postman or just by looking at the API's documentation
    // var options = {
    //     method: 'GET',
    //     url: 'https://eatstreet.com/publicapi/v1/restaurant/search',
    //     qs: {
    //         'access-token': process.env.EATSTREET_KEY, // Uses API key in Heroku config vars
    //         'street-address': req.body['street-address'],
    //         'method': 'both',
    //         'pickup-radius': '1'
    //     }
    // }
    //
    // var rest_keys = [];
    // var rest_names = [] //build here and send in one res.send()
    // var rest_menu =[];
    // request.get(options, function (error, response, body) {
    //     if (!error && response.statusCode == 200) {
    //         var info = JSON.parse(body);
    //
    //         for (i = 0; i < info.restaurants.length; ++i) {
    //             rest_names.push(info.restaurants[i].name);
    //             rest_keys.push(info.restaurants[i].apiKey);
    //
    //             // var options2 = {
    //             //     method: 'GET',
    //             //     url: 'https://eatstreet.com/publicapi/v1/restaurant/' +rest_apikeys + '/menu',
    //             //     qs: {
    //             //         'access-token': "e2756e10b82df4c3", //process.env.EATSTREET_KEY,
    //             //         'apiKey': rest_apikeys
    //             //     }
    //             // }
    //
    //             //rest_menu += debug(options2);
    //             //TODO: get restaurant id via info.apiKey, then use that id in the following url to get the menu:
    //             //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
    //             //so you will need to create a new request() where options just contains the following JSON entries:
    //             //method: 'GET', url: //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
    //
    //             //then add the menu's contents to res_html
    //             //also when printing please use indents or some other way to indicate that this menu belongs to the given restaurant, so that it is not one long list of restaurants and menu item
    //
    //         }
    //
    //
    //
    //         //res.render('index-result', { data: rest_names, menu: rest_menu});
    //
    //         // for (i = 0; i < info.restaurants.length; ++i) {
    //         //     rest_names.push(info.restaurants[i].name)
    //         //
    //         //     //TODO: get restaurant id via info.apiKey, then use that id in the following url to get the menu:
    //         //     //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
    //         //     //so you will need to create a new request() where options just contains the following JSON entries:
    //         //     //method: 'GET', url: //https://eatstreet.com/publicapi/v1/restaurant/[apiKey]/menu
    //         //
    //         //     //then add the menu's contents to res_html
    //         //     //also when printing please use indents or some other way to indicate that this menu belongs to the given restaurant, so that it is not one long list of restaurants and menu items
    //         //
    //         // }
    //         //
    //         // res.render('index-result', { data: rest_names })
    //     }
    //     else { res.render('index-result', { data: [] }); return; }
    // })
    //
    // for(i = 0; i < rest_keys.length; ++i) {
    //     options = {
    //         method: 'GET',
    //         url: 'https://eatstreet.com/publicapi/v1/restaurant/' + rest_keys[i] + '/menu',
    //         qs: {
    //             'access-token': process.env.EATSTREET_KEY,
    //             'apiKey': rest_keys[i]
    //         }
    //     }
    //
    //     request(options, function (error, response, body) {
    //         if (!error && response.statusCode == 200) {
    //             var infomenu = JSON.parse(body);
    //             //build here and send in one res.send()
    //
    //             for (k = 0; k < infomenu[0].items.length; ++k) {
    //                 rest_menu.push(infomenu[0].items[k].name);
    //             }
    //         }
    //
    //     })
    // }
    //
    // res.render('index-result', { data: rest_names, menu: rest_menu});
})

app.listen(app.get('port'), function () {
    console.log('Node app running at localhost:' + app.get('port'))
})