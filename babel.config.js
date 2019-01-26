const babelConfig = {
  presets: ["@babel/preset-env"]
};

module.exports = babel => {
  babel.cache.never();
  return babelConfig;
};
