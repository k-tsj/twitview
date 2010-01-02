//
// main.js
//
//   Copyright (C) 2004-2010 Kazuki Tsujimoto, All rights reserved.
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

// see sha1.js for details
b64pad = "=";

$(document).ready(function(){
  var gDebug = false;

  if (window.openDatabase) {

    ////////////////////////////////////////////////////////////////
    // Global Variables
    var gDb = window.openDatabase("twitview", "1.0", "Twitview Main DB");
    var gDbScheams = [
      "statuses (" +
        "id INTEGER PRIMARY KEY," +
        "screen_name STRING," +
        "profile_image_url STRING," +
        "created_at DATETIME," +
        "text TEXT," +
        "readp BOOLEAN DEFAULT 'f'," +
        "markedp BOOLEAN DEFAULT 'f'" +
      ")",
      "settings (" +
        "key STRING PRIMARY KEY," +
        "value STRING" +
      ")"
    ];

    var gDbImg = window.openDatabase("twitviewimg", "1.0", "Twitview Image DB");
    var gDbImgSchemas = [
      "images (" +
        "uri STRING PRIMARY KEY," +
        "data STRING," +
        "ctime INTEGER" +
      ")"
    ];

    var gMarkedActions = {
      "Mark As Favorites": function markAsFavorites(statuses, callback) {
        if (statuses.length > 0) {
          var s = statuses[0];
          var post_url = "http://twitter.com/favorites/create/" + s.id + ".xml";
          var xpost_handler = gOAuth.isEnabled() ?
                                function(url, params, callback) {
                                  if (gDebug) console.log("start xpost(OAuth)");
                                  gOAuth.xpost(url, params, callback);
                                } :
                                function(url, _, callback) {
                                  if (gDebug) console.log("start xpost(BASIC)");
                                  $.xpost(url, callback);
                                };
          xpost_handler(post_url, {}, function () {
            if (gDebug) console.log("post succeeded: " + post_url);
            callback(s);
            markAsFavorites(statuses.slice(1), callback);
          });
        }
      },
      "Send By Mail": function sendByMail(statuses, callback) {
        location.href =
            "mailto:?subject=Twitview&body=" +
                encodeURIComponent(
                  $.map(statuses,
                        function (i) {
                          return formatStatusHeader(i) + "<br>" + i.text;
                        }).join("<hr>"));
        $.each(statuses, function () { callback(this) });
      }
    }

    var gSettings = {
      statuses_per_page: 20,
      action: "Mark As Favorites",
      oauth_consumer_key: "",
      oauth_consumer_secret: "",
      oauth_access_token: "",
      oauth_access_secret: ""
    };

    const OAUTH_OPTS = {
      request_token_url: "http://twitter.com/oauth/request_token",
      access_token_url: "http://twitter.com/oauth/access_token",
      authorize_url: "http://twitter.com/oauth/authorize"
    };
    var gOAuth = new OAuth(new OAuthSourceObject({}), OAUTH_OPTS);
    var gOAuthForSettings = new OAuth(new OAuthSourceForm(), OAUTH_OPTS);

    ////////////////////////////////////////////////////////////////
    // Statueses

    const TIMELINE_URL_PREFIX = "http://twitter.com/statuses/friends_timeline.json";
    const IMAGE_URL_PREFIX = "http://www.callcc.net/iphone/twitview/misc/dataschema.rb?callback=?&uri=";

    // twitter.com  -[fetchStatuses]-> gDb -[redraw]-> display
    //                                                     - <-[ajax]- gDbImg <-[fetchImgData]- www.callcc.net <- *.twimg.com
    //                                                     - set readp flag(scroll or push next button)
    //                                                     - set markedp flag(tap)
    function fetchStatuses(callback) {
      var since_id;
      gDb.transaction(function (tx) {
        tx.executeSql("SELECT max(id) FROM statuses", [], function (tx, rs) {
          since_id = rs.rows.item(0)["max(id)"];
          if (since_id == null) since_id = 1;
        });
      }, throwError, function () {
        function _fetchStatuses(n, prevResult) {
          var params = createRequestParamsByPrevResult(prevResult);
          // null params means there are no statuses to fetch
          if (n > 0 && params != null) {
            var jsonp_handler = gOAuth.isEnabled() ?
                                  function (url, params, callback) {
                                    if (gDebug) console.log("start jsonp(OAuth)");
                                    gOAuth.jsonp(url, params, callback);
                                  } :
                                  function (url, params, callback) {
                                    if (gDebug) console.log("start jsonp(BASIC)");
                                    $.ajax({
                                      type: "GET",
                                      url: url + "?callback=?&" + jQuery.param(params),
                                      data: null,
                                      success: callback,
                                      error: function(_, _, e) { throw e; },
                                      dataType: "json"
                                    });
                                  };
            jsonp_handler(TIMELINE_URL_PREFIX, params, function (statuses) {
              insertStatuses(
                statuses,
                function () { _fetchStatuses(n - 1, statuses); }
              );
            });
          } else {
            callback();
          }
        }
        function insertStatuses(statuses, callback) {
          gDb.transaction(function (tx) {
            for (var i = 0; i < statuses.length; i++) {
              var status = statuses[i];
              tx.executeSql("INSERT OR IGNORE INTO statuses" +
                            "(id, screen_name, profile_image_url, created_at, text)" +
                            "VALUES (?, ?, ?, ?, ?)",
                            [status.id, status.user.screen_name, status.user.profile_image_url,
                             status.created_at, status.text]);
            }
          }, throwError, callback);
        }
        function createRequestParamsByPrevResult(prevResult) {
          var params = {
            count: 200, // 0 < count <= 200
            since_id: since_id
          };
          if (!prevResult) return params;
          if (prevResult.length == 0) return null;
          params.max_id = prevResult[prevResult.length - 1].id - 1;
          return params;
        }

        _fetchStatuses(3);
      });
    }

    function redrawStatuses(error_callback, success_callback) {
      function updateHeader() {
        gDb.transaction(function (tx) {
          tx.executeSql("SELECT count(id) FROM statuses WHERE readp = 'f'", [], function (tx, rs) {
            var unread_count = rs.rows.item(0)["count(id)"];
            $("#header").text("Twitview" + ((unread_count == null) ? "" : "(" + unread_count + ")"));
          });
        });
      }
      function updateBody() {
        gDb.transaction(function (tx) {
          tx.executeSql("SELECT * FROM statuses WHERE readp = 'f' ORDER BY id LIMIT ?",
                        [gSettings.statuses_per_page], function (tx, rs) {
            $("#tweet").empty();
            var profile_image_urls = {};
            for (var i = 0; i < rs.rows.length; i++) {
              var status = rs.rows.item(i);
              profile_image_urls[status.profile_image_url] = true;
              $("#tweet").append(
                $("<li>").attr("id", status.id).append(
                  $("<div>").append(
                    $("<img>").addClass(getClassNameByURI(status.profile_image_url)),
                    $("<span>").addClass("status_header").text(formatStatusHeader(status))),
                  $("<div>").append(
                    $("<span>").text(htmlUnescape(status.text)))
                  ).click(function () {
                    var self = this;
                    var marked = ! ($(self).attr("class").match(/marked/) == null);
                    gDb.transaction(function (tx) {
                      tx.executeSql("UPDATE statuses SET markedp = ? WHERE id = ?",
                                    [!marked ? "t" : "f", self.id],
                                    function () {
                                      if (gDebug) console.log("mark:" + self.id + " " + ! marked);
                                    }, throwError);
                    }, throwError, function () { $(self).toggleClass("marked") })})
                );
            }
            for (var i in profile_image_urls) {
              (function (i) {
                fetchImgData(i, function (data) {
                  $("#tweet img")
                      .filter(function () { return $(this).attr("class") == getClassNameByURI(i) })
                      .attr("src", data);
                })})(i);
            }
          });
        }, error_callback ? error_callback : function () {}, success_callback ? success_callback : function () {});
      }

      deleteReadStatuses();
      updateHeader();
      updateBody();
    }

    function invokeMarkedAction() {
      gDb.transaction(function(tx) {
        tx.executeSql("SELECT * FROM statuses WHERE markedp = 't'", [], function (tx, rs) {
          if (rs.rows.length > 0) {
            gMarkedActions[gSettings.action](
              $.map(new Array(rs.rows.length), function (_, i) { return rs.rows.item(i) }),
              function(i) {
                forceDeleteStatus(i.id, function () {
                  if (gDebug) console.log("force delete: " + i.id);
                });
              }
            );
          }
        });
      });
    }

    function markStatusesAsRead(max_id, callback) {
      gDb.transaction(function (tx) {
        if (max_id != null) {
          tx.executeSql("UPDATE statuses SET readp = 't' WHERE id <= ?", [max_id]);
        }
      }, throwError, callback);
    }

    // marked statuses will not be deleted by this function.
    function deleteReadStatuses(callback) {
      gDb.transaction(function (tx) {
        tx.executeSql("DELETE FROM statuses" +
                      "  WHERE readp = 't' AND" +
                      "        markedp = 'f' AND" +
                      "        NOT id = (SELECT max(id) FROM statuses)");
      }, throwError, callback ? callback : function () {});
    }

    // delete a status even though it is marked
    function forceDeleteStatus(id, callback) {
      gDb.transaction(function (tx) {
        tx.executeSql("DELETE FROM statuses WHERE id = ?", [id]);
      }, throwError, callback);
    }

    //
    // profile images
    //
    function fetchImgData(uri, callback) {
      fetchImgDataFromCache(uri, function (data) {
        if (data != null) {
          callback(data);
        } else {
          fetchImgDataFromNet(uri, function (data) {
            gDbImg.transaction(function (tx) {
              tx.executeSql("INSERT OR IGNORE INTO images (uri, data, ctime) VALUES (?, ?, ?)",
                            [uri, data, new Date().getTime()]);
            }, throwError);
            callback(data);
          });
        }
      });
    }

    function fetchImgDataFromCache(uri, callback) {
      var data = null;
      gDbImg.transaction(function (tx) {
        tx.executeSql("SELECT data FROM images WHERE uri = ?", [uri], function (tx, rs) {
          if (rs.rows.length == 1) {
            data = rs.rows.item(0)["data"];
          }
        });
      }, throwError, function () { callback(data) });
    }

    function fetchImgDataFromNet(uri, callback) {
      $.getJSON(IMAGE_URL_PREFIX + encodeURIComponent(uri), callback);
    }

    //
    // misc
    //

    function formatStatusHeader(status) {
      return status.screen_name + " - " + formatDate(new Date(status.created_at));
    }

    ////////////////////////////////////////////////////////////////
    // Settings
    function loadSettings(error_callback, success_callback) {
      var settings = {};
      gDb.transaction(function (tx) {
        tx.executeSql("SELECT * FROM settings", [], function (tx, rs) {
          for (var i = 0; i < rs.rows.length; i++) {
            var item = rs.rows.item(i);
            settings[item["key"]] = "" + item["value"];
          }
        });
      }, error_callback, function () {
        if (validateSettings(settings)) {
          gSettings = settings;
          success_callback();
        } else {
          error_callback(new Error("invalid settings"));
        }
      });
    }

    function saveSettings(settings, error_callback, success_callback) {
      if (validateSettings(settings)) {
        gDb.transaction(function (tx) {
          for (var key in settings) {
            tx.executeSql("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                          [key, settings[key]]);
          }
        }, error_callback, function () {
          gSettings = settings;
          success_callback();
        });
      } else {
        error_callback(new Error("invalid settings"));
      }
    }

    function validateSettings(settings) {
      function isNotEmpty(i) { return i && i.length > 0; }
      function allowAll() { return true; }
      var validation_template = {
        statuses_per_page: function (i) { return i.match(/^\d+$/); },
        action: isNotEmpty,
        oauth_consumer_key: allowAll,
        oauth_consumer_secret: allowAll,
        oauth_access_token: allowAll,
        oauth_access_secret: allowAll
      }
      for (var i in validation_template) {
        if (! (typeof settings[i] == "string" && validation_template[i] && validation_template[i](settings[i]))) {
          if (gDebug) console.log("failed to validate:" + i);
          return false;
        }
      }
      return true;
    }

    ////////////////////////////////////////////////////////////////
    // Utilities
    function htmlEscape(str) {
      return $("<div>").text(str).html();
    }

    function htmlUnescape(str) {
      return $("<div>").html(str).text();
    }

    function getClassNameByURI(uri) {
      return htmlEscape(uri);
    }

    function throwError(e) { throw e; }

    function formatDate(date) {
      function withZeroPadding(i) {
        return Math.floor(i / 10) + "" + i % 10;
      }
      return withZeroPadding(date.getMonth() + 1) + "/" + withZeroPadding(date.getDate()) + " " +
             withZeroPadding(date.getHours()) + ":" + withZeroPadding(date.getMinutes());
    }

    ////////////////////////////////////////////////////////////////
    // Event Handlers

    //
    // home
    //
    $("#settingsButton").tap(function () {
      var attrs = ["statuses_per_page",
                   "oauth_consumer_key", "oauth_consumer_secret",
                   "oauth_access_token", "oauth_access_secret"];
      for (var i = 0; i < attrs.length; i++ ) {
        $("#settings_" + attrs[i]).attr("value", gSettings[attrs[i]]);
      }
      $("#settings_action").empty();
      $.each(gMarkedActions, function (key) {
        $("#settings_action").append($("<option>").attr("value", key).text(key));
        $("#settings_action option[value=" + gSettings.action + "]").attr("selected", "selected");
      });
    });

    $("#syncButton").click(function (){
      invokeMarkedAction();
      fetchStatuses(redrawStatuses);
    });

    $("#nextButton").click(function () {
      function redrawStatusesAndScrollToTop() {
        redrawStatuses(throwError, function () { window.scrollTo(0,0);});
      }
      var last_status = $("#tweet > li:last-child").get(0);
      var last_id = (last_status) ? last_status.id : null;
      if (last_id != null) {
        markStatusesAsRead(last_id, redrawStatusesAndScrollToTop);
      } else {
        redrawStatusesAndScrollToTop();
      }
    });

    $(window).scroll(function (){
      setTimeout(function (){
        if (location.hash == "#home") {
          var w = $(window);
          var window_bottom_y = w.scrollTop() + w.height();
          var status_elements = $("#tweet > li");
          for (var i = status_elements.length - 1; i >=0; i--) {
            var element = $(status_elements[i]);
            var element_bottom_y = element.offset().top + element.height();
            if (element_bottom_y < window_bottom_y) {
              markStatusesAsRead(element[0].id, function () { if (gDebug) element.addClass("read") });
              break;
            }
          }
        }
      }, 500);
    });

    //
    // settings
    //
    $("#settingsForm").submit(function () {
      var settings = {
        statuses_per_page: $("#settings_statuses_per_page").attr("value"),
        action: $("#settings_action option:selected").attr("value"),
        oauth_consumer_key: $("#settings_oauth_consumer_key").attr("value"),
        oauth_consumer_secret: $("#settings_oauth_consumer_secret").attr("value"),
        oauth_access_token: $("#settings_oauth_access_token").attr("value"),
        oauth_access_secret: $("#settings_oauth_access_secret").attr("value")
      }
      saveSettings(settings, function(e) {
        alert(e);
      }, function () {
        gOAuth = new OAuth(new OAuthSourceObject(gSettings));
        redrawStatuses();
        jQT.goBack("#home");
      });
      return false;
    });

    $("#settingsOauthSettingsButton").tap(function () {
      gOAuthForSettings.getSource().clear();
    });

    $("#settingsDropButton").click(function () {
      if (confirm("Drop table?")) {
        gDb.transaction(function (tx) {
          tx.executeSql("DROP TABLE statuses");
          if (confirm("Also drop settings?")) {
            tx.executeSql("DROP TABLE settings");
          }
        });
        gDbImg.transaction(function (tx) {
          tx.executeSql("DROP TABLE images");
        });
      }
    });

    $("#settingsOkButton").click(function () {
      $("#settingsForm").submit();
    });

    //
    // oauth
    //
    $("#oauthRequestTokenButton").click(function () {
      gOAuthForSettings.getRequestToken();
    });

    $("#oauthAuthorizeTokenButton").click(function () {
      gOAuthForSettings.authorizeToken();
    });

    $("#oauthAccessTokenButton").click(function () {
      gOAuthForSettings.getAccessToken();
    });

    $("#oauthOkButton").click(function () {
      var os = gOAuthForSettings.getSource();
      $("#settings_oauth_consumer_key").attr("value", os.getConsumerKey());
      $("#settings_oauth_consumer_secret").attr("value", os.getConsumerSecret());
      $("#settings_oauth_access_token").attr("value", os.getAccessToken());
      $("#settings_oauth_access_secret").attr("value", os.getAccessSecret());
      jQT.goBack("#settings");
    });

    $("#oauthResetButton").click(function () {
      $("#settings_oauth_consumer_key").attr("value", "");
      $("#settings_oauth_consumer_secret").attr("value", "");
      $("#settings_oauth_access_token").attr("value", "");
      $("#settings_oauth_access_secret").attr("value", "");
      jQT.goBack("#settings");
    });

    ////////////////////////////////////////////////////////////////
    // Main
    gDb.transaction(function (tx) {
      for (var i = 0; i < gDbScheams.length; i++ ) {
        tx.executeSql("CREATE TABLE IF NOT EXISTS " + gDbScheams[i]);
      }
    }, function () { alert("failed to create table") }, function () {
      loadSettings(function (e) {
        $("#settingsButton").tap();
        $("#home").append(
          $("<div>")
            .addClass("info")
            .html("Hint: <br>" +
                  "Tap a status to mark it.<br>" +
                  "If you face troubles, try to drop tables."));
      }, function () {
        gOAuth = new OAuth(new OAuthSourceObject(gSettings));
        redrawStatuses();
      });
    });

    gDbImg.transaction(function (tx) {
      for (var i = 0; i < gDbImgSchemas.length; i++ ) {
        tx.executeSql("CREATE TABLE IF NOT EXISTS " + gDbImgSchemas[i]);
      }
    }, function () { alert("failed to create table") });
  }
});
