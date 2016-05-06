'use strict';

var KiiEnv = Kii;

angular.module('mqttDemo.controllers',[])
.controller('ConnectionCtrl', ['$scope','mqttClient', 'sendHttpRequest','consoleService', function($scope,mqttClient, sendHttpRequest,consoleService) {

  var Constant_X_Kii_RequestID = "asdf1234";

  $scope.init = function() {

    $scope.KiiInfo = {
      appID: "5f59f57d",
      appKey: "78e36a49a4c8b734299253417bc91fc9",
      site: "CN3"
    };

    $scope.userInfo = {
      userName:"",
      password:"",
      userObject:{}
    };

    $scope.thingInfo = {
      vendorThingID:"",
      password:"",
      thingID:"",
      accessToken:""
    }

    // userMessage.actions => thingMessage.receivedActions
    // userMessage.receivedActionResults <= thingMessage.state
    // userMessage.receivedActionResults <= thingMessage.actionResults
    $scope.userMessage = {
      actions: [],
      receivedActionResults: []
    };

    $scope.thingMessage = {
      receivedActions:[],
      state: "",
      actionResults:"",
      commandID:""
    };

    // $scope.thingMessage.receivedActions.push({commandID:"someID1"});
    // $scope.thingMessage.receivedActions.push({commandID:"someID2"});
    // $scope.thingMessage.receivedActions.push({commandID:"someID3"});

    $scope.userMqttClient = {};

    $scope.thingMqttClient = {};

    $scope.sdkInitialized = false;

    // the first message received will be treated as thing boarding response
    // then change this field as true
    $scope.isMQTTConnectedForThing = false;

    $scope.isMQTTConnectedForUser = false;

    $scope.showConsole = true;
    $scope.consoleOutput = consoleService.getConsoleOutput;

    $scope.action = {type:'string'};
    $scope.selectedActions = [];

    consoleService.log("init()");

  }

  $scope.onClickSetEnvironment = function() {
    var site;
    if($scope.KiiInfo.site == "CN3") {
      site = KiiSite["CN3"];
    } else {
      alert("please select the region");
      return;
    }

    KiiEnv.initializeWithSite($scope.KiiInfo.appID, $scope.KiiInfo.appKey, site);
    $scope.sdkInitialized = true;
    consoleService.log('Kii sdk initialized');

  }

  $scope.resetEnvironment = function() {
    $scope.sdkInitialized = false;
  }

  $scope.onClickRegisterUser = function(userInfo) {
    consoleService.log(userInfo.userName + " " + userInfo.password);

    // Create the KiiUser object
    var user = KiiUser.userWithUsername(userInfo.userName, userInfo.password);

    // Register the user, defining callbacks for when the process completes
    user.register({
      // Called on successful registration
      success: function(theUser) {
        // Print some info to the log
        consoleService.log("User registered!");
        consoleService.log(theUser);
        consoleService.log("user id: " + theUser._uuid);

        $scope.userInfo.userObject = theUser;

        var bucket = Kii.bucketWithName("thingStatusBucket");
        theUser.pushSubscription().subscribe(bucket, {
          success: function(thePushSubscription, theBucket) {
            installMQTTForUser(theUser);
          },
          failure: function(errorString) {
            // Error handling
          }
        });
      },
      // Called on a failed registration
      failure: function(theUser, errorString) {
        // Print some info to the log
        consoleService.log("Error registering: " + errorString);
      }
    });
  }

  // install the MQTT for user
  function installMQTTForUser(theUser) {

    var url = KiiSite[$scope.KiiInfo.site] + "/apps/" + $scope.KiiInfo.appID + "/installations";

    var headers = {
      "content-type": "application/vnd.kii.InstallationCreationRequest+json",
      "Authorization": "bearer " + theUser._accessToken,
      "x-kii-appid": $scope.KiiInfo.appID,
      "x-kii-appkey": $scope.KiiInfo.appKey
    };

    var data = {
      "deviceType": "MQTT",
      "development":true
    };

    var onComplete = function(response) { 
      retrieveMQTTEndpointForUser(theUser, JSON.parse(response).installationID, 5);
    };

    var onFailure = function(readyState, status, response) {
    };

    sendHttpRequest("POST", url, headers, JSON.stringify(data), onComplete, onFailure);
  }

  function retrieveMQTTEndpointForUser(theUser, installationID, retryCount) {
    var url = KiiSite[$scope.KiiInfo.site] + "/apps/" + $scope.KiiInfo.appID + "/installations/" + installationID + "/mqtt-endpoint" ;

    var headers = {
      "Authorization": "bearer " + theUser._accessToken,
      "x-kii-appid": $scope.KiiInfo.appID,
      "x-kii-appkey": $scope.KiiInfo.appKey
    };

    var onComplete = function(response) {

      var mqttEndpointInfo = JSON.parse(response);

      connectMQTTEndpointForUser(mqttEndpointInfo);
    };

    var onFailure = function(readyState, status, response) {
      consoleService.log("retry: " + retryCount);
      if(retryCount > 0) {
        setTimeout(function() {
          retrieveMQTTEndpointForUser(theUser, installationID, retryCount-1);
        }, 5000);
      }
    };

    sendHttpRequest("GET", url, headers, null, onComplete, onFailure);
  }

  function connectMQTTEndpointForUser(mqttEndpointInfo){

    var mqttClientConfig = {
      host: mqttEndpointInfo.host,
      port: mqttEndpointInfo.portWS,
      username: mqttEndpointInfo.username,
      password: mqttEndpointInfo.password,
      clientID: mqttEndpointInfo.mqttTopic
    };

    var onConnectionLost = function(responseObject) {
      $scope.connected = false;
      alert("Conneciton Lost");
    };

    var onMessageReceived = function(message) {
      $scope.$apply(function () {
          consoleService.log(message.payloadString);
          alert("Message Received", message);
          consoleService.log(message.destinationName);
          consoleService.log("message " + JSON.stringify(message));

          var parsed = $scope.userMqttClient.parseResponse(message);
          
          consoleService.log("parsed " + JSON.stringify(parsed));

          // check whether onboarding response
          if(parsed.type == 'ONBOARD_THING') {
            $scope.thingInfo.thingID = parsed.payload.thingID;
            $scope.thingInfo.accessToken = parsed.payload.accessToken;
            connectMQTTEndpointForThing(parsed.payload.mqttEndpoint);
          } else if(parsed.type == 'SEND_COMMAND') {
            consoleService.log("commandID " + parsed.payload.commandID);
            var actions = {commandID: parsed.payload.commandID, actionResults:{}};
            $scope.userMessage.receivedActionResults.push(actions);
          } else if(parsed.type == 'UPDATE_ACTION_RESULTS') {
            // user can't receive this message type?
          } else if(parsed.type == 'PUSH_MESSAGE') {
            for(var i=0;i<$scope.userMessage.receivedActionResults.length;i++) {
              if($scope.userMessage.receivedActionResults[i].commandID == parsed.payload.commandID) {
                $scope.userMessage.receivedActionResults[i].actionResults = parsed.payload;
                break;
              }
            }
          }
      });
    };

    $scope.userMqttClient = mqttClient.getInstance(mqttClientConfig,onMessageReceived,onConnectionLost);
    $scope.userMqttClient.connect()
      .then(function(){
        $scope.connected = true;
        consoleService.log("User MQTT Connected");
        $scope.userMqttClient.subscribe(mqttClientConfig.clientID);
        $scope.isMQTTConnectedForUser = true;
      },
      function(err){
        alert('Error connecting: ' + JSON.stringify(err));
        consoleService.log('Error connecting: ' + JSON.stringify(err));
      });

  }

  function connectMQTTEndpointForThing(mqttEndpointInfo) {

    var mqttClientConfig = {
      host: mqttEndpointInfo.host,
      port: mqttEndpointInfo.portWS,
      username: mqttEndpointInfo.username,
      password: mqttEndpointInfo.password,
      clientID: mqttEndpointInfo.mqttTopic
    };

    var onMessageReceived = function(message) {
      $scope.$apply(function() {
        consoleService.log("message " + JSON.stringify(message));
        alert("Message Received by Thing", message);

        var parsed = $scope.thingMqttClient.parseResponse(message);
        consoleService.log("parsed " + JSON.stringify(parsed));

        if(parsed.type == 'PUSH_MESSAGE'){
          $scope.thingMessage.receivedActions.push(parsed.payload);
        }
        
      });
    };

    var onConnectionLost = function(responseObject) {
      alert("Conneciton Lost!!!");
    };

    $scope.thingMqttClient = mqttClient.getInstance(mqttClientConfig,onMessageReceived,onConnectionLost);
    $scope.thingMqttClient.connect()
      .then(function(){
        consoleService.log("Thing MQTT Connected");
        $scope.thingMqttClient.subscribe(mqttClientConfig.clientID);
        $scope.isMQTTConnectedForThing = true;
      },
      function(err){
        alert('Error connecting: ' + JSON.stringify(err));
        consoleService.log('Error connecting: ' + JSON.stringify(err));
      });
  }

  $scope.onClickRegisterThing = function(thingInfo) {

    $scope.userMqttClient.onboardThing($scope.KiiInfo.appID, thingInfo.vendorThingID, thingInfo.password, $scope.userInfo.userObject._uuid, $scope.userInfo.userObject._accessToken);

  }

  $scope.onClickSendCommand = function() {

    var userObject = $scope.userInfo.userObject;
    // payload
    var payload ={
      actions: $scope.userMessage.actions,
      issuer: 'USER:' + userObject._uuid,
      schema: 'SmartLight',
      schemaVersion: 1
    };
   
    $scope.userMqttClient.sendCommand($scope.KiiInfo.appID, payload, $scope.thingInfo.thingID, userObject._accessToken);
  }

  $scope.onClickUpdateState = function() {
    $scope.thingMqttClient.updateState($scope.KiiInfo.appID, $scope.thingMessage.state, $scope.thingInfo.thingID, $scope.thingInfo.accessToken);
  }

  $scope.onClickSendActionResults = function() {

    $scope.thingMqttClient.updateActionResults($scope.KiiInfo.appID, $scope.thingMessage.actionResults, $scope.thingInfo.thingID, $scope.thingMessage.commandID, $scope.thingInfo.accessToken);
    
  }

  $scope.onClickAddAction = function(action){
  	if(!angular.isDefined(action.name) || !angular.isDefined(action.type) || !angular.isDefined(action.value)){
  		return;
  	}

  	if(action.type == 'boolean' && !(action.value == 'true' || action.value == 'false')){
  		return;
  	}

  	if(action.type == 'number' && !(!isNaN(parseFloat(action.value)) && isFinite(action.value))){
  		return;
  	}

  	var insertAction ={
  		name: action.name,
  		type: action.type,
  		value: action.value
  	}
  	var actionObject = {};
  	if(action.type == 'string'){
  		actionObject[action.name] = action.value;
  	} else if (action.type == 'number'){
  		actionObject[action.name] = new Number(action.value);
  	} else if (action.type == 'boolean'){
  		actionObject[action.name] = new Boolean(action.value);
  	}
  	$scope.selectedActions.push(insertAction);
  	$scope.userMessage.actions.push(actionObject);
  }

  $scope.onClickDeleteAction = function(index){
  	$scope.selectedActions.splice(index,1);
  	$scope.userMessage.actions.splice(index, 1);
  }  

}])
.controller('TestCtrl', ['$scope','mqttClient',function($scope, mqttClient) {

  $scope.connected = false;

  $scope.receivedMessages = "";

  $scope.mqttClientConfig = {
  	host: "development-jp-mqtt-540df7a171962834.internal.kii.com",
  	port: 12470
  }

  var userMqttClient;

  $scope.connect = function(mqttClientConfig){
  	userMqttClient = mqttClient.getInstance(mqttClientConfig,onMessageReceived,onConnectionLost);
  	userMqttClient.connect()
  	  .then(function(){
  	  	$scope.connected = true;
  	  },
  	  function(err){
  	  	alert('Error connecting: ' + JSON.stringify(err));
  	  });
  }

  $scope.disconnect = function(){
  	userMqttClient.disconnect();
  	$scope.connected = false;
  }

  $scope.subscribe = function(topic){
  	userMqttClient.subscribe(topic);
  }

  $scope.testOnboard = function(){
  	userMqttClient.onboardThing('596cd936', 'testvendor', 'testpass', '53ae324be5a0-d438-5e11-1c89-0c737777', 'NTgqj2qDXBHg6dix8RANtXS05zyIuRDhyd3PSbawig8');
  }

  var onConnectionLost = function(responseObject) {
	$scope.connected = false;
  }

  var onMessageReceived = function(message) {
  	$scope.$apply(function () {
        //$scope.receivedMessages +=  message.payloadString + '\n';
        $scope.receivedMessages += JSON.stringify(userMqttClient.parseResponse(message)) + '\n';
    });
  }

}]);


