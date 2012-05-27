/**
 * Rekapi - Rewritten Kapi. v0.8.6
 *   By Jeremy Kahn - jeremyckahn@gmail.com
 *   https://github.com/jeremyckahn/rekapi
 *
 * Make fun keyframe animations with JavaScript.
 * Dependencies: Underscore.js (https://github.com/documentcloud/underscore), Shifty.js (https://github.com/jeremyckahn/shifty)
 * MIT Lincense.  This code free to use, modify, distribute and enjoy.
 */
;(function(global) {

var rekapiCore = function (global, deps) {

  /**
   * Sorts an array numerically, from smallest to largest.
   * @param {Array} array The Array to sort.
   * @return {Array} The sorted Array.
   */
  function sortNumerically (array) {
    return array.sort(function (a, b) {
      return a - b;
    });
  }


  /**
   * Determines which iteration of the loop the animation is currently in.
   * @param {Kapi} kapi
   * @param {number} timeSinceStart
   */
  function determineCurrentLoopIteration (kapi, timeSinceStart) {
    var currentIteration;

    currentIteration = Math.floor((timeSinceStart) / kapi._animationLength);
    return currentIteration;
  }


  /**
   * Calculate how many milliseconds since the animation began.
   * @param {Kapi} kapi
   * @return {number}
   */
  function calculateTimeSinceStart (kapi) {
    var timeSinceStart;

    timeSinceStart = now() - kapi._loopTimestamp;
    return timeSinceStart;
  }


  /**
   * Determines is the animation is complete or not.
   * @param {Kapi} kapi
   * @param {number} currentLoopIteration
   */
  function isAnimationComplete (kapi, currentLoopIteration) {
    return currentLoopIteration >= kapi._timesToIterate
        && kapi._timesToIterate !== -1;
  }


  /**
   * Stops the animation if the animation is complete.
   * @param {Kapi} kapi
   * @param {number} currentLoopIteration
   */
  function updatePlayState (kapi, currentLoopIteration) {
    if (isAnimationComplete(kapi, currentLoopIteration)) {
      kapi.stop();
      fireEvent(kapi, 'onAnimationComplete');
    }
  }


  /**
   * Calculate how far in the animation loop `kapi` is, in milliseconds, based
   * on the current time.  Also overflows into a new loop if necessary.
   * @param {Kapi} kapi
   * @return {number}
   */
  function calculateLoopPosition (kapi, forMillisecond, currentLoopIteration) {
    var currentLoopPosition;

    if (isAnimationComplete(kapi, currentLoopIteration)) {
      currentLoopPosition = kapi._animationLength;
    } else {
      currentLoopPosition = forMillisecond % kapi._animationLength;
    }

    return currentLoopPosition;
  }


  /**
   * Calculate the position and state for a given millisecond and render it.
   * Also updates the state internally and accounts for how many loop
   * iterations the animation runs for.
   * @param {Kapi} kapi
   * @param {number} forMillisecond The millisecond to render
   */
  function renderMillisecond (kapi, forMillisecond) {
    var currentIteration
        ,loopPosition;

    currentIteration = determineCurrentLoopIteration(kapi, forMillisecond);
    loopPosition = calculateLoopPosition(kapi, forMillisecond,
        currentIteration);
    kapi.render(loopPosition);
    updatePlayState(kapi, currentIteration);
  }


  /**
   * Calculate how far in the animation loop `kapi` is, in milliseconds, and
   * render based on that time.
   * @param {Kapi} kapi
   */
  function renderCurrentMillisecond (kapi) {
    renderMillisecond(kapi, calculateTimeSinceStart(kapi));
  }


  /**
   * This is the heartbeat of an animation.  Renders a frame and then calls
   * itself based on the framerate of the supplied Kapi.
   * @param {Kapi} kapi
   */
  function tick (kapi) {
    var updateFn = function () {
      tick(kapi);
      renderCurrentMillisecond(kapi);
    };

    // Need to check for .call presence to get around an IE limitation.
    // See annotation for cancelLoop for more info.
    if (kapi._scheduleUpdate.call) {
      kapi._loopId = kapi._scheduleUpdate.call(window,
          updateFn, 1000 / kapi.config.fps);
    } else {
      kapi._loopId = setTimeout(updateFn, 1000 / kapi.config.fps);
    }
  }


  /**
   * Fire an event bound to a Kapi.
   * @param {Kapi} kapi
   * @param {string} eventName
   */
  function fireEvent (kapi, eventName) {
    _.each(kapi._events[eventName], function (handler) {
      handler(kapi);
    });
  }


  /**
   * @param {number}
   * @return {Function}
   */
  function getUpdateMethod (framerate) {
    if (framerate !== 60) {
      return window.setTimeout;
    } else {
      // requestAnimationFrame() shim by Paul Irish (modified for Rekapi)
      // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
      return  window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        (window.mozCancelRequestAnimationFrame
          && window.mozRequestAnimationFrame) ||
        window.setTimeout;
    }
  }


  /**
   * @param {number}
   * @return {Function}
   */
  function getCancelMethod (framerate) {
    if (framerate !== 60) {
      return window.clearTimeout;
    } else {
      return  window.cancelAnimationFrame ||
        window.webkitCancelAnimationFrame ||
        window.oCancelAnimationFrame      ||
        window.msCancelAnimationFrame     ||
        window.mozCancelRequestAnimationFrame ||
        window.clearTimeout;
    }
  }


  /**
   * Draw all the `Actor`s at whatever position they are currently in.
   * @param {Kapi}
   * @return {Kapi}
   */
  function draw (kapi) {
    var i, len
        ,currentActor
        ,canvas_context
        ,orderedActors
        ,drawOrder;

    fireEvent(kapi, 'onBeforeDraw');
    len = kapi._drawOrder.length;

    if (kapi._drawOrderSorter) {
      orderedActors = drawOrder =
          _.sortBy(kapi._actors, kapi._drawOrderSorter);
      drawOrder = _.pluck(orderedActors, 'id');
    } else {
      drawOrder = kapi._drawOrder;
    }

    for (i = 0; i < len; i++) {
      currentActor = kapi._actors[drawOrder[i]];
      canvas_context = currentActor.context();
      currentActor.render(canvas_context, currentActor.get());
    }

    return kapi;
  };


  /**
   * Cancels an update loop.  This abstraction is needed to get around the fact
   * that in IE, clearTimeout is not technically a function
   * (https://twitter.com/kitcambridge/status/206655060342603777) and thus
   * Function.prototype.call cannot be used upon it.
   * @param {Kapi} kapi
   */
  function cancelLoop (kapi) {
    if (kapi._cancelUpdate.call) {
      kapi._cancelUpdate.call(window, kapi._loopId);
    } else {
      clearTimeout(kapi._loopId);
    }
  }


  /**
   * Does nothing.  Absolutely nothing at all.
   */
  function noop () {
    // NOOP!
  }

  var _ = (deps && deps.underscore) ? deps.underscore : global._;
  var Tweenable = (deps && deps.Tweenable) ? deps.Tweenable : global.Tweenable;
  var now = Tweenable.util.now;

  var defaultConfig = {
    'fps': 60
    ,'clearOnUpdate': true
  };

  var playState = {
    'STOPPED': 'stopped'
    ,'PAUSED': 'paused'
    ,'PLAYING': 'playing'
  };


  /**
   * @param {Object} context
   * @param {Object} opt_config
   * @constructor
   */
  var gk = global.Kapi || function Kapi (opt_config) {
    this.config = opt_config || {};
    this.context = this.config.context;
    this._actors = {};
    this._drawOrder = [];
    this._playState = playState.STOPPED;
    this._drawOrderSorter = null;

    this._events = {
      'onFrameRender': []
      ,'onAnimationComplete': []
      ,'onPlayStateChange': []
      ,'onPlay': []
      ,'onPause': []
      ,'onStop': []
      ,'onBeforeDraw': []
    };

    // How many times to loop the animation before stopping.
    this._timesToIterate = -1;

    // Millisecond duration of the animation
    this._animationLength = 0;

    // The setTimeout ID of `tick`
    this._loopId = null;

    // The UNIX time at which the animation loop started
    this._loopTimestamp = null;

    // Used for maintaining position when the animation is paused.
    this._pausedAtTime = null;

    // The last millisecond position that was drawn
    this._lastRenderedMillisecond = 0;

    _.extend(this.config, opt_config);
    _.defaults(this.config, defaultConfig);

    this._scheduleUpdate = getUpdateMethod(this.config.fps);
    this._cancelUpdate = getCancelMethod(this.config.fps);

    _.each(this._contextInitHook, function (fn) {
      fn.call(this);
    }, this)

    return this;
  };


  /**
   * @type {{function}} Contains the context init function to be called in the
   * Kapi contstructor.
   */
  gk.prototype._contextInitHook = {};


  /**
   * @private
   *
   * @return {Kapi}
   */
  gk.prototype._recalculateAnimationLength = function () {
    var actorLengths = [];

    _.each(this._actors, function (actor) {
      actorLengths.push(actor.getEnd());
    });

    this._animationLength = Math.max.apply(Math, actorLengths);

    return this;
  };


  /**
   * @param {Kapi.Actor} actor
   * @return {Kapi}
   */
  gk.prototype.addActor = function (actor) {
    // You can't add an actor more than once.
    if (!_.contains(this._actors, actor)) {
      if (!actor.context()) {
        actor.context(this.context);
      }

      actor.kapi = this;
      actor.fps = this.framerate();
      this._actors[actor.id] = actor;
      this._drawOrder.push(actor.id);
      actor.setup();
    }

    return this;
  };


  /**
   * @param {number} actorId
   * @return {Kapi.Actor}
   */
  gk.prototype.getActor = function (actorId) {
    return this._actors[actorId];
  };


  /**
   * @returns {Array}
   */
  gk.prototype.getActorIds = function () {
    return _.pluck(this._actors, 'id');
  };


  /**
   * @returns {Array}
   */
  gk.prototype.getAllActors = function () {
    return _.clone(this._actors);
  };


  /**
   * @param {Kapi.Actor} actor
   * @return {Kapi}
   */
  gk.prototype.removeActor = function (actor) {
    delete this._actors[actor.id];
    delete actor.kapi;
    this._drawOrder = _.without(this._drawOrder, actor.id);
    actor.teardown();
    this._recalculateAnimationLength();

    return this;
  };


  /**
   * @param {number} opt_howManyTimes
   * @return {Kapi}
   */
  gk.prototype.play = function (opt_howManyTimes) {
    cancelLoop(this);

    if (this._playState === playState.PAUSED) {
      this._loopTimestamp += now() - this._pausedAtTime;
    } else {
      this._loopTimestamp = now();
    }

    this._timesToIterate = opt_howManyTimes || -1;
    this._playState = playState.PLAYING;
    tick(this);

    // also resume any Shifty tweens that are paused.
    _.each(this._actors, function (actor) {
      if (actor._state.isPaused ) {
        actor.resume();
      }
    });

    fireEvent(this, 'onPlayStateChange');
    fireEvent(this, 'onPlay');

    return this;
  };


  /**
   * @param {number} millisecond
   * @param {number} opt_howManyTimes
   * @return {Kapi}
   */
  gk.prototype.playFrom = function (millisecond, opt_howManyTimes) {
    this.play(opt_howManyTimes);
    this._loopTimestamp = now() - millisecond;

    return this;
  };


  /**
   * @param {number} opt_howManyTimes
   * @return {Kapi}
   */
  gk.prototype.playFromCurrent = function (opt_howManyTimes) {
    return this.playFrom(this._lastRenderedMillisecond, opt_howManyTimes);
  };


  /**
   * @return {Kapi}
   */
  gk.prototype.pause = function () {
    if (this._playState === playState.PAUSED) {
      return this;
    }

    this._playState = playState.PAUSED;
    cancelLoop(this);
    this._pausedAtTime = now();

    // also pause any shifty tweens that are running.
    _.each(this._actors, function (actor) {
      if (actor._state.isTweening) {
        actor.pause();
      }
    });

    fireEvent(this, 'onPlayStateChange');
    fireEvent(this, 'onPause');

    return this;
  };


  /**
   * @return {Kapi}
   */
  gk.prototype.stop = function () {
    this._playState = playState.STOPPED;
    cancelLoop(this);

    // Also kill any shifty tweens that are running.
    _.each(this._actors, function (actor) {
      actor.stop();
    });

    fireEvent(this, 'onPlayStateChange');
    fireEvent(this, 'onStop');

    return this;
  };


  /**
   * @return {boolean}
   */
  gk.prototype.isPlaying = function () {
    return this._playState === playState.PLAYING;
  };


  /**
   * @return {number}
   */
  gk.prototype.animationLength = function () {
    return this._animationLength;
  };


  /**
   * @return {number}
   */
  gk.prototype.lastPositionRendered = function () {
    return (this._lastRenderedMillisecond / this._animationLength);
  };


  /**
   * @return {number}
   */
  gk.prototype.actorCount = function () {
    return this._drawOrder.length;
  };


  /**
   * @param {number} opt_newFramerate
   * @return {number}
   */
  gk.prototype.framerate = function (opt_newFramerate) {
    if (opt_newFramerate) {
      this.config.fps = opt_newFramerate;
      this._scheduleUpdate = getUpdateMethod(this.config.fps);
      this._cancelUpdate = getCancelMethod(this.config.fps);
    }

    return this.config.fps;
  };


  /**
   * @param {number} millisecond
   * @return {Kapi}
   */
  gk.prototype.render = function (millisecond) {
    this.calculateActorPositions(millisecond);
    draw(this);
    this._lastRenderedMillisecond = millisecond;
    fireEvent(this, 'onFrameRender');

    return this;
  };


  /**
   * @return {Kapi}
   */
  gk.prototype.redraw = function () {
    this.render(this._lastRenderedMillisecond);

    return this;
  };


  /**
   * @param {number} millisecond
   * @return {Kapi}
   */
  gk.prototype.calculateActorPositions = function (millisecond) {
    var len = this._drawOrder.length;

    for (var i = 0; i < len; i++) {
      this._actors[this._drawOrder[i]].calculatePosition(millisecond);
    }

    return this;
  };


  /**
   * @param {Kapi.Actor} actor
   * @param {number} layer
   * @return {Kapi.Actor|undefined}
   */
  gk.prototype.moveActorToLayer = function (actor, layer) {
    if (layer < this._drawOrder.length) {
      this._drawOrder = _.without(this._drawOrder, actor.id);
      this._drawOrder.splice(layer, 0, actor.id);

      return actor;
    }

    return;
  };


  /**
   * @param {string} eventName
   * @param {Function} handler
   * @return {Kapi}
   */
  gk.prototype.bind = function (eventName, handler) {
    if (!this._events[eventName]) {
      return;
    }

    this._events[eventName].push(handler);

    return this;
  };


  /**
   * @param {string} eventName
   * @param {Function} opt_handler
   * @return {Kapi}
   */
  gk.prototype.unbind = function (eventName, opt_handler) {
    if (!this._events[eventName]) {
      return;
    }

    if (!opt_handler) {
      this._events[eventName] = [];
    } else {
      this._events[eventName] = _.without(this._events[eventName],
        opt_handler);
    }

    return this;
  };


  /**
   * @param {function(Kapi.Actor, number)} sortFunction
   * @return {Kapi}
   */
  gk.prototype.setOrderFunction = function (sortFunction) {
    this._drawOrderSorter = sortFunction;
    return this;
  };


  /**
   * @return {Kapi}
   */
  gk.prototype.unsetOrderFunction = function () {
    this._drawOrderSorter = null;
    return this;
  };


  /**
   * @return {Object}
   */
  gk.prototype.exportTimeline = function () {
    var exportData = {
      'duration': this._animationLength
      ,'actorOrder': this._drawOrder.slice(0)
      ,'actors': {}
    };

    _.each(this._drawOrder, function (actorId) {
      exportData.actors[actorId] = this._actors[actorId].exportTimeline();
    }, this);

    return exportData;
  };


  gk.util = {};

  //TODO:  There are some duplicates in gk.util and gk._private, clean up the
  // references in the tests.
  _.extend(gk.util, {
    'noop': noop
    ,'sortNumerically': sortNumerically
    ,'calculateLoopPosition': calculateLoopPosition
    ,'calculateTimeSinceStart': calculateTimeSinceStart
  });

  // Some hooks for testing.
  if (typeof KAPI_DEBUG !== 'undefined' && KAPI_DEBUG === true) {
    gk._private = {
      'sortNumerically': sortNumerically
      ,'calculateLoopPosition': calculateLoopPosition
      ,'renderCurrentMillisecond': renderCurrentMillisecond
      ,'tick': tick
      ,'determineCurrentLoopIteration': determineCurrentLoopIteration
      ,'calculateTimeSinceStart': calculateTimeSinceStart
      ,'isAnimationComplete': isAnimationComplete
      ,'updatePlayState': updatePlayState
    }
  }

  global.Kapi = gk;

};
var rekapiActor = function (global, deps) {

  var DEFAULT_EASING = 'linear'
      ,gk
      ,actorCount
      ,ActorMethods
      ,_ = (deps && deps.underscore) ? deps.underscore : global._
      ,Tweenable = (deps && deps.Tweenable) ?
          deps.Tweenable : global.Tweenable;

  gk = global.Kapi;
  actorCount = 0;


  function getUniqueActorId () {
    return actorCount++;
  }


  /**
   * @param {Kapi.Actor} actor
   * @param {number} millisecond
   * @return {number}
   */
  //TODO:  Oh noes, this is a linear search!  Maybe optimize it?
  function getPropertyCacheIdForMillisecond (actor, millisecond) {
    var list = actor._timelinePropertyCacheIndex;
    var len = list.length;

    for (var i = 1; i < len; i++) {
      if (list[i] >= millisecond) {
        return (i - 1);
      }
    }

    return -1;
  }


  /**
   * Order all of an Actor's property tracks so they can be cached.
   * @param {Kapi.Actor} actor
   */
  function sortPropertyTracks (actor) {
    _.each(actor._propertyTracks, function (track, name) {
      actor._propertyTracks[name] = _.sortBy(actor._propertyTracks[name],
        function (keyframeProperty) {
        return keyframeProperty.millisecond;
      });
    });
  }


  /**
   * Compute and fill all timeline caches.
   * @param {Kapi.Actor} actor
   */
  function cachePropertiesToSegments (actor) {
    _.each(actor._timelinePropertyCaches, function (propertyCache, cacheId) {
      var latestProperties = getLatestPropeties(actor, +cacheId);
      _.defaults(propertyCache, latestProperties);
    });
  }


  /**
   * Gets all of the current and most recent Kapi.KeyframeProperty's for a
   * given millisecond.
   * @param {Kapi.Actor} actor
   * @param {number} forMillisecond
   */
  function getLatestPropeties (actor, forMillisecond) {
    var latestProperties = {};

    _.each(actor._propertyTracks, function (propertyTrack, propertyName) {
      var previousKeyframeProperty = null;

      _.find(propertyTrack, function (keyframeProperty) {
        if (keyframeProperty.millisecond > forMillisecond) {
          latestProperties[propertyName] = previousKeyframeProperty;
        } else if (keyframeProperty.millisecond === forMillisecond) {
          latestProperties[propertyName] = keyframeProperty;
        }

        previousKeyframeProperty = keyframeProperty;
        return !!latestProperties[propertyName];
      });

      if (!latestProperties[propertyName]) {
        var lastProp = _.last(propertyTrack);

        if (lastProp && lastProp.millisecond <= forMillisecond) {
          latestProperties[propertyName] = lastProp;
        }
      }
    });

    return latestProperties;
  }


  /**
   * Links each KeyframeProperty to the next one in it's respective track.
   *
   * They're linked lists!
   * @param {Kapi.Actor} actor
   */
  function linkTrackedProperties (actor) {
    _.each(actor._propertyTracks, function (propertyTrack, trackName) {
      _.each(propertyTrack, function (trackProperty, i) {
        trackProperty.linkToNext(propertyTrack[i + 1]);
      });
    });
  }


  /**
   * Returns a requested KeyframeProperty at a millisecond on a specified
   * track.
   * @param {Kapi.Actor} actor
   * @param {string} trackName
   * @param {number} millisecond
   * @return {Kapi.KeyframeProperty}
   */
  function findPropertyAtMillisecondInTrack (actor, trackName, millisecond) {
    return _.find(actor._propertyTracks[trackName],
        function (keyframeProperty) {
      return keyframeProperty.millisecond === millisecond;
    });
  }


  /**
   * @param {Object} opt_config
   * @constructor
   */
  gk.Actor = function Actor (opt_config) {

    opt_config = opt_config || {};

    // Steal the `Tweenable` constructor.
    this.constructor.call(this);

    _.extend(this, {
      '_data': {}
      ,'_propertyTracks': {}
      ,'_timelinePropertyCaches': {}
      ,'_timelinePropertyCacheIndex': []
      ,'_keyframeProperties': {}
      ,'_isPersisting': false
      ,'id': getUniqueActorId()
      ,'setup': opt_config.setup || gk.util.noop
      ,'render': opt_config.render || gk.util.noop
      ,'teardown': opt_config.teardown || gk.util.noop
    });

    if (opt_config.context) {
      this.context(opt_context);
    }

    return this;
  };


  // Kind of a fun way to set up an inheritance chain.  `ActorMethods` prevents
  // methods on `Actor.prototype` from polluting `Tweenable`'s prototype with
  // `Actor` specific methods.
  ActorMethods = function () {};
  ActorMethods.prototype = Tweenable.prototype;
  gk.Actor.prototype = new ActorMethods();
  // But the magic doesn't stop here!  `Actor`'s constructor steals the
  // `Tweenable` constructor.


  /**
   * @param {Object} opt_context
   * @return {Object}
   */
  gk.Actor.prototype.context = function (opt_context) {
    if (opt_context) {
      this._context = opt_context;
    }

    return this._context;
  };


  /**
   * @param {number} when
   * @param {Object} position
   * @param {string|Object} easing
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.keyframe = function keyframe (when, position,
      opt_easing) {
    var originalEasingString;

    // TODO:  The opt_easing logic seems way overcomplicated, it's probably out
    // of date.  Multiple eases landed first in Rekapi, then were pushed
    // upstream into Shifty.  There's likely some redundant logic here.
    opt_easing = opt_easing || DEFAULT_EASING;

    if (typeof opt_easing === 'string') {
      originalEasingString = opt_easing;
      opt_easing = {};
      _.each(position, function (positionVal, positionName) {
        opt_easing[positionName] = originalEasingString;
      });
    }

    // If `opt_easing` was passed as an Object, this will fill in any missing
    // opt_easing properties with the default equation.
    _.each(position, function (positionVal, positionName) {
      opt_easing[positionName] = opt_easing[positionName] || DEFAULT_EASING;
    });

    _.each(position, function (value, name) {
      var newKeyframeProperty;

      newKeyframeProperty = new gk.KeyframeProperty(this, when, name, value,
          opt_easing[name]);
      this._keyframeProperties[newKeyframeProperty.id] = newKeyframeProperty;

      if (!this._propertyTracks[name]) {
        this._propertyTracks[name] = [];
      }

      this._propertyTracks[name].push(newKeyframeProperty);
      sortPropertyTracks(this);
    }, this);

    this.kapi._recalculateAnimationLength();
    this.invalidatePropertyCache();

    return this;
  };


  /**
   * @param {string} property
   * @param {number} index
   * @return {Kapi.KeyframeProperty}
   */
  gk.Actor.prototype.getKeyframeProperty = function (property, index) {
    if (this._propertyTracks[property]
        && this._propertyTracks[property][index]) {
      return this._propertyTracks[property][index];
    }
  };


  /**
   * @param {string} property
   * @param {number} index
   * @param {Object} newProperties
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.modifyKeyframeProperty = function (property, index,
      newProperties) {
    if (this._propertyTracks[property]
        && this._propertyTracks[property][index]) {
      this._propertyTracks[property][index].modifyWith(newProperties);
    }

    sortPropertyTracks(this);
    this.invalidatePropertyCache();
    return this;
  };


  /**
   * @return {Array}
   */
  gk.Actor.prototype.getTrackNames = function () {
    return _.keys(this._propertyTracks);
  };


  /**
   * @param {string} trackName
   * @return {number}
   */
  gk.Actor.prototype.getTrackLength = function (trackName) {
    if (!this._propertyTracks[trackName]) {
      return;
    }

    return this._propertyTracks[trackName].length;
  };


  /**
   * @param {number} copyTo
   * @param {number} copyFrom
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.copyProperties = function (copyTo, copyFrom) {
    var sourcePositions
        ,sourceEasings;

    sourcePositions = {};
    sourceEasings = {};

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var foundProperty;

      foundProperty = findPropertyAtMillisecondInTrack(this, trackName,
          copyFrom);

      if (foundProperty) {
        sourcePositions[trackName] = foundProperty.value;
        sourceEasings[trackName] = foundProperty.easing;
      }
    }, this);

    this.keyframe(copyTo, sourcePositions, sourceEasings);
    return this;
  };


  /**
   * @param {number} until
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.wait = function (until) {
    var length = this.getEnd();

    if (until <= length) {
      return this;
    }

    var end = this.getEnd();
    var latestProps = getLatestPropeties(this, this.getEnd());
    var serializedProps = {};
    var serializedEasings = {};

    _.each(latestProps, function (latestProp, propName) {
      serializedProps[propName] = latestProp.value;
      serializedEasings[propName] = latestProp.easing;
    });

    this.removeKeyframe(end);
    this.keyframe(end, serializedProps, serializedEasings);
    this.keyframe(until, serializedProps, serializedEasings);

    return this;
  };


  /**
   * @return {number}
   */
  gk.Actor.prototype.getStart = function () {
    var starts = [];

    _.each(this._propertyTracks, function (propertyTrack) {
      if (propertyTrack.length) {
        starts.push(propertyTrack[0].millisecond);
      }
    });

    if (starts.length === 0) {
      starts = [0];
    }

    return Math.min.apply(Math, starts);
  };


  /**
   * @return {number}
   */
  gk.Actor.prototype.getEnd = function () {
    var latest = 0;

    _.each(this._propertyTracks, function (propertyTrack) {
      if (propertyTrack.length) {
        var trackLength = _.last(propertyTrack).millisecond;

        if (trackLength > latest) {
          latest = trackLength;
        }
      }
    }, this);

    return latest;
  };


  /**
   * @return {number}
   */
  gk.Actor.prototype.getLength = function () {
    return this.getEnd() - this.getStart();
  }


  /**
   * @param {number} when
   * @param {Object} stateModification
   * @param {Object} opt_easingModification
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.modifyKeyframe = function (when, stateModification,
      opt_easingModification) {

    opt_easingModification = opt_easingModification || {};

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var property = findPropertyAtMillisecondInTrack(this, trackName, when);

      if (property) {
        property.modifyWith({
          'value': stateModification[trackName]
          ,'easing': opt_easingModification[trackName]
        });
      }
    }, this);


    return this;
  };


  /**
   * @param {when} when
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.removeKeyframe = function (when) {
    _.each(this._propertyTracks, function (propertyTrack, propertyName) {
      var i = -1;
      var foundProperty = false;

      _.find(propertyTrack, function (keyframeProperty) {
        i++;
        foundProperty = (when === keyframeProperty.millisecond);
        return foundProperty;
      });

      if (foundProperty) {
        var removedProperty = propertyTrack.splice(i, 1)[0];

        if (removedProperty) {
          delete this._keyframeProperties[removedProperty.id];
        }
      }
    }, this);
    this.kapi._recalculateAnimationLength();
    this.invalidatePropertyCache();

    return this;
  };


  /**
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.removeAllKeyframeProperties = function () {
    _.each(this._propertyTracks, function (propertyTrack, propertyName) {
      propertyTrack.length = 0;
    }, this);

    this._keyframeProperties = {};
    return this.removeKeyframe(0);
  };


  /**
   * @param {number} layer
   * @return {Kapi.Actor|undefined}
   */
  gk.Actor.prototype.moveToLayer = function (layer) {
    return this.kapi.moveActorToLayer(this, layer);
  };


  /**
   * @param {number} millisecond
   * @return {Kapi.Actor}
   */
  gk.Actor.prototype.calculatePosition = function (millisecond) {
    var startMs = this.getStart();
    var endMs = this.getEnd();

    if (startMs <= millisecond && millisecond <= endMs) {
      var latestCacheId = getPropertyCacheIdForMillisecond(this, millisecond);
      var propertiesToInterpolate =
          this._timelinePropertyCaches[this._timelinePropertyCacheIndex[
          latestCacheId]];
      var interpolatedObject = {};

      _.each(propertiesToInterpolate, function (keyframeProperty, propName) {
        if (keyframeProperty) {
          interpolatedObject[propName] =
              keyframeProperty.getValueAt(millisecond);
        }
      });

      this.set(interpolatedObject);
    }

    return this;
  };


  /**
   * @param {Object} opt_newData
   * @return {Object}
   */
  gk.Actor.prototype.data = function (opt_newData) {
    if (opt_newData) {
      this._data = opt_newData;
    }

    return this._data;
  };


  /**
   * @return {Object}
   */
  gk.Actor.prototype.exportTimeline = function () {
    var exportData = {
      'start': this.getStart()
      ,'end': this.getEnd()
      ,'trackNames': this.getTrackNames()
      ,'propertyTracks': {}
    };

    _.each(this._propertyTracks, function (propertyTrack, trackName) {
      var trackAlias = exportData.propertyTracks[trackName] = [];
      _.each(propertyTrack, function (keyframeProperty) {
        trackAlias.push(keyframeProperty.exportPropertyData());
      });
    });

    return exportData;
  };


  /**
   * Empty out and re-cache internal KeyframeProperty data.
   */
  gk.Actor.prototype.invalidatePropertyCache = function () {
    this._timelinePropertyCaches = {};

    _.each(this._keyframeProperties, function (keyframeProperty) {
      if (!this._timelinePropertyCaches[keyframeProperty.millisecond]) {
        this._timelinePropertyCaches[keyframeProperty.millisecond] = {};
      }

      this._timelinePropertyCaches[keyframeProperty.millisecond][
          keyframeProperty.name] = keyframeProperty;
    }, this);

    this._timelinePropertyCacheIndex = _.keys(this._timelinePropertyCaches);

    _.each(this._timelinePropertyCacheIndex, function (listId, i) {
      this._timelinePropertyCacheIndex[i] = +listId;
    }, this);

    gk.util.sortNumerically(this._timelinePropertyCacheIndex);
    cachePropertiesToSegments(this);
    linkTrackedProperties(this);
  };

};
var rekapiKeyframeProperty = function (global, deps) {
  var gk
      ,DEFAULT_EASING = 'linear'
      ,KeyframePropertyMethods
      ,_ = (deps && deps.underscore) ? deps.underscore : global._
      ,Tweenable = (deps && deps.Tweenable) ? deps.Tweenable : global.Tweenable;

  gk = global.Kapi;

  /**
   * @param {Kapi.Actor} ownerActor
   * @param {number} millisecond
   * @param {string} name
   * @param {number} value
   * @param {string} opt_easing
   * @constructor
   */
  gk.KeyframeProperty = function (ownerActor, millisecond, name, value,
      opt_easing) {
    this.id = _.uniqueId('keyframeProperty_');
    this.ownerActor = ownerActor;
    this.millisecond = millisecond;
    this.name = name;
    this.value = value;
    this.easing = opt_easing || DEFAULT_EASING;
    this.nextProperty = null;

    return this;
  };


  /**
   * @param {Object} newProperties
   */
  gk.KeyframeProperty.prototype.modifyWith = function (newProperties) {
    var modifiedProperties = {};

    _.each(['millisecond', 'easing', 'value'], function (str) {
      modifiedProperties[str] = typeof(newProperties[str]) === 'undefined' ?
          this[str] : newProperties[str];
    }, this);

    _.extend(this, modifiedProperties);
  };


  /**
   * @param {KeyframeProperty} nextProperty
   */
  gk.KeyframeProperty.prototype.linkToNext = function (nextProperty) {
    this.nextProperty = nextProperty || null;
  };


  /**
   * @param {number} millisecond
   * @return {number}
   */
  gk.KeyframeProperty.prototype.getValueAt = function (millisecond) {
    var fromObj
        ,toObj
        ,delta
        ,interpolatedPosition
        ,value;

    fromObj = {};
    toObj = {};

    if (this.nextProperty) {
      fromObj[this.name] = this.value;
      toObj[this.name] = this.nextProperty.value;
      delta = this.nextProperty.millisecond - this.millisecond;
      interpolatedPosition = (millisecond - this.millisecond) / delta;
      value = Tweenable.util.interpolate(fromObj, toObj, interpolatedPosition,
          this.nextProperty.easing)[this.name];
    } else {
      value =  this.value;
    }

    return value;
  };


  /**
   * @return {Object}
   */
  gk.KeyframeProperty.prototype.exportPropertyData = function () {
    return {
     'id': this.id
     ,'millisecond': this.millisecond
     ,'name': this.name
     ,'value': this.value
     ,'easing': this.easing
    };
  };

};
var rekapiCanvasContext = function (global, deps) {

  var gk = global.Kapi;
  var _ = (deps && deps.underscore) ? deps.underscore : global._;


  /**
   * Gets (and optionally sets) height or width on a canvas.
   * @param {HTMLCanvas} context
   * @param {string} dimension The dimension (either "height" or "width") to
   *    get or set.
   * @param {number} opt_newSize The new value to set for `dimension`.
   * @return {number}
   */
  function canvasDimension (context, dimension, opt_newSize) {
    if (typeof opt_newSize !== 'undefined') {
      context[dimension] = opt_newSize;
      context.style[dimension] = opt_newSize + 'px';
    }

    return context[dimension];
  }


  /**
   * Takes care of some pre-render tasks for canvas animations.  To be called
   * in the context of the Kapi instance.
   */
  function onBeforeDraw () {
    if (this.config.clearOnUpdate) {
      this.canvasClear();
    }
  }


  gk.prototype._contextInitHook.canvas = function () {
    if (!(this.config.context && this.config.context.nodeName === 'CANVAS')) {
      return;
    }

    _.each(['Height', 'Width'], function (dimension) {
      var dimensionLower = dimension.toLowerCase();
      if (this.config[dimensionLower]) {
        this['canvas' + dimension](this.config[dimensionLower]);
        delete this.config[dimension];
      }
    }, this);

    this.bind('onBeforeDraw', _.bind(onBeforeDraw, this));
  };


  /**
   * @param {number} opt_height
   * @return {number}
   */
  gk.prototype.canvasHeight = function (opt_height) {
    return canvasDimension(this.context, 'height', opt_height);
  };


  /**
   * @param {number} opt_width
   * @return {number}
   */
  gk.prototype.canvasWidth = function (opt_width) {
    return canvasDimension(this.context, 'width', opt_width);
  };


  /**
   * @return {Kapi}
   */
  gk.prototype.canvasClear = function () {
    this.canvasContext().clearRect(0, 0, this.canvasWidth(),
        this.canvasHeight());

    return this;
  };


  /**
   * @return {CanvasRenderingContext2D}
   */
  gk.prototype.canvasContext = function () {
    return this.context.getContext('2d');
  };

};
var rekapiCanvasActor = function (global) {
  var gk = global.Kapi;

  function CanvasActorMethods () {};
  CanvasActorMethods.prototype = gk.Actor.prototype;

  /**
   * @param {Object} opt_config
   * @constructor
   */
  gk.CanvasActor = function (opt_config) {
    gk.Actor.call(this, opt_config);
    return this;
  };

  gk.CanvasActor.prototype = new CanvasActorMethods();

  /**
   * @param {Object} opt_context
   * @return {Object}
   */
  gk.CanvasActor.prototype.context = function (opt_context) {
    if (opt_context) {
      this._context = opt_context;
    }

    return this._context && this._context.getContext('2d');
  };
};
var rekapiDOM = function (global, deps) {
  var gk = global.Kapi;
  var _ = (deps && deps.underscore) ? deps.underscore : global._;
  var transforms = [
    'transform'
    ,'webkitTransform'
    ,'MozTransform'
    ,'oTransform'
    ,'msTransform'];


  function setStyle (forElement, styleName, styleValue) {
    forElement.style[styleName] = styleValue;
  }


  /**
   * @param {HTMLElement} element
   * @constructor
   */
  gk.DOMActor = function (element) {
    gk.Actor.call(this);
    this._context = element;
    var className = this.getCSSName();

    // Add the class if it's not already there.
    // Using className instead of classList to make IE happy.
    if (!this._context.className.match(className)) {
      this._context.className += className;
    }

    // Remove the instance's render method to allow the
    // ActorMethods.prototype.render method to be accessible.
    delete this.render;

    return this;
  };


  function DOMActorMethods () {}
  DOMActorMethods.prototype = gk.Actor.prototype;
  gk.DOMActor.prototype = new DOMActorMethods();


  /**
   * @param {HTMLElement} context
   * @param {Object} state
   */
  DOMActorMethods.prototype.render = function (context, state) {

    _.each(state, function (styleValue, styleName) {
      if (styleName === 'transform') {
        _.each(transforms, function (transform) {
          setStyle(context, transform, styleValue);
        }, this);
      } else {
        setStyle(context, styleName, styleValue);
      }
    }, this);
  };


  /**
   * @return {string}
   */
  DOMActorMethods.prototype.getCSSName = function () {
    return 'actor-' + this.id;
  };

};
var rekapiToCSS = function (Rekapi, global, deps) {

  // CONSTANTS
  //
  var DEFAULT_GRANULARITY = 100;
  var TRANSFORM_TOKEN = 'TRANSFORM';
  var VENDOR_PREFIXES = Rekapi.util.VENDOR_PREFIXES = {
    'microsoft': '-ms-'
    ,'mozilla': '-moz-'
    ,'opera': '-o-'
    ,'w3': ''
    ,'webkit': '-webkit-'
  };
  var _ = (deps && deps.underscore) ? deps.underscore : global._;


  // TEMPLATES
  //

  /**
   * [0]: vendor
   * [1]: animation name
   * [2]: keyframes
   */
  var KEYFRAME_TEMPLATE = [
    '@%skeyframes %s-keyframes {'
    ,'%s'
    ,'}'
  ].join('\n');

  /**
   * [0] class name
   * [1] class attributes
   */
  var CLASS_BOILERPLATE = [
    '.%s {'
    ,'  position: absolute;'
    ,'%s'
    ,'}'
  ].join('\n');


  // PROTOTYPE EXTENSIONS
  //
  /**
   * @param {Object} opts
   */
  global.Kapi.prototype.toCSS = function (opts) {
    opts = opts || {};
    var animationCSS = [];
    var actorIds = this.getActorIds();

    _.each(actorIds, function (id) {
      animationCSS.push(this.getActor(id).toCSS(opts));
    }, this);

    return animationCSS.join('\n');
  };


  /**
   * @param {Object} opts
   */
  global.Kapi.Actor.prototype.toCSS = function (opts) {
    opts = opts || {};
    var actorCSS = [];
    var granularity = opts.granularity || DEFAULT_GRANULARITY;
    var actorClass = generateCSSClass(this, opts.vendors);
    actorCSS.push(actorClass);
    var keyframes = generateActorKeyframes(this, granularity);
    var boilerplatedKeyframes = applyVendorBoilerplates(
        keyframes, this.getCSSName(), opts.vendors);
    actorCSS.push(boilerplatedKeyframes);

    return actorCSS.join('\n');
  };


  // UTILITY FUNCTIONS
  //
  /**
   * @param {string} str
   */
  function isColorString (str) {
    return /rgb/.test(str);
  }


  /**
   * @param {Rekapi.Actor} actor
   */
  function serializeActorStep (actor) {
    var serializedProps = ['{'];
    var printVal;
    _.each(actor.get(), function (val, key) {
      printVal = val;
      var printKey = key;

      if (key === 'transform') {
        printKey = TRANSFORM_TOKEN;
      }

      serializedProps.push(printKey + ':' + printVal + ';');
    });

    serializedProps.push('}');
    return serializedProps.join('');
  };


  /**
   * @param {Rekapi.Actor} actor
   * @param {number} granularity
   * @return {string}
   */
  function generateActorKeyframes (actor, granularity) {
    var animLength = actor.getLength();
    var delay = actor.getStart();
    var serializedFrames = [];
    var percent, adjustedPercent, stepPrefix;
    var increment = animLength / granularity;
    var adjustedIncrement = Math.floor(increment);
    var animPercent = animLength / 100;
    var loopStart = delay + increment;
    var loopEnd = animLength + delay - increment;

    actor.calculatePosition(delay);
    serializedFrames.push('  from ' + serializeActorStep(actor));

    for (var i = loopStart; i <= loopEnd; i += increment) {
      actor.calculatePosition(i);
      percent = (i - delay) / animPercent;
      adjustedPercent = +percent.toFixed(2)
      stepPrefix = adjustedPercent + '% ';
      serializedFrames.push('  ' + stepPrefix + serializeActorStep(actor));
    }

    actor.calculatePosition(animLength + delay);
    serializedFrames.push('  to ' + serializeActorStep(actor));

    return serializedFrames.join('\n');
  }


  /**
   * @param {string} toKeyframes Generated keyframes to wrap in boilerplates
   * @param {string} animName
   * @param {[string]} opt_vendors Vendor boilerplates to be applied.  Should be
   *     any of the values in Rekapi.util.VENDOR_PREFIXES.
   * @return {string}
   */
  function applyVendorBoilerplates (toKeyframes, animName, opt_vendors) {
    opt_vendors = opt_vendors || ['w3'];
    var renderedKeyframes = [];

    _.each(opt_vendors, function (vendor) {
      var renderedChunk = printf(KEYFRAME_TEMPLATE,
          [VENDOR_PREFIXES[vendor], animName, toKeyframes]);
      var prefixedKeyframes =
        applyVendorPropertyPrefixes(renderedChunk, vendor);
      renderedKeyframes.push(prefixedKeyframes);
    });

    return renderedKeyframes.join('\n');
  }


  /**
   * @param {string} keyframes
   * @param {vendor} vendor
   * @return {string}
   */
  function applyVendorPropertyPrefixes (keyframes, vendor) {
    var transformRegExp = new RegExp(TRANSFORM_TOKEN, 'g');
    var prefixedTransformKey = VENDOR_PREFIXES[vendor] + 'transform';
    var prefixedKeyframes =
      keyframes.replace(transformRegExp, prefixedTransformKey);

    return prefixedKeyframes;
  }


  /**
   * @param {Rekapi.Actor} actor
   * @param {[string]} opt_vendors
   */
  function generateCSSClass (actor, opt_vendors) {
    opt_vendors = opt_vendors || ['w3'];
    var classAttrs = [];
    var vendorAttrs;

    _.each(opt_vendors, function (vendor) {
      vendorAttrs = generateCSSVendorAttributes(actor, vendor);
      classAttrs.push(vendorAttrs);
    });

    var boilerplatedClass = printf(CLASS_BOILERPLATE
        ,[actor.getCSSName(), classAttrs.join('\n')]);

    return boilerplatedClass;
  }


  /**
   * @param {Rekapi.Actor} actor
   * @param {string} vendor
   */
  function generateCSSVendorAttributes (actor, vendor) {
    var generatedAttributes = [];
    var prefix = VENDOR_PREFIXES[vendor];
    var start = actor.getStart();
    var duration = actor.getEnd() - start;

    var duration = printf('  %sanimation-duration: %sms;'
        ,[prefix, duration]);
    generatedAttributes.push(duration);

    var animationName = printf('  %sanimation-name: %s;'
        ,[prefix, actor.getCSSName() + '-keyframes']);
    generatedAttributes.push(animationName);

    var delay = printf('  %sanimation-delay: %sms;', [prefix, start]);
    generatedAttributes.push(delay);

    var fillMode = printf('  %sanimation-fill-mode: forwards;', [prefix]);
    generatedAttributes.push(fillMode);

    return generatedAttributes.join('\n');
  }


  /**
   * @param {string} formatter
   * @param {[string]} args
   * @return {string}
   */
  var printf = Rekapi.util.printf = function (formatter, args) {
    var composedStr = formatter;
    _.each(args, function (arg) {
      composedStr = composedStr.replace('%s', arg);
    });

    return composedStr;
  };

};
var rekapi = function (global, deps) {
  // If `deps` is defined, it means that Rekapi is loaded via AMD.
  // Don't use global context in this case so that the global scope
  // is not polluted by the Kapi object.
  var context = deps ? {} : global;

  rekapiCore(context, deps);
  rekapiActor(context, deps);
  rekapiKeyframeProperty(context, deps);

  // Extensions
  if (typeof rekapiDOM === 'function') {
    rekapiDOM(context, deps);
  }
  if (typeof rekapiToCSS === 'function') {
    rekapiToCSS(context.Kapi, context, deps);
  }
  if (typeof rekapiCanvasContext === 'function') {
    rekapiCanvasContext(context, deps);
  }
  if (typeof rekapiCanvasActor === 'function') {
    rekapiCanvasActor(context, deps);
  }

  return context.Kapi;
};


if (typeof define === 'function' && define.amd) {
  var underscoreAlreadyInUse = (typeof _ !== 'undefined');

  // Expose Rekapi as an AMD module if it's loaded with RequireJS or similar.
  // Shifty and Underscore are set as dependencies of this module.
  //
  // The rekapi module is anonymous so that it can be required with any name.
  // Example: define(['lib/rekapi.min'], function(Kapi) { ... });
  define(['shifty', 'underscore'], function (Tweenable, Underscore) {
    var underscoreSupportsAMD = (Underscore !== null)
        ,deps = {  Tweenable: Tweenable,
                  // Some versions of Underscore.js support AMD, others don't.
                  // If not, use the `_` global.
                  underscore: underscoreSupportsAMD ? Underscore : _ }
        ,Kapi = rekapi(global, deps);

    if (typeof KAPI_DEBUG !== 'undefined' && KAPI_DEBUG === true) {
      Kapi.underscore_version = deps.underscore.VERSION;
    }

    if (!underscoreAlreadyInUse) {
      // Prevent Underscore from polluting the global scope.
      // This global can be safely removed since Rekapi keeps its own reference
      // to Underscore via the `deps` object passed earlier as an argument.
      global._ = undefined;
    }

    return Kapi;
  });
} else {
  // Load Rekapi normally (creating a Kapi global) if not using an AMD loader.

  // Note: `global` is not defined when running unit tests. Pass `this` instead.
  rekapi(typeof global !== 'undefined' ? global : this);
}

} (this));
