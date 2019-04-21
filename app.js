const express = require('express')
const request = require('request')
const path = require("path")
const bodyParser = require('body-parser')
const urlencodedParser = bodyParser.urlencoded({ extended: false })
const app = express()
const dotenv = require('dotenv').config()
const request_promise = require('request-promise-lite')
const async = require('async')
const MongoClient = require('mongodb').MongoClient
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy

// Configure Google strategy for Passport
passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL + '/auth/google/callback'
    },
    function(accessToken, refreshToken, profile, cb) {
        return cb(null, profile)
    }
))

passport.serializeUser(function(user, cb) {
    cb(null, user)
})

passport.deserializeUser(function(obj, cb) {
    cb(null, obj)
})

app.set('port', (process.env.PORT || 5000))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
app.use(express.static(path.join(__dirname, 'public')))
app.use(require('express-session')({ secret: process.env.SESSION_SECRET, resave: true, saveUninitialized: true }));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize())
app.use(passport.session())

const dbURL = "mongodb+srv://" + process.env.MONGO_USERNAME + ":" + process.env.MONGO_PASSWORD + "@cs411-vrnjt.mongodb.net/test?retryWrites=true"
const client = new MongoClient(dbURL, { useNewUrlParser: true });
const connection = client.connect().catch(function(error){
	console.log(error);
});

app.get('/', function (req, res) {
    res.render('index')
	
	//DEBUG
	//uncomment to clean the searches database (only need to do this if we reformat the data)
	// let connect = connection
	// connect.then(() => {
	// 	let collection = client.db("users").collection("searches")
	// 	collection.remove({})
	// })
})

//removes all non a-Z and space characters
const removeSpecialCharacters = function(str)
{
	const s = str.replace(/[^a-zA-Z ]/g, '');
	return s
}

const isFoodBetter = function(oldFood, newFood, order)
{
	switch(order)
	{
		case 0: //max calories
			return newFood.ENERC_KCAL > oldFood.ENERC_KCAL;
		case 1: //min calories
			return newFood.ENERC_KCAL < oldFood.ENERC_KCAL;
			break;
		case 2: //max fat
			return newFood.FAT > oldFood.FAT;
			break;
		case 3: //min fat
			return newFood.FAT < oldFood.FAT;
			break;
		case 4: //max carbs
			return newFood.CHOCDF > oldFood.CHOCDF;
			break;
		case 5: //min carbs
			return newFood.CHOCDF < oldFood.CHOCDF;
			break;
		case 6: //max protein
			return newFood.PROCNT > oldFood.PROCNT;
			break;
		case 7: //min protein
			return newFood.PROCNT < oldFood.PROCNT;
			break;
		default:
			console.log("Not a valid search sorting order")
			return false;
	}
}

