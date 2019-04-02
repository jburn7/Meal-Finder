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

//removes all non a-Z and space characters
const removeSpecialCharacters = function(str)
{
    for(i = 0; i < str.length; ++i)
    {
        if(i >= str.length)
        {
            break;
        }
        if(!(str[i] >= "a" && str[i] <= "Z" && str[i] == " "))
        {
            str = str.substr(0, i) + str.substr(i + 1);
        }
    }
    
    return str;
}

app.post('/', urlencodedParser, function (req, res) {
    // TODO: validate POST data to check for errors
    
    //TODO: add more forms for user to set radius, price limit, sort category, etc
    //DEBUG
    const userRadius = 1
    const userPriceLimit = 15
    
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
                    'pickup-radius': userRadius
                }
            }
            
            var info;
            let getRestJSON = function() {
                return new Promise(function (resolve, reject) {
                    request.get(options, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            info = JSON.parse(body);
                            resolve(info)
                        } else {
                            reject("bad response for getting restaurant");
                        }
                    })
                })
            }
            
            Promise.resolve(getRestJSON()).then(() => callback(null, info)).catch(
                function(error){console.log(error)
                })
        })
    }
    
    const getNutritionOfMeal = function(mealName){
        return new Promise(function(resolve, reject){
            var options = {
                method: 'GET',
                url: 'https://api.edamam.com/api/food-database/parser',
                qs:
                    {
                        app_id: process.env.EDAMAM_APP_ID,
                        app_key: process.env.EDAMAM_APP_KEY,
                        ingr: encodeURIComponent(mealName)
                    }
            }
    
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var info = JSON.parse(body);
    
                    //determine the nutrition based on the top 'generic meal' category in the json body from Edamam
                    for (i = 0; i < info.hints.length; ++i) {
                        if (info.hints[i].category == 'Generic meals') {
                            resolve(info.hints[i].food.nutrients);
                        }
                    }
                    
                    reject("no meals");
                }
                
                //no meals were returned
                else {
                    reject("bad response when getting edamam nutrition");
                }
            });
        })
    }
    
    const getRestMenus = function(restJSON, callback){
        return new Promise(function(resolve, reject){
        
            var topFood = {}
            var topRest = {}
            var rest_keys = [];
            var rest_names = [];
            for(i = 0; i < restJSON.restaurants.length; ++i){
                rest_keys.push({'restKey': restJSON.restaurants[i].apiKey, 'restIndex': i});
                rest_names.push(restJSON.restaurants[i].name);
            }
            
            let getMenu = function(restaurant) {
                return new Promise(function(resolve, reject)
                {
                    var options = {
                        method: 'GET',
                        url: 'https://eatstreet.com/publicapi/v1/restaurant/' + restaurant.restKey + '/menu',
                        qs: {
                            'access-token': process.env.EATSTREET_KEY,
                            'apiKey': restaurant.restKey
                        }
                    }
                    
                    var id;
                    
                    //TODO: fix crashing. maybe need to find a new architecture for setting the timeout
                    
                    //const timedGetMenu = function() {
                        request.get(options, function (error, response, body) {
                            if (!error && response.statusCode == 200) {
                                const info = JSON.parse(body);
                                
                                for (i = 0; i < info.length; ++i) {
                                    //console.log(info[i])
                                    if(typeof info === 'undefined' || typeof info[i] === 'undefined')
                                    {
                                        console.log("undef")
                                    }
                                    
                                    else {
                                        console.log(i)
                                        console.log(info[i])
                                        for (j = 0; j < info[i].items.length; ++j) {
                                            if (info[i].items[j].basePrice < userPriceLimit) {
                                                let nutritionPromise = getNutritionOfMeal(removeSpecialCharacters(info[i].items[j].name));
                                                nutritionPromise.then(function (currFood) {
                                                    //if currFood > topFood for whatever value we're sorting by
                                                    //topFood = currFood
                                                    //topRest = restaurant.restIndex
                                                }).catch(
                                                    function (error) {
                                                        console.log(error)
                                                    })
                                            }
                                        }
                                    }
                                }
                                
                                clearInterval(id)
                                resolve();
                            } else {
                                if (response.statusCode != 429) //429 = too many requests per second, so just wait
                                {
                                    clearInterval(id)
                                    reject("bad response when getting menu");
                                }
                                else {
                                    console.log("waiting");
                                }
                            }
                        })
                    //}
                    
                    //id = setInterval(timedGetMenu, 100);
                })
            }
            
            let menuPromises = rest_keys.map(getMenu);
            
            let menuPromisesDebug = [menuPromises[0], menuPromises[1]];
            
            //TODO: send the callback function the top meal and the restaurant corresponding to that top meal, not an array of every single meal
            Promise.all(menuPromisesDebug).then(() =>
                callback(null, topFood, topRest)).catch(
                    function(error){console.log(error)
                })
        })
    }
    
    async.waterfall([getRestNames, getRestMenus], function renderResult(error, topFood, topRest){
        if (error) {
            res.render('index-result', {result: 'Error processing'})
        }
        else {
            res.render('index-result', {menuItem: topFood, restaurant: topRest})
        }
    })
})

app.listen(app.get('port'), function () {
    console.log('Node app running at localhost:' + app.get('port'))
})