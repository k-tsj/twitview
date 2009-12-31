// from http://e-scapego.at/2009/09/jquery-xpost/

$.extend({
  xpost : function(url, callback) {
    var name = 'dummyxpostframe';
    var flush = function() {
      $('form[target=' + name + ']').remove();
      $('iframe[name=' + name + ']').remove();
    }
    var iframe = $('<iframe />').attr('name', name).hide().appendTo('body');
    if(typeof callback == 'function') {
      iframe.load(function () {
        flush();
        callback();
      });
    } else {
      iframe.load(flush);
    }
    $('<form method="POST" />').attr('action', url).attr('target', name)
    .hide().appendTo('body').submit();
  }
});
