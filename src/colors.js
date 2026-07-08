// 最大30件の正規表現に対して視認性の高い色を割り当てるための固定パレット。
// 色相を均等に分散させ、彩度・明度を固定して読みやすさを揃える。
(function () {
  const MAX_PATTERNS = 30;
  // 最初の10件は36度間隔（最大限離れた色相）を割り当て、
  // 11件目以降はその隙間を段階的に埋めていくため、後半ほど近い色相になる。
  const colors = [];
  for (let i = 0; i < MAX_PATTERNS; i++) {
    let hue, lightness;
    if (i < 10) {
      hue = 36 * i;
      lightness = 72;
    } else if (i < 20) {
      hue = 36 * (i - 10) + 18;
      lightness = 60;
    } else {
      hue = 36 * (i - 20) + 9;
      lightness = 84;
    }
    colors.push(`hsl(${hue}, 85%, ${lightness}%)`);
  }
  window.REGEX_COLORS = colors;
  window.REGEX_MAX_PATTERNS = MAX_PATTERNS;
})();
