define(function() {
    "use strict";

    var Offset = function() {
        this.values = [];
    };

    Offset.prototype.update = function(remoteTime) {
        this.values.push((new Date()).getTime() - remoteTime.getTime());
    };

    Offset.prototype.localTime = function() {
        if (this.values.length) {
          return new Date((new Date()).getTime() + this.values.reduce(
              function(a, b) { return a + b; }) / this.values.length);
        } else {
          return new Date();
        }
    };

    return {
        offset: new Offset()
    };

});