app.post('/', urlencodedParser, function (req, res) {
    // TODO: validate POST data to check for errors
	const debug = req.body['debug']
	let userRadius, userPriceLimit, userSearchString, searchAddress, searchOrder, topFood, foodFound = false
	if(debug == 1)
	{
		userRadius = 1
		userPriceLimit = 15
		userSearchString = "chicken"
		searchAddress = "02215"
		searchOrder = 2
	}
	else
	{
		userRadius = req.body['radius']
		userPriceLimit = req.body['price']
		userSearchString = req.body['meal']
		searchAddress = req.body['street-address']
		searchOrder = parseInt(req.body['order'])
	}
	const userSearchWords = userSearchString.toLowerCase().split(" ");
	
	if(searchOrder % 2 == 0) //user is searching for max, so start at 0
		topFood = {ENERC_KCAL: 0, FAT: 0, CHOCDF: 0, PROCNT: 0}
	else //user is searching for min, so start at very large number
		topFood = {ENERC_KCAL: Number.MAX_SAFE_INTEGER, FAT: Number.MAX_SAFE_INTEGER, CHOCDF: Number.MAX_SAFE_INTEGER, PROCNT: Number.MAX_SAFE_INTEGER}
	var topRest = {}
    
    const getRestNames = function(callback){
        return new Promise(function(resolve, reject){
            var options = {
                method: 'GET',
                url: 'https://eatstreet.com/publicapi/v1/restaurant/search',
                qs: {
                    'access-token': process.env.EATSTREET_KEY,
                    'street-address': searchAddress,
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
                            console.log("bad response for getting restaurant" + response.statusCode);
                            resolve({});
                        }
                    })
                })
            }
            
            Promise.resolve(getRestJSON()).then(() => callback(null, info)).catch(function(error){
                	console.log(error)
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
		                        if (isFoodBetter(topFood, currFood, searchOrder)) {
		                        	foodFound = true
			                        topFood = currFood;
			                        topFood["name"] = mealName;
			                        topRest = restJSON.restaurants[rest.restIndex];
			                        
			                        //DEBUG
			                        //if debug then just return the first food so we don't waste precious api calls
			                        //if(debug)
			                        {
				                        resolve(info.hints[i].food.nutrients);
			                        }
		                        }
	                        }
                            resolve(info.hints[i].food.nutrients);
                        }
                    }
                    
                    console.log("no meals")
                    resolve({}); //return an empty JSON object, so caller will have to check if response is valid before accessing elements
                }
                
                else {
                    console.log("bad response when getting edamam nutrition" + response.statusCode);
                    resolve({});
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
	        var callsRemaining = 10;
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
					            resolve();
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
				            if(thisRest != undefined) {
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
		            }
		            
		            //cap at 10 requests per second
		            id = setInterval(interval, 100);
	            })
            }
            
            var rest_keysDebug = rest_keys;
            //if(debug == 1)
                rest_keysDebug = [rest_keys[0], rest_keys[1]];
	        
	        let menuPromise = pollMenusForFood(rest_keysDebug);
	        Promise.resolve(menuPromise).then(() =>
		        callback(null, topFood, topRest)).catch(
		        function(error){console.log(error)
		        })
        })
    }
    
    async.waterfall([getRestNames, getRestMenus], function renderResult(error, topFood, topRest){
    	if(!foodFound)
	    {
		    res.render('index-result', {error: 'No foods found. Refine Search and try again'})
	    }
        else if (error) {
        	console.log(error)
            res.render('index-result', {menuItem: 'Error processing', restaurant: 'Error processing'})
        }
        else {
            res.render('index-result', {menuItem: topFood, restaurant: topRest})
	        if(req.user) {
		        let connect = connection
		        connect.then(() => {
			        client.db("users").collection("searches").insertOne({
				            user: req.user,
				            radius: userRadius,
				            priceLimit: userPriceLimit,
				            searchString: userSearchString,
			                address: searchAddress,
				            resultFood: topFood,
				            resultRest: topRest,
			                order: searchOrder}, (err, res) => {
				        if (err) throw err
			        })
		        }).catch(function (err) {
			        console.log(err)
		        })
	        }
        }
    })
})

app.post('/savesearch', urlencodedParser, function (req, res) {
    if(req.user) {
        let connect = connection
        connect.then(() => {
            client.db("users").collection("saved_searches").insertOne({
                    user: req.user,
                    resultFood: req.body['food'],
                    resultRest: req.body['restaurant'],
                    location: req.body['location'],
                    link: req.body['link'],
                    calories: req.body['calories'],
                    fat: req.body['fat'],
                    carbs: req.body['carbs'],
                    protein: req.body['protein']}, (err, res) => {
                if (err) throw err
            })
        }).catch(function (err) {
            console.log(err)
        })
    }   

    res.redirect('/profile')
})


//render index page with values filled in already
app.post('/research', urlencodedParser, function (req, res){
	res.render('index', {
		debug: 0,
		re_street_address: req.body['re_street-address'],
		re_meal: req.body['re_meal'],
		re_radius: req.body['re_radius'],
		re_price: req.body['re_price'],
		re_order: parseInt(req.body['re_order'])
		})
})

app.get('/login', function (req, res) {
    res.render('login')
})

app.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile'] }))

app.get('/auth/google/callback', 
    passport.authenticate('google', { successReturnToOrRedirect: '/', failureRedirect: '/login' }))

app.get('/logout', function (req, res) {
    req.logout()
    console.log('User logged out')
    res.redirect('/')
})

app.get('/profile', 
    require('connect-ensure-login').ensureLoggedIn(),
    function (req, res) {
		let connect = connection
        var search_arr = []
	    connect.then(() => {
		    var collection = client.db("users").collection("searches");
		    collection.find({user: req.user}).toArray(function(err, arr){
                search_arr = arr
                client.db("users").collection("saved_searches").find({user: req.user}).toArray(function(err, arr){
                    res.render('profile', { user: req.user, searches: search_arr.reverse(), saved_searches: arr })
                }) 
		    })
	    }).catch(function(err){
	    	console.log(err)
	    })
})

app.listen(app.get('port'), function () {
    console.log('Node app running at localhost:' + app.get('port'))
})