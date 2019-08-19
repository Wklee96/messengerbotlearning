var express = require('express'),
    bodyParser = require('body-parser'),
    https = require('https'),
    request = require('request'),
    app = express(),
    fs = require('fs'),
    token = 'EAAEoEdeyfRABALlxuZCSBKCNaGi1YlJC06bvhSMzzfXSwAfY6FqxlWsqt1NATCeI8imG1wrwuZCUDtdm9ZAb7eFCJn0mZBuIEtaTx0CLenNRXpx1c37mB69WqMxJjrAFnubiZA6u6rDa8oNnqt6aEJ4ljsEIrt4aNZAZAtZBAGtaIwZDZD',
    ssl0pts = {
      "key":fs.readFileSync("/etc/letsencrypt/live/bluenode.xyz/privkey.pem"),
      "cert":fs.readFileSync('/etc/letsencrypt/live/bluenode.xyz/fullchain.pem')
    }

var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb+srv://lweikang96:S9605967a@cluster0-f52b9.mongodb.net/test?retryWrites=true&w=majority';

app.use(bodyParser.json({}));

app.post('/fb', function(req, res){
  console.log("Post / fb:", JSON.stringify(req.body))  
  if (req.body.entry[0].standby) {
    console.log("ON STANDBY");
  } else {
    var message = req.body.entry[0].messaging[0];
    var id = message.sender.id;
    if (message.message) {
      if (message.message.quick_reply) {
        handleInitialResponse(message, id);
      } else {
        handleResponseFlow(message, id);  
      }
    }
    res.send(req.body)
  }
})

app.get('/fb', function(req, res) {
    if (req.query['hub.verify_token'] === 'adxperts') {
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
app.set('port', process.env.PORT || 443);
// start the server
https.createServer(ssl0pts, app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
});

app.messageHandler = function(text, id, cb) {
  if (text === "handover") {
    handOver(id, cb);
  } else {
    sendMessage(id, text, cb);
  }
}

app.collectionMessage = function(id, cb) {
  var data = {
    "recipient":{
        "id":id
    },
    "message":{
      "text":"Please choose the method of collection for your delivery",
      "quick_replies": [
          {
            "content_type": "text",
            "title": "Home Delivery",
            "payload": "purchase_hd"
          },
          {
            "content_type": "text",
            "title": "7-11 Collection",
            "payload": "purchase_711"
          },
          {
            "content_type": "text",
            "title": "FamilyMart Collection",
            "payload": "purchase_fm"
          }
      ]
    }
  };
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: data
  };
  var typingObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      "recipient":{
          "id":id
      },
      "sender_action":"typing_on"
    }
  }
  console.log("Message Handler:", JSON.stringify(reqObj))
  request(typingObj , function(error, response, body) {
    if (error) {
      //console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else if (response.body.error) {
      //console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false)
    } else{
      cb(true)
    }
  })
  setTimeout(() => request(reqObj, function(error, response, body) {
    if (error) {
      //console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else if (response.body.error) {
      //console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false)
    } else{
      cb(true)
    }
  }), 1500)
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
    } else if (body.result.metadata.isFallbackIntent === "true") {
      console.log('Fallback intent detected, passing protocol')
      cb('handover')
    } else {
      console.log('Speech Handler Success: ', JSON.stringify(body))
      var params = body.result.parameters;
      console.log('PARAMS', params);
      if (params.productName !== "" && params.cod !== "" && params.address !== "" && params.phone !== "" && params.CommmoditySize !== "" && params.comments !== "") {
        MongoClient.connect(url, function(err, client) {
          getUsername(id, function(profile) {
            console.log("Getting profile:", profile);
            var db = client.db('purchaseOrder');
            if (err) {
              console.log(err);
            }
            app.insertPurchase({firstName: profile["first_name"], lastName: profile["last_name"], sessionID: id, productName: params.productName, cod: params.cod, address: params.address, phone: params.phone, size: params.CommoditySize, comments: params.comments}, db, function(doc) {
              console.log("item inserted");
              client.close();
            })
          })
        })
      }
      cb(body.result.fulfillment.speech);
    }
  });
}

