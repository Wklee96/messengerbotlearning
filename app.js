var express = require('express'),
    bodyParser = require('body-parser'),
    http = require('http'),
    request = require('request'),
    app = express(),
    fs = require('fs'),
    MongoClient = require('mongodb').MongoClient,
    url = 'mongodb+srv://lweikang96:<password>@cluster0-f52b9.mongodb.net/test',
    token = 'EAAEoEdeyfRABALaNxeEnS6WbzsLlMcclCNdQQ5WZAcESHuXK4MCaXDzYMQlYyr025UVbt0lhsWtKjdFvZAqgN2gT3kPJeyxRPDUYbVdsQlA6QAnZCmNXiVrVdX7RRvWOPmbt1B5jLj2zROFAei9lCZBrZBIfVsNjUll8qzIjcl6Gb5Y7xAAEN',
    sslOpts        = {
      "key":fs.readFileSync("/etc/letsencrypt/live/bluenode.xyz/privkey.pem"),
      "cert":fs.readFileSync('/etc/letsencrypt/live/bluenode.xyz/fullchain.pem')
    }

app.use(bodyParser.json({}));

// accept JSON bodies.
app.use(bodyParser.json({}));

// accept incoming messages
app.post('/fb', function(req, res){
  var id = req.body.entry[0].messaging[0].sender.id;
  var text = req.body.entry[0].messaging[0].message.text;
  console.log(JSON.stringify(req.body))
  // here we add the logic to insert the user data into the database
  MongoClient.connect(url, function(err, db) {
    if(err) {
      console.log(err)
    }
    app.findDocument(id, db, function(doc) {
      if(doc === null){
        app.initUserPurchase({session:id, Purchase:[]}, db, function(doc){
          db.close();
        })
      }
    });
  });
  app.speechHandler(text, id, function(speech){
    app.messageHandler(speech, id, function(result){
      console.log("Async Handled: " + result)
    })
  })
  res.send(req.body)
})

app.messageHandler = function(text, id, cb) {
  var data = {
    "recipient":{
    	"id":id
    },
    "message":{
    	"text":text
    }
  };
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: data
  };
  console.log(JSON.stringify(reqObj))
  request(reqObj, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else if (response.body.error) {
      console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false)
    } else{
      cb(true)
    }
  });
}
app.speechHandler = function(text, id, cb) {
  var reqObj = {
    url: 'https://api.api.ai/v1/query?v=20150910',
    headers: {
      "Content-Type":"application/json",
      "Authorization":"Bearer 4afa6d23ced343df9372d19b59959dd7"
    },
    method: 'POST',
    json: {
      "query":text,
      "lang":"en",
      "sessionId":id
    }
  };
  request(reqObj, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else {
      console.log(JSON.stringify(body))
      cb(body.result.fulfillment.speech);
    }
  });
}

// verify token to subscribe
app.get('/fb', function(req, res) {
  if (req.query['hub.verify_token'] === 'abc') {
     res.send(req.query['hub.challenge']);
   } else {
     res.send('Error, wrong validation token');
   }
});

// create a health check endpoint
app.get('/health', function(req, res) {
  res.send('okay');
});

// set port
app.set('port', process.env.PORT || 8080);

// start the server
https.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

app.initUserPurchase = function(data, db, callback) {
  // Get the documents collection
  var collection = db.collection('Purchase');
  // Insert some documents
  collection.insertOne(data, function(err, result) {
    if(err) throw err;
    callback(result);
  });
}

app.findDocument = function(sessionID, db, callback) {
  // Get the documents collection
  var collection = db.collection('Purchase');
  // Find some documents
  collection.findOne({'session': sessionID}, function(err, doc) {
    if(err){ throw err; }
    callback(doc);
  });
}