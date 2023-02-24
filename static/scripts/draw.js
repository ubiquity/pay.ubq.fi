(function draw() {
  var Cell = function Cell(settings) {
    var keys = Object.keys(settings),
      x = keys.length;
    while (x--) this[keys[x]] = settings[keys[x]];
    return this;
  };
  var render = {
    point: function (cell, target, settings) {
      target.fillStyle = ["rgba(", settings.red, ",", settings.green, ",", settings.blue, ",", 1, ")"].join("");
      target.fillRect(settings.cell_resolution * cell.x, settings.cell_resolution * cell.y, settings.point_resolution, settings.point_resolution);
    },
    fill: function (cell, target, settings) {
      var darker_red = Math.ceil(settings.red / 16);
      var darker_green = Math.ceil(settings.green / 16);
      var darker_blue = Math.ceil(settings.blue / 16);
      target.fillStyle = ["rgba(", darker_red, ",", darker_green, ",", darker_blue, ",", cell.opacity, ")"].join("");
      target.fillRect(settings.cell_resolution * cell.x, settings.cell_resolution * cell.y, settings.cell_resolution, settings.cell_resolution);
    },
    border: function (cell, target, settings) {
      var ss = ["rgba(", settings.red, ",", settings.green, ",", settings.blue, ", ", 1 / 16, ")"].join("");
      target.lineWidth = 0.5;
      target.strokeStyle = ss;
      target.strokeRect(settings.cell_resolution * cell.x, settings.cell_resolution * cell.y, settings.cell_resolution, settings.cell_resolution);
    },
    animate: function (cell, target, settings) {
      var step = settings.step;
      if (cell.direction == 1) cell.opacity += step * cell.speed;
      if (cell.direction == -1) cell.opacity -= step * cell.speed;
      var o = cell.opacity;
      if (o < 0) (o = 0), (cell.direction = 1);
      if (o > 1) (o = 1), (cell.direction = -1);
      target.fillStyle = ["rgba(", settings.red, ",", settings.green, ",", settings.blue, ",", o / 16, ")"].join("");
      target.fillRect(settings.cell_resolution * cell.x, settings.cell_resolution * cell.y, settings.cell_resolution, settings.cell_resolution);
      var fs = ["rgba(", settings.red, ",", settings.green, ",", settings.blue, ",", 1, ")"].join("");
      target.fillStyle = fs;
      target.fillRect(settings.cell_resolution * cell.x, settings.cell_resolution * cell.y, settings.point_resolution, settings.point_resolution);
    },
  };
  var prep = function (target, settings) {
    var x = settings.cells_per_row;
    while (x--) {
      var y = settings.cells_per_column;
      while (y--) {
        render.fill(settings.model[x][y], target, settings);
        render.border(settings.model[x][y], target, settings);
        render.point(settings.model[x][y], target, settings);
      }
    }

    function looper() {
      var canvas = settings.canvas,
        c = canvas.getContext("2d");

      // console.log({ "looping": true });

      if (!canvas.isConnected) {
        temp_resize_switch = false;
        clearInterval(fps.looper);
        // console.log({ "canvas.isConnected": canvas.isConnected });
        return false;
      }
      c.canvas.width = settings.resolution.width;
      c.canvas.height = settings.resolution.height;
      var x = settings.cells_per_row;
      while (x--) {
        var y = settings.cells_per_column;
        while (y--) {
          render.animate(settings.model[x][y], c, settings);
          render.border(settings.model[x][y], c, settings);
        }
      }
    }
    if (settings.refresh) {
      var fps = {
        looper: setInterval(looper, settings.refresh),
        settings: settings,
        startTime: 0,
        frameNumber: 0,
        getFPS: function () {
          this.frameNumber++;
          var d = new Date().getTime(),
            currentTime = (d - this.startTime) / 1000,
            result = Math.floor(this.frameNumber / currentTime);
          if (currentTime > 1) {
            this.startTime = new Date().getTime();
            this.frameNumber = 0;
          }
          return result;
        },
      };

      function fps_shim() {
        var score = fps.getFPS();
        if (score && score < 20) {
          fps.settings.refresh = (fps.settings.refresh | 0) + 1;
          clearInterval(fps.looper);
          fps.looper = setInterval(looper, settings.refresh);
        }
      }
      fps_shim();
      requestAnimationFrame(fps_shim);
      return fps;
    }
  };
  var local_settings = null;
  var resize_handler_set = false;

  window.draw = function draw(settings) {
    var temp_resize_switch = true;
    var offset;

    function resize_callback() {
      temp_resize_switch = true;
      clearTimeout(offset);
      requestAnimationFrame(function () {
        offset = setTimeout(function () {
          local_settings.target.innerHTML = "";
          window.draw(local_settings);
        }, local_settings.refresh);
      });
    }

    if (settings == void 0) {
      throw Error("No settings for grid");
    }
    var canvas = document.createElement("CANVAS"),
      context = canvas.getContext("2d");
    if (settings.shade) {
      settings.red = settings.shade;
      settings.green = settings.shade;
      settings.blue = settings.shade;
    }
    if (!settings.red) settings.red = 0;
    if (!settings.green) settings.green = 0;
    if (!settings.blue) settings.blue = 0;
    settings.resolution = {
      width: settings.target.offsetWidth,
      height: settings.target.offsetHeight,
    };
    if (settings.id) {
      canvas.id = settings.id;
    }
    settings.canvas = canvas;
    context.canvas.width = settings.resolution.width;
    context.canvas.height = settings.resolution.height;
    local_settings = JSON.parse(JSON.stringify(settings));
    local_settings.target = settings.target;

    if (!resize_handler_set) {
      resize_handler_set = true;
      window.addEventListener("resize", resize_callback);
    }
    //  ==> insertion point
    if (settings.target.children[0]) {
      settings.target.insertBefore(settings.canvas, settings.target.children[0]);
    } else {
      settings.target.appendChild(settings.canvas);
    }
    settings.cells_per_row = Math.ceil(settings.target.offsetWidth / settings.cell_resolution);
    settings.cells_per_column = Math.ceil(settings.target.offsetHeight / settings.cell_resolution);
    settings.total_cell_count = settings.cells_per_row * settings.cells_per_column;
    settings.model = [];
    var x = -1; //  row
    var i = -1; //  index
    while (++x < settings.cells_per_row) {
      var y = -1; //  column (actual cell)
      var row = [];
      while (++y < settings.cells_per_column) {
        var o = Math.random();
        row.push(
          new Cell({
            opacity: 0,
            x: x,
            y: y,
            index: ++i,
            direction: 1,
            speed: o,
          }),
        );
      }
      settings.model.push(row);
    }
    temp_resize_switch && prep(context, settings);
    //  <== out
  };
})();