function getUsername(id, cb) {
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/' + id,
    qs: {
      access_token: token,
      fields: "first_name, last_name"
    },
    method: 'GET'
  };
  request(reqObj, function(err, res, body) {
    if (err) {
      console.log("Profile query error");
      cb(false);
    } else {
      console.log("Profile query success:", body);
      cb(JSON.parse(body));
    }
  })
}

function handOver(id, cb) {
  var data = {
    "recipient": {
      "id": id
    },
    "target_app_id": "263902037430900"
  };
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/pass_thread_control',
    qs: { access_token: token },
    method: 'POST',
    json: data
  };
  request(reqObj, function (error, response, body) {
    if (error) {
      //console.log('Error sending message: ', JSON.stringify(error));
      cb(false);
    }
    else if (response.body.error) {
      //console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false);
    }
    else {
      cb(true);
    }
  });
}

function dbInitialisation(id) {
  MongoClient.connect(url, function (err, client) {
    var db = client.db('purchaseOrder');
    if (err) {
      console.log('db connection error:', err);
    } else {
      app.findDocument(id, db, function (doc) {
        if (doc === null) {
          app.initUserPurchase({ session: id, purchase: [] }, db, function (doc) {
            client.close();
          });
        }
      });
    }
  });
}

function sendMessage(id, text, cb) {
  var data = {
    "recipient": {
      "id": id
    },
    "message": {
      "text": text
    }
  };
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: data
  };
  var typingObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: {
      "recipient": {
        "id": id
      },
      "sender_action": "typing_on"
    }
  };
  console.log("Message Handler:", JSON.stringify(reqObj));
  request(typingObj, function (error, response, body) {
    if (error) {
      //console.log('Error sending message: ', JSON.stringify(error));
      cb(false);
    }
    else if (response.body.error) {
      //console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false);
    }
    else {
      cb(true);
    }
  });
  setTimeout(() => request(reqObj, function (error, response, body) {
    if (error) {
      //console.log('Error sending message: ', JSON.stringify(error));
      cb(false);
    }
    else if (response.body.error) {
      //console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false);
    }
    else {
      cb(true);
    }
  }), text.length * 100);
  if (text == "May I know your size?") {
    sendImage(id, "id1351", cb);
  }
}

function sendImage(id, product, cb) {
  var data = {
    "recipient": {
      "id": id
    },
    "message": {
      "attachment": {
        "type": "image",
        "payload": {
          "url": 'https://i.imgur.com/dFMlRcE.png'
        }
      }
    }
  };
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: token },
    method: 'POST',
    json: data
  };
  request(reqObj, function (error, response, body) {
    if (error) {
      console.log('Error sending message: ', JSON.stringify(error));
      cb(false);
    }
    else if (response.body.error) {
      console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false);
    }
    else {
      cb(true);
    }
  });
}

function handleResponseFlow(message, id) {
  var text = message.message.text;
  app.speechHandler(text, id, function (speech) {
    app.messageHandler(speech, id, function (result) {
      console.log("Async Handled: " + result);
    });
  });
}

function handleInitialResponse(message, id) {
  if (message.message.quick_reply.payload.includes("purchase_yes")) {
    console.log("hey", message.message.quick_reply.payload)
    app.speechHandler("My product is " + message.message.quick_reply.payload.substring(13), id, function(speech) {
      app.collectionMessage(id, function (result) {
        console.log("Async Handled: " + result);
      });
    })
  }
  else if (message.message.quick_reply.payload == "purchase_hd") {
    app.speechHandler("I want home delivery", id, function (speech) {
      app.messageHandler(speech, id, function (result) {
        console.log("Async Handled: " + result);
      });
    });
  }
}

app.insertPurchase = function(data, db, callback) {
  // Get the documents collection
  var collection = db.collection('purchase');
  // Insert document
  collection.insertOne(data, function(err, result) {
    if (err) throw err;
    callback(result);
  })
}

app.findDocument = function(sessionID, db, callback) {
  // Get the documents collection
  var collection = db.collection('purchase');
  // Find document
  collection.findOne({'session': sessionID}, function(err, doc) {
    if (err) throw err;
    callback(doc);
  })
}

