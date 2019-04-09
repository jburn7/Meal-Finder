const express = require('express')
const request = require('request')
const path = require("path")
const bodyParser = require('body-parser')
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const app = express()
const dotenv = require('dotenv')
const request_promise = require('request-promise-lite')
const async = require('async')
const MongoClient = require('mongodb').MongoClient

dotenv.config();

app.set('port', (process.env.PORT || 5000))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
app.use(express.static(path.join(__dirname, 'public')))

// Testing will remove later, connects to MongoDB Atlas and inserts a document
const uri = "mongodb+srv://" + process.env.MONGO_USERNAME + ":" + process.env.MONGO_PASSWORD + "@cs411-vrnjt.mongodb.net/test?retryWrites=true";
const client = new MongoClient(uri, { useNewUrlParser: true });
client.connect(err => {
    const collection = client.db("test").collection("devices");
    // perform actions on the collection object
    collection.insertOne({ connectSuccess: 'Success!' })
    client.close();
});

app.get('/', function (req, res) {
    res.render('index')
})

//removes all non a-Z and space characters
const removeSpecialCharacters = function(str)
{
	const s = str.replace(/[^a-zA-Z ]/g, '');
	return s
}

app.post('/', urlencodedParser, function (req, res) {
    // TODO: validate POST data to check for errors
    const userRadius = req.body['radius']
    const userPriceLimit = req.body['price']
	const userSearchString = req.body['meal']
	const userSearchWords = userSearchString.toLowerCase().split(" ");
	
	var topFood = {ENERC_KCAL: 0}
	var topRest = {}
    
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
    
    const getNutritionOfMeal = function(mealName, rest, restJSON){
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
                    for (var i = 0; i < info.hints.length; ++i) {
                        if (info.hints[i].food.category === "Generic meals") {
                        	let currFood = info.hints[i].food.nutrients;
	                        if(currFood != {})
	                        {
		                        if (currFood.ENERC_KCAL > topFood.ENERC_KCAL) {
			                        topFood = currFood;
			                        topFood["name"] = mealName;
			                        topRest = restJSON.restaurants[rest.restIndex];
		                        }
	                        }
                            resolve(info.hints[i].food.nutrients);
                        }
                    }
                    
                    console.log("no meals")
                    resolve({}); //return an empty JSON object, so caller will have to check if response is valid before accessing elements
                }
                
                else {
                    reject("bad response when getting edamam nutrition");
                }
            });
        })
    }
    
    const foodMatchesSearch = function(foodJSON)
	{
		const foodNameWords = (foodJSON.name + foodJSON.description).toLowerCase().split(" ");
		//TODO: make this function return a number which represents how much the food matches the search, instead of just a boolean, so
		// that we can sort them later on
		//for each word in name/description
			//for each word in user search
				//if food word == user search word
					//return true
		for(var i = 0; i < foodNameWords.length; i++)
		{
			for(var j = 0; j < userSearchWords.length; j++)
			{
				if(foodNameWords[i] == userSearchWords[j])
				{
					return true;
				}
			}
		}
		
		return false;
	}
    
    const getRestMenus = function(restJSON, callback){
        return new Promise(function(resolve, reject){
        	
            var rest_keys = [];
            var rest_names = [];
            for(var i = 0; i < restJSON.restaurants.length; ++i){
                rest_keys.push({'restKey': restJSON.restaurants[i].apiKey, 'restIndex': i});
                rest_names.push(restJSON.restaurants[i].name);
            }
	
            //cap the number of calls to 100, which is Edamam's food database limit per minute
	        //TODO: instead of taking the first 100 available meals, sort all of them by how strongly they match the user's search and
	        // look up nutrition for only the top 100 matches
	        var callsRemaining = 100;
            var foodsToLookup = [];
            
            let addFoodsToMenu = function(options, thisRest)
            {
	            return new Promise(function(resolve, reject)
	            {
		            request.get(options, function (error, response, body)
		            {
			            if (!error && response.statusCode == 200) {
				            const info = JSON.parse(body);
				            
				            for (var i = 0; i < info.length; i++) {
					            for (var j = 0; j < info[i].items.length; j++) {
						            if (callsRemaining > 0 && info[i].items[j].basePrice < userPriceLimit && foodMatchesSearch(info[i].items[j])) {
							            callsRemaining--;
							            let nutritionPromise = getNutritionOfMeal(removeSpecialCharacters(info[i].items[j].name), thisRest, restJSON);
							            foodsToLookup.push(nutritionPromise)
						            }
					            }
				            }
				            
				            resolve();
			            } else {
				            if (response.statusCode != 429) //429 = too many requests per second, this should not be happening
				            {
					            reject("bad response when getting menu");
				            } else {
					            console.log("too many reqs per second for Eat Street API");
				            }
			            }
		            })
	            })
            }
            
            let pollMenusForFood = function(restaurants)
            {
	            return new Promise(function(resolve, reject)
	            {
	            	var id;
	            	let interval = function()
		            {
		            	if(restaurants.length === 0)
			            {
				            clearInterval(id);
				            Promise.all(foodsToLookup).then(() => {
				            	resolve();
				            })
			            }
		            	else {
				            const thisRest = restaurants.pop();
				            var options = {
					            method: 'GET',
					            url: 'https://eatstreet.com/publicapi/v1/restaurant/' + thisRest.restKey + '/menu',
					            qs: {
						            'access-token': process.env.EATSTREET_KEY,
						            'apiKey': thisRest.restKey
					            }
				            }
				            
				            Promise.resolve(addFoodsToMenu(options, thisRest));
			            }
		            }
		            
		            //cap at 10 requests per second
		            id = setInterval(interval, 100);
	            })
            }
            
            var rest_keysDebug = [rest_keys[0], rest_keys[1]];
	        
	        let menuPromise = pollMenusForFood(rest_keys);
	        Promise.resolve(menuPromise).then(() =>
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

app.get('/login', function (req, res) {
    res.render('login')
})

app.get('/register', function (req, res) {
    res.render('register')
})

app.listen(app.get('port'), function () {
    console.log('Node app running at localhost:' + app.get('port'))
})