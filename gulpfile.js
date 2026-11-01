const { src, dest, watch } = require("gulp");
const terser = require("gulp-terser");

function minify() {
  return src("src/heat-cost-card.js").pipe(terser()).pipe(dest("dist"));
}

exports.minify = minify;
exports.watch = () => watch("src/*.js", minify);
exports.default = minify;
