var _ = require('underscore');

function whenThingDisconnected(params, context, done){
  whenThingConnectionChange(false, params, context, done);
}

function whenThingConnected(params, context, done){
  whenThingConnectionChange(true, params, context, done);
}

function whenThingConnectionChange(status, params, context, done){
  var admin = context.getAppAdminContext();
  //var thingID = params.thingID;
  var appBucket = admin.bucketWithName("thingStatusBucket");

  // Create the object with key/value pairs
  var obj = appBucket.createObject();
  obj.set("status", status);
  obj.set("thingConnection", "t");
  //obj.set("thingID", thingID);

  // Save the object
  obj.save({
    success: function(theObject) {
      done();
    },
    failure: function(theObject, errorString) {
      // Error handling
    }
  });
}