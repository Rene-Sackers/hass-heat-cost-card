const { src, dest, watch } = require("gulp");
const terser = require("gulp-terser");
const rename = require("gulp-rename");

function minify() {
  return src("src/heat-cost-card.js")
    .pipe(terser())
    .pipe(rename({ suffix: ".min" }))
    .pipe(dest("dist"));
}

exports.minify = minify;
exports.watch = () => watch("src/*.js", minify);
exports.default = minify;
