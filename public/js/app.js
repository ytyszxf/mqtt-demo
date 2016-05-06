'use strict';

angular.module('mqttDemo', [
  'ngRoute',
  'mqttDemo.controllers',
  'mqttDemo.services',
  'mqttDemo.filters',
  'ui.bootstrap'
]).
config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/demo', {
    templateUrl: 'templates/mqtt-test.html',
    controller: 'ConnectionCtrl'
  })
  $routeProvider.when('/connection', {
    templateUrl: 'templates/connection-test.html',
    controller: 'TestCtrl'
  })
  .otherwise({redirectTo: '/demo'});
}]);
