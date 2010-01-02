//
// oauth.js
//
//   Copyright (C) 2004-2009 Kazuki Tsujimoto, All rights reserved.
//
//   Redistribution and use in source and binary forms, with or without
//   modification, are permitted provided that the following conditions
//   are met:
//
//   1. Redistributions of source code must retain the above copyright
//      notice, this list of conditions and the following disclaimer.
//
//   2. Redistributions in binary form must reproduce the above copyright
//      notice, this list of conditions and the following disclaimer in the
//      documentation and/or other materials provided with the distribution.
//
//   3. Neither the name of the authors nor the names of its contributors
//      may be used to endorse or promote products derived from this
//      software without specific prior written permission.
//
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
//   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
//   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
//   A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
//   OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//   SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
//   TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
//   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
//   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
//   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
//   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

function OAuthSourceObject(obj, options) {
  this.obj = obj;
  this.options = options;
}
OAuthSourceObject.prototype = {
  getConsumerKey: function getConsumerKey() { return this.obj.oauth_consumer_key; },
  getConsumerSecret: function getConsumerSecret() { return this.obj.oauth_consumer_secret; },
  getRequestToken: function getRequestToken() { throw new Error("getRequestToken: not implemented"); },
  getRequestSecret: function getRequestSecret() { throw new Error("getRequestSecret: not implemented"); },
  getPin: function getPin() { throw new Error("getPin: not implemented"); },
  getAccessToken: function getAccessToken() { return this.obj.oauth_access_token; },
  getAccessSecret: function getAccessSecret() { return this.obj.oauth_access_secret; },
  clear: function clear() { throw new Error("clear: not implemented"); }
}


function OAuthSourceForm(options) {
  this.options = options;
}
OAuthSourceForm.prototype = {
  getConsumerKey: function getConsumerKey() {
    return $("#consumer_key").attr("value");
  },
  getConsumerSecret: function getConsumerSecret() {
    return $("#consumer_secret").attr("value");
  },
  getRequestToken: function getRequestToken() {
    return this._getFieldValue("request_token", "oauth_token");
  },
  getRequestSecret: function getRequestSecret() {
    return this._getFieldValue("request_token", "oauth_token_secret");
  },
  getPin: function getRequestSecret() {
    return $("#pin").attr("value");
  },
  getAccessToken: function getAccessToken() {
    return this._getFieldValue("access_token", "oauth_token");
  },
  getAccessSecret: function getAccessSecret() {
    return this._getFieldValue("access_token", "oauth_token_secret");
  },
  clear: function clear() {
    $("#consumer_key").attr("value", "");
    $("#consumer_secret").attr("value", "");
    $("#request_token").attr("value", "");
    $("#access_token").attr("value", "");
  },

  _getFieldValue: function _getFieldValue(field_id, name) {
    var value = $("#" + field_id).attr("value");
    var r = null;
    $.each(value.split("&"), function () {
      var ary = this.split(/=/);
      if (ary[0] == name) {
        r = ary[1];
      }
    });
    if (r == null) {
      throw new Error("no such value:" + name);
    }
    return r;
  }
}


function OAuth(source, options) {
  this.source = source;
  this.options = options;
};
OAuth.prototype = {
  getSource: function getSource() {
    return this.source;
  },

  isEnabled: function isEnabled() {
    var key = this.source.getConsumerKey();
    return typeof key == "string" && key.length > 0;
  },

  jsonp: function jsonp(url, params, callback) {
    var jsonp_callback_name = "jsonp" + this._getNonce();
    var signed_params = this._signRequest("GET", url, $.extend({}, params, {callback: jsonp_callback_name}));

    // from jquery.js
    window[ jsonp_callback_name ] = function(data){
      callback(data);
      window[ jsonp_callback_name ] = undefined;
      try{ delete window[ jsonp_callback_name ]; } catch(e){}
      if ( head )
          head.removeChild( script );
    };
    var head = document.getElementsByTagName("head")[0];
    var script = document.createElement("script");
    script.src = url + "?" + $.param(signed_params);
    head.appendChild(script);
  },

  xpost: function xpost(url, params, callback) {
    var xpost_frame_name = 'xpostframe' + this._getNonce();
    var signed_params = this._signRequest("POST", url, params);

    var iframe = $('<iframe>').attr('name', xpost_frame_name).hide().appendTo('body');
    var form = $('<form method="POST" />').attr('action', url).attr('target', xpost_frame_name).hide();
    iframe.load(function () {
      form.remove();
      iframe.remove();
      callback();
    });
    for (var i in signed_params) {
      form.append($('<input type="hidden">').attr("name", i).attr("value", signed_params[i]));
    }
    form.appendTo('body');
    form.submit();
  },

  ////////////////////////////////////////////////////////////////
  getRequestToken: function getRequestToken() {
    var url = this.options.request_token_url;
    var signed_params = this._signRequest("GET", url, {
      oauth_token: null
    }, [this.source.getConsumerSecret(), ""]);
    var method = "GET";
    window.open(url + "?" + $.param(signed_params));
  },

  authorizeToken: function authorizeToken() {
    window.open(this.options.authorize_url + "?oauth_token=" + this.source.getRequestToken())
  },

  getAccessToken: function getAccessToken() {
    var url = this.options.access_token_url;
    var signed_params = this._signRequest("GET", url, {
      oauth_token: this.source.getRequestToken(),
      oauth_verifier: this.source.getPin()
    }, [this.source.getConsumerSecret, this.source.getRequestSecret()]);
    window.open(url + "?" + $.param(signed_params));
  },

  ////////////////////////////////////////////////////////////////
  _signRequest: function _signRequest(method, url, params, signature_key_seed) {
    var params_with_oauth_keys = $.extend({}, {
      oauth_consumer_key: this.source.getConsumerKey(),
      oauth_nonce: this._getNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp:  Math.floor(new Date().getTime() / 1000),
      oauth_token: params.oauth_token ? params.oauth_token : (params.oauth_token === null) ? null : this.source.getAccessToken(),
      oauth_version: "1.0"
    }, params);
    for (var i in params_with_oauth_keys) {
      if (params_with_oauth_keys[i] == null) {
        delete params_with_oauth_keys[i];
      }
    }
    signature_key_seed = signature_key_seed ?
                           signature_key_seed :
                           [this.source.getConsumerSecret(), this.source.getAccessSecret()];
    var normalized_params = this._normalizeRequestParams(params_with_oauth_keys);
    var signature_key = $.map(signature_key_seed, encodeURIComponent).join('&');
    var signature = b64_hmac_sha1(signature_key, this._getSignatureBaseString(method, url, normalized_params));
    return $.extend(params_with_oauth_keys, {oauth_signature: signature});
  },

  _normalizeRequestParams: function _normalizeRequestParams(params) {
    return $.map(this._objectToArray(params).sort(function(a,b) { return (a[0] < b[0]) ? -1 : 1; }),
                 function(i) { return encodeURIComponent(i[0]) + "=" + encodeURIComponent(i[1]); }).join("&")
  },

  _getSignatureBaseString: function _getSignatureBaseString(method, url, normalized_request_params) {
    return $.map([method, url, normalized_request_params],
                 encodeURIComponent).join("&");
  },

  _objectToArray: function _objectToArray(obj) {
    var ary = [];
    for (var i in obj) {
      ary.push([i, obj[i]]);
    }
    return ary;
  },

  _getNonce: (function(){
    var i = 0;
    return function _getNonce() {
      return (new Date().getTime()) + "" + i++;
    }
  })()
};
