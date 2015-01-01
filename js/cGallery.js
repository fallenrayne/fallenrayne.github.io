(function() {
  var BASE_STRIP_HEIGHT = 98;

  var THUMB_TEMPLATE = '<img data-large="{{large}}" src="{{thumb}}">';

  var SPINNER_OPTIONS = {
    lines: 12, length: 7, width: 4, radius: 10, color: '#ffffff',
    speed: 1, trail: 60, shadow: true
  };

  var IMAGES = [];

  var SCROLLBAR_HEIGHT_FUDGE = 0;

  $(document).ready(function() {
    var $body = $("body");
    var $doc = $(document);
    var $win = $(window);
    var $imageContainer = $(".current-image-container");
    var $image = $imageContainer.find(".current-image");
    var $middle = $(".middle");
    var $footer = $(".footer");
    var $strip = $(".strip");
    var spinnerContainer = $(".spinner-container")[0];
    var spinner = new Spinner(SPINNER_OPTIONS);
    var scrollbarSize = $.getScrollbarWidth();
    var hasScrollbar = false;
    var hasVerticalThumbs = false;
    var loadedThumbnails = 0;
    var currentImage, lastHash;
    var hashPollInterval;
    var embedded = (window.parent !== window);
    var disableHistory = /[&?](nohistory|n)=1/.test(window.location.search);
    var back;

    if (embedded) {
      $(window).on('message', function(event) {
        event = event.originalEvent || event;
        var data = event.data || { };
        switch (data.message) {
          case 'changeHash':
            if (data.options.hash !== getHashFromUrl().substring(1)) {
              render(parseHash(data.options.hash));
            }
            break;
          case 'next': moveBy(1); break;
          case 'prev': moveBy(-1); break;
        }
      });
    }

    function notifyHashChanged(options) {
      if (window.parent && window.parent.postMessage) {
        var hash = generateHash(options).substring(1);
        var msg = { message: 'hashChanged', options: { hash: hash } };
        window.parent.postMessage(msg, "*");
      }
    }

    function getHashFromUrl() {
      /* some browsers decode the hash, we don't want that */
      return "#" + (window.location.href.split("#")[1] || "");
    }

    function parseHash(hash) {
      var result = { };

      hash = hash || getHashFromUrl();

      if (hash) {
        if (hash.charAt(0) === '#') {
          hash = hash.substring(1);
        }

        var parts = hash.split("+");
        for (var i = 0; i < parts.length; i++) {
          var keyValue = parts[i].split(":");

          if (keyValue.length === 1) {
            result.i = decodeURIComponent(keyValue[0]);
          }
          else if (keyValue.length === 2) {
            result[keyValue[0]] = decodeURIComponent(keyValue[1]);
          }
        }
      }

      return result;
    }

    function pollHash() {
      /* don't poll the hash when we're embedded -- let the outer container
      control the url stack. we send events via postMessage elsewhere when
      the selected image changes. */
      if (!embedded && !hashPollInterval) {
        hashPollInterval = setInterval(function() {
          if (getHashFromUrl() !== lastHash) {
            render();
          }
        }, 250);
      }
    }

    function generateHash(options) {
      options = options || { };
      var image = options.image || $image.attr("src");
      var background = options.background || $("body").css("background-color");
      var result = "#" + encodeURIComponent(image);

      if (background) {
        result += "+b:" + encodeURIComponent(background.replace(/, /g, ","));
      }

      return result;
    }

    function writeHash(options) {
      /* don't write the hash when embedded, otherwise history information
      will seep up into the outer container and mess with back behavior.
      we will notify the outer container via postMessage instead */
      if (embedded) {
        return;
      }

      var hash = generateHash(options);
      var replace = disableHistory;

      /* if there's no hash in the url yet, then don't maintain it in the
      back stack. only remember the first actual image selected */
      if (getHashFromUrl() === "#") {
        replace = true;
      }

      if (hash !== getHashFromUrl() || hash !== lastHash) {
        if (replace) {
          var href = location.href.replace(/(javascript:|#).*$/, '');
          location.replace(href + hash);
        }
        else {
          window.location.hash = lastHash = hash;
        }

        lastHash = hash;
      }
    }

    function findThumbnailForImage(filename) {
      var thumbnails = $(".strip img");

      for (var i = 0; i < thumbnails.length; i++) {
        var $thumbnail = thumbnails.eq(i);
        if ($thumbnail.attr("data-large") === filename) {
          return $thumbnail;
        }
      }

      return { addClass: function() { /* just to be safe */ } };
    }

    function setImage(filename) {
      if ($image.attr("src") === filename) {
        return false;
      }

      setLoading(true);
      $image.attr("src", "");
      currentImage = filename;

      setTimeout(function() {
        $image.attr("src", filename);
      });

      $(".strip img").removeClass("active");
      findThumbnailForImage(filename).addClass("active");
      updateScrollLeft();

      writeHash({image: filename});
      notifyHashChanged({image: filename});
    }

    function checkForScrollbar() {
      var sb = $strip[0].scrollWidth > $strip[0].clientWidth;

      if (!scrollbarSize) {
        scrollbarSize = $.getScrollbarWidth();
      }

      if (sb !== hasScrollbar) {
        var height = BASE_STRIP_HEIGHT + (sb ? scrollbarSize : 0);
        $footer.css("height", height);
        $middle.css("bottom", height + 20);
        hasScrollbar = sb;
      }
    }

    function thumbnailLoaded(event) {
      checkForScrollbar();

      /* once all the thumbnails have loaded, make sure the selected image
      is scrolled into view */
      if (++loadedThumbnails >= IMAGES.length) {
        updateScrollLeft();
      }
    }

    function updateScrollLeft(options) {
      options = options || { };
      var $active = $strip.find("img.active");

      if ($active.length === 1) {
        var offset = ($footer.width() / 2) - ($active.width() / 2);
        var current = $footer.scrollLeft();
        var pos = (current + $active.eq(0).position().left) - offset;

        $footer.stop(true); /* stops current animations */

        if (options.animate === false) {
          $footer.scrollLeft(pos);
        }
        else {
          $footer.animate({scrollLeft: pos}, 250);
        }
      }
    }

    function dimensionsChanged() {
      checkForScrollbar();
      updateScrollLeft({animate: false});
    }

    function createThumbnail(filename) {
      return $(THUMB_TEMPLATE
        .replace("{{large}}", filename)
        .replace("{{thumb}}", ".thumbs/" + filename)
      );
    }

    function setLoading(loading) {
      loading = (loading === undefined) ? true : loading;

      if (loading) {
        $body.addClass("loading");

        if (!spinner.spinning) {
          spinner.spin(spinnerContainer);
          spinner.spinning = true;
        }
      }
      else {
        $body.removeClass("loading");

        if (spinner.spinning) {
          spinner.stop();
          spinner.spinning = false;
        }
      }
    }

    function thumbnailClicked(event) {
      $image.css({"visibility": "hidden"});
      if (!setImage($(event.target).attr("data-large"))) {
        $image.css({"visibility": "visible"}); /* gross but cheap */
      }
    }

    function imageLoaded(event) {
      setLoading(false);
      dimensionsChanged(event);
    }

    function imageClicked(event) {
      window.open($image.attr("src"));
    }

    function colorButtonClicked(event) {
      var bg = $(event.target).attr("data-bg");

      if (bg) {
        $('body').css("background-color", bg);
        writeHash();
        notifyHashChanged();
      }
    }

    function moveBy(offset) {
      var thumbnails = $(".strip img");
      var current = 0;

      for (var i = 0; i < thumbnails.length; i++) {
        if (thumbnails.eq(i).hasClass('active')) {
          current = i;
          break;
        }
      }

      /* wrap around */
      var newIndex = current + offset;
      if (newIndex >= thumbnails.length) {
        newIndex = 0;
      }
      else if (newIndex < 0) {
        newIndex = thumbnails.length - 1;
      }

      setImage(IMAGES[newIndex]);
    }

    function previous() {
      moveBy(-1);
    }

    function next() {
      moveBy(1);
    }

    function updateTitle() {
      var parts = window.location.pathname.split("/");

      /* last part will be empty due to trailing slash in url */
      document.title = "photos - " + parts[parts.length - 2].replace(/_/g, " ");
    }

    function render(params) {
      if (IMAGES.length === 0) {
        $body.addClass('no-images');
      }
      else {
        params = params || parseHash();

        var image = params.i;
        if (!image || IMAGES.indexOf(image) === -1) {
          image = IMAGES[0];
        }

        if (params.b) {
          $body.css("background-color", params.b);
        }

        updateTitle();

        setTimeout(function() {
          setImage(image);
          writeHash({image: image});
          pollHash();
        }, 250);
      }
    }

    function keyPressed(event) {
      if (event.altKey || event.metaKey) {
        return true; /* don't swallow browser back/forward shortcuts */
      }

      if (event.keyCode === 39) { /* right arrow */
        moveBy(1);
      }
      else if (event.keyCode === 37) { /*left arrow */
        moveBy(-1);
      }
      else if (embedded && event.keyCode === 38) { /* up */
        window.parent.postMessage({ message: 'prevAlbum' }, "*");
      }
      else if (embedded && event.keyCode === 40) { /* down */
        window.parent.postMessage({ message: 'nextAlbum' }, "*");
      }
    }

    function main(images) {
      if (!images || images.length === 0) {
        return;
      } else {
        IMAGES = images;
      }

      if ($.browser.chrome) {
          SCROLLBAR_HEIGHT_FUDGE = -4; /* todo: why is this necessary for chrome? */
      }

      var i;

      /* initialize the color picker */
      var colorButtons = $(".color-picker .color-button");
      for (i = 0; i < colorButtons.length; i++) {
        var $button = $(colorButtons[i]);
        var bg = $button.attr("data-bg");

        if (bg) {
          $button.css({"background-color": bg});
        }
      }

      /* add thumbnails to the strip */
      for (i = 0; i < IMAGES.length; i++) {
        $strip.append(createThumbnail(IMAGES[i]));
      }

      /* register events */
      $image.on("load", imageLoaded);
      $image.on("click", imageClicked);
      $win.on("resize", dimensionsChanged);
      $doc.on("click", ".strip img", thumbnailClicked);
      $doc.on("click", ".color-picker .color-button", colorButtonClicked);
      $doc.on("click", ".button.prev", previous);
      $doc.on("click", ".button.next", next);
      $body.on("keydown", keyPressed);
      $(".strip img").on("load", thumbnailLoaded);
      $('img').on('dragstart', function(event) { event.preventDefault(); });

      if (!embedded) {
        $body.addClass('project-link');
      }

      render();
    }

    window.cGallery = {
      main: main,
      previous: previous,
      next: next
    };
  });
}());
