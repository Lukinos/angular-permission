/**
 * angular-permission-ui
 * Extension module of angular-permission for access control within ui-router
 * @version v5.2.1 - 2017-02-02
 * @link https://github.com/Narzerus/angular-permission
 * @author Rafael Vidaurre <narzerus@gmail.com> (http://www.rafaelvidaurre.com), Blazej Krysiak <blazej.krysiak@gmail.com>
 * @license MIT License, http://www.opensource.org/licenses/MIT
 */

(function (window, angular, undefined) {
  'use strict';

  /**
   * @namespace permission.ui
   */

  /**
   * @param $stateProvider {Object}
   */
  config.$inject = ['$stateProvider'];
  run.$inject = ['$transitions', 'PermTransitionProperties', 'PermStateAuthorization', 'PermStatePermissionMap'];
  PermStateAuthorization.$inject = ['$q', '$state', 'PermStatePermissionMap'];
  PermStatePermissionMap.$inject = ['PermPermissionMap'];

  function config($stateProvider) {
    'ngInject';

    function $state($delegate) {
      /**
       * Property containing full state object definition
       *
       * This decorator is required to access full state object instead of just it's configuration
       * Can be removed when implemented https://github.com/angular-ui/ui-router/issues/13.
       *
       * @returns {Object}
       */
      $delegate.self.$$permissionState = function () {
        return $delegate;
      };

      return $delegate;
    }

    $stateProvider.decorator('$state', $state);
  }

  /**
   * @param $transitions {object}
   * @param PermTransitionProperties {permission.PermTransitionProperties}
   * @param PermStateAuthorization {permission.ui.PermStateAuthorization}
   * @param PermStatePermissionMap {permission.ui.PermStatePermissionMap}
   */
  function run($transitions, PermTransitionProperties, PermStateAuthorization, PermStatePermissionMap) {
    'ngInject';

    $transitions.onStart({}, function (transition) {
      var _toState = transition.to();
      var _toParams = transition.params('to');
      var _fromState = transition.from();
      var _fromParams = transition.params('from');
      var _options = transition.options();

      setTransitionProperties();

      var statePermissionMap = new PermStatePermissionMap(PermTransitionProperties.toState);

      return PermStateAuthorization
        .authorizeByPermissionMap(statePermissionMap)
        .catch(function (rejectedPermission) {
          return handleUnauthorizedState(rejectedPermission, statePermissionMap);
        });

      /**
       * Handles redirection for unauthorized access
       * @method
       * @private
       *
       * @param rejectedPermission {String} Rejected access right
       * @param statePermissionMap {permission.ui.PermPermissionMap} State permission map
       */
      function handleUnauthorizedState(rejectedPermission, statePermissionMap) {
        return statePermissionMap
          .resolveRedirectState(rejectedPermission)
          .then(function (redirect) {
            return transition.router.stateService
              .target(redirect.state, redirect.params, redirect.options);
          });
      }

      /**
       * Updates values of `PermTransitionProperties` holder object
       * @method
       * @private
       */
      function setTransitionProperties() {
        PermTransitionProperties.toState = _toState;
        PermTransitionProperties.toParams = _toParams;
        PermTransitionProperties.fromState = _fromState;
        PermTransitionProperties.fromParams = _fromParams;
        PermTransitionProperties.options = _options;
      }
    });
  }

  var uiPermission = angular
    .module('permission.ui', ['permission', 'ui.router'])
    .config(config)
    .run(run);

  if (typeof module !== 'undefined' && typeof exports !== 'undefined' && module.exports === exports) {
    module.exports = uiPermission.name;
  }


  /**
   * Service responsible for handling inheritance-enabled state-based authorization in ui-router
   * @extends permission.PermPermissionMap
   * @name permission.ui.PermStateAuthorization
   *
   * @param $q {Object} Angular promise implementation
   * @param $state {Object} State object
   * @param PermStatePermissionMap {permission.ui.PermStatePermissionMap|Function} Angular promise implementation
   */
  function PermStateAuthorization($q, $state, PermStatePermissionMap) {
    'ngInject';

    this.authorizeByPermissionMap = authorizeByPermissionMap;
    this.authorizeByStateName = authorizeByStateName;

    /**
     * Handles authorization based on provided state permission map
     * @methodOf permission.ui.PermStateAuthorization
     *
     * @param statePermissionMap
     *
     * @return {promise}
     */
    function authorizeByPermissionMap(statePermissionMap) {
      return authorizeStatePermissionMap(statePermissionMap);
    }

    /**
     * Authorizes uses by provided state name
     * @methodOf permission.ui.PermStateAuthorization
     *
     * @param stateName {String}
     * @returns {promise}
     */
    function authorizeByStateName(stateName) {
      var srefState = $state.get(stateName);
      var permissionMap = new PermStatePermissionMap(srefState);

      return authorizeByPermissionMap(permissionMap);
    }

    /**
     * Checks authorization for complex state inheritance
     * @methodOf permission.ui.PermStateAuthorization
     * @private
     *
     * @param map {permission.ui.StatePermissionMap} State access rights map
     *
     * @returns {promise} $q.promise object
     */
    function authorizeStatePermissionMap(map) {
      var deferred = $q.defer();

      resolveExceptStatePermissionMap(deferred, map);

      return deferred.promise;
    }

    /**
     * Resolves compensated set of "except" privileges
     * @methodOf permission.ui.PermStateAuthorization
     * @private
     *
     * @param deferred {Object} Promise defer
     * @param map {permission.ui.StatePermissionMap} State access rights map
     */
    function resolveExceptStatePermissionMap(deferred, map) {
      var exceptPromises = resolveStatePermissionMap(map.except, map);

      $q.all(exceptPromises)
        .then(function (rejectedPermissions) {
          deferred.reject(rejectedPermissions[0]);
        })
        .catch(function () {
          resolveOnlyStatePermissionMap(deferred, map);
        });
    }

    /**
     * Resolves compensated set of "only" privileges
     * @methodOf permission.ui.PermStateAuthorization
     * @private
     *
     * @param deferred {Object} Promise defer
     * @param map {permission.ui.StatePermissionMap} State access rights map
     */
    function resolveOnlyStatePermissionMap(deferred, map) {
      if (!map.only.length) {
        deferred.resolve();
        return;
      }

      var onlyPromises = resolveStatePermissionMap(map.only, map);

      $q.all(onlyPromises)
        .then(function (resolvedPermissions) {
          deferred.resolve(resolvedPermissions);
        })
        .catch(function (rejectedPermission) {
          deferred.reject(rejectedPermission);
        });
    }

    /**
     * Performs iteration over list of privileges looking for matches
     * @methodOf permission.ui.PermStateAuthorization
     * @private
     *
     * @param privilegesNames {Array} Array of sets of access rights
     * @param map {permission.ui.StatePermissionMap} State access rights map
     *
     * @returns {Array<Promise>} Promise collection
     */
    function resolveStatePermissionMap(privilegesNames, map) {
      if (!privilegesNames.length) {
        return [$q.reject()];
      }

      return privilegesNames.map(function (statePrivileges) {
        var resolvedStatePrivileges = map.resolvePropertyValidity(statePrivileges);
        return $q.any(resolvedStatePrivileges)
          .then(function (resolvedPermissions) {
            if (angular.isArray(resolvedPermissions)) {
              return resolvedPermissions[0];
            }
            return resolvedPermissions;
          });
      });
    }
  }

  angular
    .module('permission')
    .service('PermStateAuthorization', PermStateAuthorization);

  /**
   * State Access rights map factory
   * @function
   *
   * @param PermPermissionMap {permission.PermPermissionMap|Function}
   *
   * @return {permission.ui.StatePermissionMap}
   */
  function PermStatePermissionMap(PermPermissionMap) {
    'ngInject';

    StatePermissionMap.prototype = new PermPermissionMap();

    /**
     * Constructs map instructing authorization service how to handle authorizing
     * @constructor permission.ui.StatePermissionMap
     * @extends permission.PermPermissionMap
     */
    function StatePermissionMap(state) {
      var toStateObject = state.$$permissionState();
      var toStatePath = toStateObject.path;

      angular.forEach(toStatePath, function (state) {
        if (areSetStatePermissions(state)) {
          var permissionMap = new PermPermissionMap(state.data.permissions);
          this.extendPermissionMap(permissionMap);
        }
      }, this);
    }

    /**
     * Extends permission map by pushing to it state's permissions
     * @methodOf permission.ui.StatePermissionMap
     *
     * @param permissionMap {permission.PermPermissionMap} Compensated permission map
     */
    StatePermissionMap.prototype.extendPermissionMap = function (permissionMap) {
      if (permissionMap.only.length) {
        this.only = this.only.concat([permissionMap.only]);
      }
      if (permissionMap.except.length) {
        this.except = this.except.concat([permissionMap.except]);
      }

      if (angular.isDefined(permissionMap.redirectTo)) {
        this.redirectTo = angular.extend({}, this.redirectTo, permissionMap.redirectTo);
      }
    };


    /**
     * Checks if state has set permissions
     * We check for hasOwnProperty, because ui-router lets the `data` property inherit from its parent
     * @methodOf permission.ui.StatePermissionMap
     * @private
     *
     * @returns {boolean}
     */
    function areSetStatePermissions(state) {
      try {
        return Object.prototype.hasOwnProperty.call(state.data, 'permissions');
      } catch (e) {
        return false;
      }
    }

    return StatePermissionMap;
  }

  angular
    .module('permission.ui')
    .factory('PermStatePermissionMap', PermStatePermissionMap);

}(window, window.angular));
