'use strict';

angular.module('mqttDemo.services',[])
.service('mqttClient', ['$q',function mqttClientFactory($q) {

  var MqttClient = function (config, messageHandler, disconnectHandler) {
  	this.config = config;
  	this.messageHandler = messageHandler;
  	this.disconnectHandler = disconnectHandler;
  };

  // subscribes to the topic
  MqttClient.prototype.subscribe = function(topic) {
    this.client.subscribe(topic);
  }

  // connects to broker and subscribes to clientID topic
  MqttClient.prototype.connect = function() {
    var deferred = $q.defer();
    try {
      this.client = new Paho.MQTT.Client(this.config.host, this.config.port, this.config.clientID);
      // connect the client
	  this.client.connect({
	  	onSuccess:function(){
	  		// auto subscribe to the topic
	  		// this.client.subscribe(this.config.clientID);
	  		deferred.resolve();
	  	},
	  	onFailure:function(err){deferred.reject(err)}, 
	  	userName: this.config.username, 
	  	password: this.config.password});
	  this.client.onConnectionLost = this.disconnectHandler;
      this.client.onMessageArrived = this.messageHandler;
      
    } catch(err) {
      deferred.reject(err);
    }
    return deferred.promise;
  }

  // disconnects
  MqttClient.prototype.disconnect = function(){
    this.client.disconnect();
  }

  // endpoints

  // send message to topic
  MqttClient.prototype.sendMessage = function(topic,message) {
    console.log("send message", topic, message);

  	var message = new Paho.MQTT.Message(message);
  	message.destinationName = topic;
    this.client.send(message);
  }

  MqttClient.prototype.onboardThing = function(appID, vendorThingID, thingPassword, userID, token){

  	// fill onboarding message
  	var onboardingMessage = 'POST\n';
  	onboardingMessage += 'Content-type:application/vnd.kii.OnboardingWithVendorThingIDByOwner+json\n';
  	onboardingMessage += 'Authorization:Bearer ' + token + '\n';
  	// TODO: generate ID to check it back
  	onboardingMessage += 'X-Kii-RequestID:asdf1234\n';
  	// mandatory blank line
  	onboardingMessage += '\n';
  	// payload
  	var payload ={
  		vendorThingID: vendorThingID,
  		thingPassword: thingPassword,
  		owner: 'USER:'+userID
  	}
  	onboardingMessage += JSON.stringify(payload);
  	var topic = 'p/' + this.config.clientID + '/thing-if/apps/' + appID + '/onboardings';
  	this.sendMessage(topic,onboardingMessage);
  	
  }

  MqttClient.prototype.sendCommand = function(appID, payload, thingID, token){

  	// fill onboarding message
  	var commandMessage = 'POST\n';
  	commandMessage += 'Content-type:application/json\n';
  	commandMessage += 'Authorization:Bearer ' + token + '\n';
  	// TODO: generate ID to check it back
  	commandMessage += 'X-Kii-RequestID:asdf1234\n';
  	// mandatory blank line
  	commandMessage += '\n';
  	// payload
  	commandMessage += JSON.stringify(payload);
  	var topic = 'p/' + this.config.clientID + '/thing-if/apps/' + appID + '/targets' + '/THING:'+thingID+'/commands' ;
  	this.sendMessage(topic,commandMessage);
  	
  }

  MqttClient.prototype.updateState = function(appID, state, thingID, token){
  	// fill message
    var stateMessage = 'PUT\n';
    stateMessage += 'Content-type:application/json\n';
    stateMessage += 'Authorization:Bearer ' + token+ '\n';
    // mandatory blank line
    stateMessage += '\n';
    // state
    stateMessage += state;

    // fill topic
    var topic = 'p/' + this.config.clientID + '/thing-if/apps/' + appID + '/targets/THING:' + thingID + '/states' ;
    
    // send out the message to topic
    this.sendMessage(topic,stateMessage);
  }

  MqttClient.prototype.updateActionResults = function(appID, actionResults, thingID, commandID, token){
  	// fill message
    var actionResultsMessage = 'PUT\n';
    actionResultsMessage += 'Content-type:application/json\n';
    actionResultsMessage += 'Authorization:Bearer ' + token + '\n';
    // mandatory blank line
    actionResultsMessage += '\n';
    // payload
    var payload = {
      actionResults: JSON.parse(actionResults)
    };
    actionResultsMessage += JSON.stringify(payload);

    // fill topic
    var topic = 'p/' + this.config.clientID + '/thing-if/apps/' + appID + '/targets/THING:'+thingID+'/commands/' + commandID + '/action-results';
    
    // send out the message to topic
    this.sendMessage(topic,actionResultsMessage);
  }

  MqttClient.prototype.parseResponse = function(messageToParse) {

    console.log("messageToParse", messageToParse);

  	var message = messageToParse.payloadString;
  	var topic = messageToParse.destinationName;

  	var parsed = {
  		code:'',
  		headers:[],
  		payload:{},
  		type: parseType(topic)
  	}

    // in the case of no header
    if(message.charAt(0) == "{") {
      parsed.payload = JSON.parse(message);
      return parsed;
    }

    // in the case of header
  	var lines = message.split('\n');
  	
  	parsed.code = lines[0].replace('\r','');
  	
  	for (var i=1; i<lines.length; i++){
  	  // console.log(lines[i], lines[i].length);
  	  if(lines[i] != '{'){
  	  	parsed.headers.push(lines[i].replace('\r',''));
  	  } else {
  	  	var payload = '';
  	  	for(var j = i;j<lines.length;j++){
  	  		payload += lines[j];
  	  	}
  	  	console.log(payload);
  	  	parsed.payload = JSON.parse(payload);
  	  	return parsed;
  	  }
  	}

    return parsed;
  }

  function parseType(topic){
    
    // if(topic.search('p\/\w+\/thing-if\/apps\/\w+\/targets\/\w+:[\w\-\.]+\/commands\/[\w\-\.]+\/action\-results')){
    //   return 'UPDATE_ACTION_RESULTS';
    // }  else if(topic.search('p\/\w+\/thing-if\/apps\/\w+\/targets\/\w+:[\w\-\.]*\/commands')){
    // 	return 'SEND_COMMAND';
    // } else if(topic.search('p\/\w+/thing-if\/apps\/\w+:\w+\/targets\/\w+:[\w\-\.]*\/states')){
    // 	return 'UPDATE_STATE';
    // } else if(topic.search('p\/\w+\/thing-if\/apps\/\w+:\w+\/onboardings')){
    //   return 'ONBOARD_THING';
    // } else {
    //   return 'PUSH_MESSAGE';
    // }

    if(topic.lastIndexOf('action-results') > 0){
      return 'UPDATE_ACTION_RESULTS';
    }  else if(topic.lastIndexOf('commands') > 0){
      return 'SEND_COMMAND';
    } else if(topic.lastIndexOf('states') > 0){
      return 'UPDATE_STATE';
    } else if(topic.lastIndexOf('onboardings') > 0){
      return 'ONBOARD_THING';
    } else {
      return 'PUSH_MESSAGE';
    }

  }
console.log(parseType('p/xVt1PxeLgNdb8dKeJQPBDxa/thing-if/apps/0ce64137/targets/THING:th.0267251d9d60-c79a-5e11-3999-002f3f69/commands/kkk/action-results'));
  return {
    getInstance: function (config, messageHandler, disconnectHandler) {
      return new MqttClient(config, messageHandler, disconnectHandler);
    }
  }
}])
.factory('consoleService', ['$q',function mqttClientFactory($q) {
  
  var consoleOutput = '';

  return {
  	getConsoleOutput: function(){
  		return consoleOutput;
  	},
  	log: function(text) {
  	  consoleOutput += text + '\n';
  	}
  } 
}])
.factory('sendHttpRequest', function() {
  return function(method, url, headers, data, completeHandler, failureHandler) {
    var xhr = new XMLHttpRequest();

    xhr.open(method, url, true);
    xhr.onreadystatechange = function() {
      if(xhr.readyState == 4) {
        if (xhr.status == 200 || xhr.status == 201) {
          console.log("onComplete");
          console.log("readyState", xhr.readyState);
          console.log("status", xhr.status);
          console.log("responseText", xhr.responseText);

          completeHandler(xhr.responseText);
        } else {

          console.log("onFailure");
          console.log("readyState", xhr.readyState);
          console.log("status", xhr.status);
          console.log("responseText", xhr.responseText);

          failureHandler(xhr.readyState, xhr.status, xhr.responseText);
        }
      }
    };

    for (var key in headers) {
      var value = headers[key];
      console.log(key, value);
      xhr.setRequestHeader(key, value);
    }

    if(method !== "GET" && method !== "DELETE") {
      xhr.send(data);
    } else {
      xhr.send();
    }
  };
});

