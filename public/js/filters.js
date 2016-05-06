'use strict';

angular.module('mqttDemo.filters',[])
.filter('keyName', function(){
  return function(input){
    if(!angular.isObject(input)){
      throw Error("Usage of non-objects with key filter!!")
    }
    return Object.keys(input);
  }
});