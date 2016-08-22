var url = require('url');
var restify = require('restify');
var mongodb = require('mongodb');
var passport = require('passport-restify');
var Strategy = require('passport-oauth2-jwt-bearer').Strategy;
var externalRequest = require('request');
var ObjectID = mongodb.ObjectID;

// Defined in Authorization Server Settings -> Resource URI
var audience = 'http://localhost:8080';

// Issuer + Metadata Endpoints
var issuer =   'https://jordandemo.oktapreview.com/as/aus7xbiefo72YS2QW0h7';
var metadataUrl = 'https://jordandemo.oktapreview.com/as/aus7xbiefo72YS2QW0h7/.well-known/oauth-authorization-server';

// Database url
var url = 'mongodb://localhost:27017/'
var collection;
mongodb.MongoClient.connect(url, function(err, db) {
  if (err == null){
      console.log("connected successfully");
      collection = db.collection('appointments');
  }
});

var server = restify.createServer();
server.use(restify.bodyParser());

server.use(passport.initialize());
var strategy = new Strategy({
  audience: audience,
  issuer: issuer,
  metadataUrl: metadataUrl,
  loggingLevel: 'debug'
}, function(token, done) {
  // done(err, user, info)
  return done(null, token);
});
passport.use(strategy);

// Add CORS Access
server.use(restify.CORS());
restify.CORS.ALLOW_HEADERS.push("authorization");
restify.CORS.ALLOW_HEADERS.push("withcredentials");
restify.CORS.ALLOW_HEADERS.push("x-requested-with");
restify.CORS.ALLOW_HEADERS.push("x-forwarded-for");
restify.CORS.ALLOW_HEADERS.push("x-customheader");
restify.CORS.ALLOW_HEADERS.push("user-agent");
restify.CORS.ALLOW_HEADERS.push("keep-alive");
restify.CORS.ALLOW_HEADERS.push("host");
restify.CORS.ALLOW_HEADERS.push("accept");
restify.CORS.ALLOW_HEADERS.push("connection");
restify.CORS.ALLOW_HEADERS.push("content-type");

// Post appointment
server.post({path: '/appointments'}, function(req, res, next) {
  var appointment = req.params;
  console.log("Received: ", req.params)

  // Update required schema fields
  appointment.status = "REQUESTED";
  appointment.created = new Date();
  appointment.lastUpdated = new Date();
  appointment.startTime = new Date(req.params.startTime);
  appointment.location = "Office";

  // Format endTime
  var endTime = new Date(appointment.startTime);
  appointment.endTime = new Date(endTime.setHours(endTime.getHours() + 1));

  var status_code;

  // Insert into DB
  collection.insertOne( appointment, function(err, result) {
    if(err == null){
      console.log("Inserted appointment [" + result["ops"][0]["_id"] + "] into collection");
      res.send(status_code,
        {
          "id": result["ops"][0]["_id"],
          "status": appointment.status,
          "created": appointment.created,
          "lastUpdated": appointment.lastUpdated,
          "comment": appointment.comment,
          "startTime": appointment.startTime,
          "endTime": appointment.endTime,
          "location": appointment.location,
          "providerId": appointment.providerId,
          "patientId" : appointment.patientId,
          "patient" : appointment.patient
        }
    );
    return next(); 
    } else {
      console.log("An error occureed");
      res.send(status_code,
        {
          "id": result["ops"][0]["_id"],
          "status": appointment.status,
          "created": appointment.created,
          "lastUpdated": appointment.lastUpdated,
          "comment": appointment.comment,
          "startTime": appointment.startTime,
          "endTime": appointment.endTime,
          "location": appointment.location,
          "providerId": appointment.providerId,
          "patientId" : appointment.patientId,
          "patient" : appointment.patient
        }
      );
      return next(); 
    }
  });
});

// Update appointment
// Scopes Required: 'appointments:confirm' AND/OR 'appointments:cancel' AND/OR 'appointments:edit'
server.put({path: '/appointments/:_id'},
  passport.authenticate('oauth2-jwt-bearer', { session: false,
    scopes: ['appointments:confirm'] || ['appointments:cancel'] || ['appointments:edit'] }),
      function response(req, res, next) {
      
      // Manually update "lastUpdated" field
      var editAppointment = req.params;
      editAppointment.lastUpdated = new Date();

      collection.updateOne( {"_id":ObjectID(req.params["_id"])},
       {
        'created' : editAppointment.created,
        'lastUpdate': editAppointment.lastUpdated,
        'comment' : editAppointment.comment,
        'status' : editAppointment.status,
        'startTime' : editAppointment.startTime,
        'endTime' : editAppointment.endTime,
        'location' : editAppointment.location,
        'providerId' : editAppointment.providerId,
        'patientId' : editAppointment.patientId,
        'patient' : editAppointment.patient
       }, true );
      var updated = collection.find({"_id":ObjectID(req.params["_id"])}).toArray(function(err, result) {
        if(err) {res.send(err); }
        else if (result.length) {console.log("Found: ", result[0])}
        else { console.log("None found") ;}
      })
      res.send(200, editAppointment);
      return next();
});

// Delete appointment
// Scope Required: 'appointments:cancel'
server.del({path: '/appointments/:id'},
  passport.authenticate('oauth2-jwt-bearer', { session: false, scopes: ['appointments:cancel'] }),
  function response(req, res, next) {
  collection.deleteOne({"_id":ObjectID(req.params.id)},
    function (err, results) {
      if (err) { res.send(err); }
      else {
        console.log("Removed entity");
        res.send(204);}
    });
  return next();
});

// Scope Required: 'appointments:read'
server.get({path: '/appointments/:filter'},
  passport.authenticate('oauth2-jwt-bearer', { session: false , scopes: ['appointments:read']}),
  function respond(req, res, next) {
    var patientQuery = collection.find(
      {
        $or: [
        {'patientId' : req.params.filter},
        {'providerId' : req.params.filter}
        ]
      }).toArray(function(err, result) {
      if(err) {
        res.send(err);
      } else if(result.length) {console.log("Found: " , result.length);}
      res.send(200,result);
    });
    return next();
  }
);

// Return available providers
// Scope Required: 'providers:read'
server.get({path: '/providers'},
  passport.authenticate('oauth2-jwt-bearer', { session: false, scopes: ['providers:read'] }),
  function respond(req, res, next) {

    // id given is Okta user_id
    res.send(200,
    [
      {
        "id" : "00u7vh4zm1l7YIjPB0h7",
        "name" : "Dr. John Doe"
      },
      {
        "id" : "00u7vg8f6mBaaa8cw0h7",
        "name" : "Dr. Jane Doe"
      },
      {
        "id" : "00u7vfod51Q0RBghC0h7",
        "name" : "Dr. Richard Roe"
      }
    ]
  );
    return next();
  }
);

// Delete all from db
server.get({path: '/delete'},
    function respond(req, res, next) {
    var cursor = collection.find({}).toArray(function (err, result) {
      if (err) { res.send(err);}
      else {
        collection.deleteMany({});
        console.log("Removed all entries from database");
        res.send(204);
      }
    });
    return next();
});

server.listen(8088, '127.0.0.1', function() {
  console.log('listening: %s', server.url);
});